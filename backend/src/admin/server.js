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
import { getWafMode, setWafMode } from '../config/settings.js';
import { publishConfig } from '../redis/pubsub.js';
import { getPool } from '../db/pool.js';
import { getRedis } from '../redis/client.js';
import { attachWebSocket } from './ws.js';

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
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
