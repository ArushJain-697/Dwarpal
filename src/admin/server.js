/**
 * The admin server (control plane).
 *
 * Runs on its own port, separate from the proxy data plane, so control-plane
 * traffic (metrics, health, later config reads + WAF toggle) never shares the
 * hot path. For now it's read-only: metrics and a liveness check.
 */

import http from 'node:http';
import { config } from '../config/env.js';
import { snapshot } from '../obs/metrics.js';

function handle(req, res) {
  if (req.method === 'GET' && req.url === '/metrics') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(snapshot()));
    return;
  }

  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok\n');
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found\n');
}

export function createAdminServer() {
  return http.createServer(handle);
}

export function startAdminServer() {
  const server = createAdminServer();
  server.listen(config.adminPort, () => {
    console.log(`[admin] listening on http://localhost:${config.adminPort}`);
  });
  return server;
}
