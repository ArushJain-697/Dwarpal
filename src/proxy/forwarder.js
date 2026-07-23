/**
 * The forwarder — the terminal step of the proxy.
 *
 * Opens a request to the chosen upstream and streams both directions with
 * .pipe() so bodies are never fully buffered. On a connection-level failure it
 * retries onto a different healthy target (see retry policy) as long as nothing
 * has been sent to the client yet. A per-attempt timeout guards against a
 * backend that accepts the connection but never responds.
 */

import http from 'node:http';
import { config } from '../config/env.js';
import { pickTarget } from './balancer.js';
import { onSuccess, onFailure } from './breaker.js';
import { canRetry, RETRYABLE_METHODS } from './retry.js';

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
  attempt(ctx, new Set(), 1);
}

function attempt(ctx, tried, attemptNo) {
  const { req, res } = ctx;
  const target = ctx.upstream;
  tried.add(target);

  const upstream = new URL(target);
  let settled = false; // this attempt has produced a response or a failure

  const options = {
    protocol: upstream.protocol,
    hostname: upstream.hostname,
    port: upstream.port,
    method: req.method,
    path: req.url,
    timeout: config.upstreamTimeoutMs,
    headers: {
      ...sanitizeHeaders(req.headers),
      host: upstream.host,
      'x-forwarded-for': req.socket.remoteAddress,
      'x-forwarded-proto': 'http',
    },
  };

  const proxyReq = http.request(options, (upstreamRes) => {
    settled = true;
    onSuccess(target); // got a response — the target is alive
    res.writeHead(upstreamRes.statusCode ?? 502, sanitizeHeaders(upstreamRes.headers));
    upstreamRes.pipe(res);
  });

  const fail = (reason) => {
    if (settled) return;
    settled = true;
    onFailure(target);
    console.error(`[forward] ${target} failed on attempt ${attemptNo}: ${reason}`);

    if (canRetry(req.method, attemptNo, config.maxRetries, res.headersSent)) {
      const next = pickTarget(ctx.route, tried);
      if (next) {
        ctx.upstream = next;
        return attempt(ctx, tried, attemptNo + 1);
      }
    }

    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'text/plain' });
    }
    res.end('dwarpal: bad gateway\n');
  };

  proxyReq.on('error', (err) => fail(err.message));
  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    fail('timeout');
  });

  // Client hung up before we finished — tear down the upstream request.
  req.on('aborted', () => proxyReq.destroy());

  // Retryable methods are bodyless, so we don't pipe (keeps retries clean).
  // Everything else streams its body up to the backend.
  if (RETRYABLE_METHODS.has(req.method)) {
    proxyReq.end();
  } else {
    req.pipe(proxyReq);
  }
}
