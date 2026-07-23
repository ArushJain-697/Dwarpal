/**
 * Batched async log writer.
 *
 * This is the "logging never slows the hot path" mechanism. The finalizer calls
 * enqueue() — O(1), never awaits. A background timer (and a row-count trigger)
 * flushes the buffer to request_logs with a single multi-row INSERT.
 *
 * Design rules:
 *   - Bounded buffer, drop-OLDEST on overflow = load shedding, never OOM.
 *   - A `flushing` guard prevents overlapping flushes.
 *   - Never rethrow into the hot path: if Postgres is down, log loudly, drop the
 *     batch, and keep serving traffic.
 *   - Flush on SIGTERM so the last batch isn't lost.
 */

import { getPool } from '../db/pool.js';
import { config } from '../config/env.js';

const COLUMNS = [
  'req_id',
  'ts',
  'client_ip',
  'method',
  'path',
  'upstream',
  'status',
  'duration_ms',
  'decision',
  'rule_id',
  'category',
  'anomaly',
];

let pool = null;
let buffer = [];
let dropped = 0;
let flushing = false;
let timer = null;

export function getDropped() {
  return dropped;
}

function normalizeIp(ip) {
  if (!ip) return null;
  // Node reports IPv4 over IPv6 as ::ffff:1.2.3.4 — store the plain IPv4.
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function toRow(r) {
  return [
    r.id,
    new Date(r.ts).toISOString(),
    normalizeIp(r.clientIp),
    r.method,
    r.path,
    r.upstream ?? null,
    r.status,
    Math.round(r.durationMs ?? 0),
    r.decision,
    r.ruleId ?? null,
    r.category ?? null,
    r.anomaly ?? 0,
  ];
}

async function insertBatch(rows) {
  const width = COLUMNS.length;
  const params = [];
  const tuples = rows.map((r, i) => {
    const cols = toRow(r);
    params.push(...cols);
    const base = i * width;
    const placeholders = cols.map((_, j) => `$${base + j + 1}`);
    return `(${placeholders.join(',')})`;
  });

  const sql = `INSERT INTO request_logs (${COLUMNS.join(',')}) VALUES ${tuples.join(',')}`;
  await pool.query(sql, params);
}

async function flush() {
  if (flushing || buffer.length === 0 || !pool) return;
  flushing = true;

  const batch = buffer;
  buffer = [];
  try {
    await insertBatch(batch);
  } catch (err) {
    // Never let a DB problem reach the hot path — drop and keep serving.
    dropped += batch.length;
    console.error(`[logwriter] flush failed, dropped ${batch.length}: ${err.message}`);
  } finally {
    flushing = false;
  }
}

export function enqueue(record) {
  if (!pool) return; // no database configured — logs stay console-only

  if (buffer.length >= config.logBufferMax) {
    buffer.shift(); // drop oldest under overload
    dropped += 1;
  }
  buffer.push(record);

  if (buffer.length >= config.logFlushN) {
    flush();
  }
}

export function startLogWriter() {
  pool = getPool();
  if (!pool) {
    console.log('[logwriter] DATABASE_URL not set — request logs stay console-only');
    return;
  }

  timer = setInterval(flush, config.logFlushMs);
  timer.unref();

  // Final flush on shutdown so the last batch isn't lost.
  const finalFlush = () => flush();
  process.on('SIGTERM', finalFlush);
  process.on('SIGINT', finalFlush);

  console.log('[logwriter] started');
}
