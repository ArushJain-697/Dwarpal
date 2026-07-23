/**
 * The forwarder — the terminal step of the proxy.
 *
 * Takes an incoming request, opens a matching request to the upstream, and
 * streams both directions with .pipe() so bodies are never fully buffered.
 */

import http from 'node:http';

// Hop-by-hop headers must not be forwarded by a proxy (RFC 7230).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function sanitizeHeaders(headers) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (!HOP_BY_HOP.has(name.toLowerCase())) {
      out[name] = value;
    }
  }
  return out;
}

export function forward(ctx) {
  const { req, res } = ctx;
  const upstream = new URL(ctx.upstream);

  const options = {
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: req.method,
    path: req.url,
    headers: {
      ...sanitizeHeaders(req.headers),
      host: upstream.host,
      'x-forwarded-for': req.socket.remoteAddress,
      'x-forwarded-proto': 'http',
    },
  };

  const proxyReq = http.request(options, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, sanitizeHeaders(upstreamRes.headers));
    upstreamRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[forward] upstream error: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain' });
    }
    res.end('dwarpal: bad gateway\n');
  });

  // Client hung up before we finished — tear down the upstream request.
  req.on('aborted', () => proxyReq.destroy());

  // Stream the request body up to the backend.
  req.pipe(proxyReq);
}
