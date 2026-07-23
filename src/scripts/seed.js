/**
 * Seed the database with ~24h of realistic history.
 *
 * The demo should never open on an empty dashboard. This lays down a day of
 * mostly-benign traffic with a sprinkle of blocks, plus a concentrated attack
 * spike a couple of hours ago so there's an obvious event to point at.
 *
 * Idempotent: it truncates request_logs first, so re-running gives a clean set.
 *
 *   node src/scripts/seed.js   (or: make seed)
 */

import crypto from 'node:crypto';
import { getPool, closePool } from '../db/pool.js';

const CATEGORIES = ['sqli', 'xss', 'traversal', 'cmdi', 'ssrf'];
const PATHS = ['/api/a/users', '/api/a/search', '/api/b/orders', '/api/a/profile'];
const UPSTREAMS = ['http://backend-a1:9001', 'http://backend-a2:9001', 'http://backend-b:9001'];

const DAY_MS = 24 * 60 * 60 * 1000;

function randInt(n) {
  return Math.floor(Math.random() * n);
}

function pick(arr) {
  return arr[randInt(arr.length)];
}

function randomIp() {
  return `${1 + randInt(223)}.${randInt(256)}.${randInt(256)}.${1 + randInt(254)}`;
}

function ruleFor(category) {
  return { sqli: 'sqli-union', xss: 'xss-script-tag', traversal: 'traversal-dotdot', cmdi: 'cmdi-chained-cmd', ssrf: 'ssrf-metadata-ip' }[category];
}

function makeRow(ts, decision, category = null) {
  const status = decision === 'block' ? 403 : decision === 'ratelimit' ? 429 : 200;
  return {
    id: crypto.randomUUID(),
    ts,
    clientIp: randomIp(),
    method: 'GET',
    path: pick(PATHS),
    upstream: decision === 'allow' ? pick(UPSTREAMS) : null,
    status,
    durationMs: decision === 'allow' ? +(2 + Math.random() * 20).toFixed(1) : +(0.3 + Math.random() * 2).toFixed(1),
    decision,
    ruleId: decision === 'block' ? ruleFor(category) : null,
    category: decision === 'block' ? category : null,
    anomaly: decision === 'block' ? 5 + randInt(6) : 0,
  };
}

function buildRows() {
  const now = Date.now();
  const rows = [];

  // Baseline: spread over the last 24h, mostly benign.
  for (let i = 0; i < 4000; i++) {
    const ts = now - Math.random() * DAY_MS;
    const r = Math.random();
    if (r < 0.9) rows.push(makeRow(ts, 'allow'));
    else if (r < 0.96) rows.push(makeRow(ts, 'block', pick(CATEGORIES)));
    else rows.push(makeRow(ts, 'ratelimit'));
  }

  // Attack spike: a dense ~20 minute window about 2 hours ago.
  const spikeStart = now - 2 * 60 * 60 * 1000;
  for (let i = 0; i < 900; i++) {
    const ts = spikeStart + Math.random() * 20 * 60 * 1000;
    const r = Math.random();
    if (r < 0.8) rows.push(makeRow(ts, 'block', pick(CATEGORIES)));
    else rows.push(makeRow(ts, 'ratelimit'));
  }

  return rows;
}

const COLUMNS = [
  'req_id', 'ts', 'client_ip', 'method', 'path', 'upstream',
  'status', 'duration_ms', 'decision', 'rule_id', 'category', 'anomaly',
];

function toParams(r) {
  return [
    r.id, new Date(r.ts).toISOString(), r.clientIp, r.method, r.path, r.upstream,
    r.status, Math.round(r.durationMs), r.decision, r.ruleId, r.category, r.anomaly,
  ];
}

async function insertChunk(pool, rows) {
  const width = COLUMNS.length;
  const params = [];
  const tuples = rows.map((r, i) => {
    const cols = toParams(r);
    params.push(...cols);
    const base = i * width;
    return `(${cols.map((_, j) => `$${base + j + 1}`).join(',')})`;
  });
  await pool.query(
    `INSERT INTO request_logs (${COLUMNS.join(',')}) VALUES ${tuples.join(',')}`,
    params,
  );
}

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error('[seed] DATABASE_URL not set');
    process.exit(1);
  }

  await pool.query('TRUNCATE request_logs');

  const rows = buildRows();
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await insertChunk(pool, rows.slice(i, i + CHUNK));
  }

  await closePool();
  console.log(`[seed] inserted ${rows.length} rows (with an attack spike ~2h ago)`);
}

main().catch((err) => {
  console.error(`[seed] failed: ${err.message}`);
  process.exit(1);
});
