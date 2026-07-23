/**
 * A tiny dummy backend for local testing.
 *
 * Echoes back what it received so we can confirm the proxy forwards method,
 * path, headers, and body correctly. Not part of the app — just a dev helper.
 *
 *   node dev/backend.js
 */

import http from 'node:http';

const PORT = process.env.BACKEND_PORT ?? 9001;

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        {
          backend: 'dummy',
          method: req.method,
          path: req.url,
          gotForwardedFor: req.headers['x-forwarded-for'] ?? null,
          body: body || null,
        },
        null,
        2,
      ) + '\n',
    );
  });
});

server.listen(PORT, () => {
  console.log(`[backend] dummy backend listening on http://localhost:${PORT}`);
});
