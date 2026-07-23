/**
 * The admin server (control plane).
 *
 * Runs on its own port, separate from the proxy data plane, so control-plane
 * traffic (metrics, health, the WAF toggle, later config reads) never shares
 * the hot path.
 */

import http from 'node:http';
import { config } from '../config/env.js';
import { snapshot } from '../obs/metrics.js';
import { getWafMode, setWafMode } from '../config/settings.js';
import { attachWebSocket } from './ws.js';

const WAF_MODES = ['off', 'detect', 'block'];

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
  if (req.method === 'GET' && req.url === '/metrics') {
    return sendJson(res, 200, snapshot());
  }

  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('ok\n');
  }

  if (req.method === 'GET' && req.url === '/api/settings/waf') {
    return sendJson(res, 200, { mode: getWafMode() });
  }

  if (req.method === 'PUT' && req.url === '/api/settings/waf') {
    let parsed;
    try {
      parsed = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'invalid json' });
    }
    if (!WAF_MODES.includes(parsed.mode)) {
      return sendJson(res, 400, { error: `mode must be one of ${WAF_MODES.join(', ')}` });
    }
    setWafMode(parsed.mode);
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
