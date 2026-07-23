/**
 * The proxy HTTP server.
 *
 * Right now every request just gets a placeholder response so we can prove
 * the server listens and handles traffic. Forwarding to the upstream comes
 * in the next step.
 */

import http from 'node:http';
import { config } from './config.js';

function handleRequest(req, res) {
  console.log(`[proxy] ${req.method} ${req.url}`);

  res.writeHead(200, { 'content-type': 'text/plain' });
  res.end('dwarpal: request received\n');
}

export function createServer() {
  const server = http.createServer(handleRequest);
  return server;
}

export function startServer() {
  const server = createServer();

  server.listen(config.proxyPort, () => {
    console.log(`[proxy] listening on http://localhost:${config.proxyPort}`);
  });

  return server;
}
