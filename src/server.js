/**
 * The proxy HTTP server.
 *
 * Every request is forwarded to the configured upstream and the response is
 * streamed back to the client.
 */

import http from 'node:http';
import { config } from './config.js';
import { forward } from './forwarder.js';

function handleRequest(req, res) {
  console.log(`[proxy] ${req.method} ${req.url}`);
  forward(req, res);
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
