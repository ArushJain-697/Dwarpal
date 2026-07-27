/**
 * The admin server (control plane).
 *
 * Runs on its own port, separate from the proxy data plane, so control-plane
 * traffic (metrics, health, the WAF toggle, later config reads) never shares
 * the hot path.
 */

import http from 'node:http';
import { config, WAF_MODES } from '../config/env.js';
import { snapshot } from '../obs/metrics.js';
import { getRecent } from '../obs/recentLog.js';
import { queryLogs } from '../db/logsQuery.js';
import { queryAnalytics } from '../db/analyticsQuery.js';
import { RULES } from '../waf/rules.js';
import { getWafMode, setWafMode } from '../config/settings.js';
import { publishConfig } from '../redis/pubsub.js';
import { getPool } from '../db/pool.js';
import { getRedis } from '../redis/client.js';
import { attachWebSocket } from './ws.js';

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Playground attacks: one crafted request per class, plus a benign lookalike.
// Values are URL-encoded before sending, but the WAF decodes-until-stable, so
// they still trip the ruleset (verified against the live proxy).
const PLAYGROUND_ATTACKS = {
  sqli: { param: 'q', value: "1' OR '1'='1", label: 'SQL injection' },
  xss: { param: 'q', value: '<script>alert(1)</script>', label: 'Cross-site scripting' },
  traversal: { param: 'file', value: '../../etc/passwd', label: 'Path traversal' },
  cmdi: { param: 'cmd', value: '; cat /etc/passwd', label: 'Command injection' },
  ssrf: { param: 'url', value: 'http://127.0.0.1/', label: 'SSRF' },
  benign: { param: 'q', value: 'hello world', label: 'Benign request' },
};

function attackPath(a) {
  return `/api/a/?${a.param}=${encodeURIComponent(a.value)}`;
}

// Fire one real GET through the proxy's own port — so it runs the whole pipeline
// (rate-limit, WAF, route, forward), gets logged, and shows up in the live feed.
function fireAtProxy(reqPath) {
  return new Promise((resolve) => {
    const r = http.request(
      { host: '127.0.0.1', port: config.proxyPort, method: 'GET', path: reqPath, headers: { 'x-dwarpal-playground': '1' } },
      (proxyRes) => {
        let body = '';
        proxyRes.on('data', (c) => { if (body.length < 400) body += c; });
        proxyRes.on('end', () => resolve({ status: proxyRes.statusCode, body: body.slice(0, 240) }));
      },
    );
    r.on('error', (e) => resolve({ status: 0, body: e.message }));
    r.setTimeout(4000, () => { r.destroy(); resolve({ status: 0, body: 'timeout' }); });
    r.end();
  });
}

function verdictFor(status) {
  if (status === 403) return 'blocked';
  if (status === 429) return 'ratelimited';
  if (status >= 200 && status < 400) return 'passed';
  return 'error';
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) req.destroy(); // guard against huge bodies
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  // The dashboard is served from a different origin (port), so allow CORS.
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, PUT, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'GET' && path === '/metrics') {
    return sendJson(res, 200, snapshot());
  }

  if (req.method === 'GET' && path === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok\n');
  }

  // Readiness: dependencies reachable? For an orchestrator/LB to gate traffic.
  if (req.method === 'GET' && path === '/readyz') {
    const pool = getPool();
    const redis = getRedis();
    let dbOk = true;
    let redisOk = true;
    if (pool) {
      try {
        await pool.query('SELECT 1');
      } catch {
        dbOk = false;
      }
    }
    if (redis) redisOk = redis.status === 'ready';
    const ready = dbOk && redisOk;
    return sendJson(res, ready ? 200 : 503, { ready, dbOk, redisOk });
  }

  if (req.method === 'GET' && path === '/api/logs') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 200);
    const decision = url.searchParams.get('decision');
    const category = url.searchParams.get('category');
    const beforeTs = url.searchParams.get('before_ts');
    const beforeId = url.searchParams.get('before_id');

    const rows = await queryLogs({ limit, decision, category, beforeTs, beforeId });
    if (rows === null) {
      // No database configured — fall back to the in-memory ring buffer.
      return sendJson(res, 200, { logs: getRecent({ limit, decision }), source: 'memory' });
    }

    const last = rows[rows.length - 1];
    const nextCursor = last ? { ts: last.ts, id: last.id } : null;
    return sendJson(res, 200, { logs: rows, nextCursor, source: 'postgres' });
  }

  // Playground: fire a real attack (or a benign request) at the proxy so a
  // student can test the WAF from the browser — no terminal, no sqlmap.
  if (req.method === 'GET' && path === '/api/playground') {
    const key = url.searchParams.get('attack') || 'sqli';

    if (key === 'flood') {
      // Burst past the rate-limit bucket so the limiter (429s) kicks in.
      const N = 150;
      const results = await Promise.all(Array.from({ length: N }, () => fireAtProxy('/api/a/?q=flood')));
      const ratelimited = results.filter((r) => r.status === 429).length;
      const passed = results.filter((r) => r.status === 200).length;
      return sendJson(res, 200, {
        attack: 'flood',
        label: 'Rapid-fire flood',
        request: { method: 'GET', path: `${N}× /api/a/` },
        sent: N,
        ratelimited,
        passed,
        verdict: ratelimited > 0 ? 'ratelimited' : 'passed',
        body: `${ratelimited} of ${N} requests rate-limited (429), ${passed} passed`,
      });
    }

    // A payload the student typed themselves — fire it as ?q=<value> and let the
    // WAF judge it. Lets them experiment ("what if I try...?").
    if (key === 'custom') {
      const value = (url.searchParams.get('value') || '').slice(0, 300);
      if (!value.trim()) return sendJson(res, 400, { error: 'empty payload' });
      const reqPath = `/api/a/?q=${encodeURIComponent(value)}`;
      const { status, body } = await fireAtProxy(reqPath);
      return sendJson(res, 200, {
        attack: 'custom',
        label: `Custom · ${value.slice(0, 44)}`,
        request: { method: 'GET', path: reqPath },
        status,
        verdict: verdictFor(status),
        body,
      });
    }

    const a = PLAYGROUND_ATTACKS[key];
    if (!a) return sendJson(res, 400, { error: 'unknown attack' });
    const reqPath = attackPath(a);
    const { status, body } = await fireAtProxy(reqPath);
    let verdict = verdictFor(status);
    // In detect mode an attack is scored + logged but let through (200). Say so,
    // instead of a bare "passed" that looks identical to WAF-off.
    if (verdict === 'passed' && key !== 'benign' && getWafMode() === 'detect') {
      verdict = 'detected';
    }
    return sendJson(res, 200, {
      attack: key,
      label: a.label,
      request: { method: 'GET', path: reqPath },
      status,
      verdict,
      body,
    });
  }

  // Time-bucketed traffic + block breakdowns for the analytics page.
  if (req.method === 'GET' && path === '/api/analytics') {
    const range = url.searchParams.get('range') || '24h';
    const data = await queryAnalytics(range);
    if (data === null) {
      // No database — analytics has no history to aggregate.
      return sendJson(res, 200, { range, bucket: 'hour', series: [], topIps: [], byCategory: {}, byStatus: {}, source: 'memory' });
    }
    return sendJson(res, 200, { ...data, source: 'postgres' });
  }

  // The active ruleset (patterns stripped) + the score threshold, for the rules page.
  if (req.method === 'GET' && path === '/api/rules') {
    const threshold = config.wafThreshold;
    const rules = RULES.map((r) => ({
      id: r.id,
      category: r.category,
      score: r.score,
      blocksAlone: r.score >= threshold,
    }));
    return sendJson(res, 200, { mode: getWafMode(), threshold, rules });
  }

  if (req.method === 'GET' && path === '/api/settings/waf') {
    return sendJson(res, 200, { mode: getWafMode() });
  }

  if (req.method === 'PUT' && path === '/api/settings/waf') {
    let parsed;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    if (!WAF_MODES.includes(parsed.mode)) {
      return sendJson(res, 400, { error: `mode must be one of ${WAF_MODES.join(', ')}` });
    }
    setWafMode(parsed.mode); // apply locally right away
    publishConfig({ wafMode: parsed.mode }); // and tell the other instances
    console.log(`[admin] waf mode set to ${parsed.mode}`);
    return sendJson(res, 200, { mode: parsed.mode });
  }

  return sendJson(res, 404, { error: 'not found' });
}

export function createAdminServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      console.error(`[admin] error: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    });
  });
}

export function startAdminServer() {
  const server = createAdminServer();
  attachWebSocket(server); // live dashboard feed on /ws
  server.listen(config.adminPort, () => {
    console.log(`[admin] listening on http://localhost:${config.adminPort}`);
  });
  return server;
}
