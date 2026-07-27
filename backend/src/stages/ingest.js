/**
 * Ingest stage — the first line of request validation.
 *
 * Rejects malformed or hostile requests before they reach the rate limiter,
 * WAF, or upstream:
 *
 *   - method not in the allow-list        -> 405
 *   - both Content-Length and Transfer-Encoding present (request smuggling) -> 400
 *   - too many headers                     -> 431
 */

import { config } from '../config/env.js';
import { shortCircuit } from '../core/verdict.js';

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']);
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Buffer the body up to `max`, keep draining past that so the socket stays
// clean, and report `over` if the cap was exceeded.
function readBody(req, max) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size <= max) chunks.push(c);
    });
    req.on('end', () => resolve({ buf: size > max ? null : Buffer.concat(chunks), over: size > max }));
    req.on('error', () => resolve({ buf: null, over: size > max }));
  });
}

export const ingestStage = {
  name: 'ingest',
  async handle(ctx) {
    const { req } = ctx;

    if (!ALLOWED_METHODS.has(ctx.method)) {
      return shortCircuit(ctx, 405, 'method not allowed');
    }

    // Conflicting framing is the classic request-smuggling vector — reject it
    // outright rather than guess which length is authoritative.
    if (
      req.headers['content-length'] !== undefined &&
      req.headers['transfer-encoding'] !== undefined
    ) {
      return shortCircuit(ctx, 400, 'bad request');
    }

    // rawHeaders is a flat [name, value, name, value, ...] array.
    if (req.rawHeaders.length / 2 > config.maxHeaderCount) {
      return shortCircuit(ctx, 431, 'too many headers');
    }

    // Reject oversized bodies up front when Content-Length is present.
    const cl = Number(req.headers['content-length']);
    if (Number.isFinite(cl) && cl > config.maxBodyBytes) {
      return shortCircuit(ctx, 413, 'payload too large');
    }

    // Buffer the body (capped) so the WAF can inspect it and the forwarder can
    // replay it upstream. Over the cap -> 413.
    if (BODY_METHODS.has(ctx.method)) {
      const { buf, over } = await readBody(req, config.maxBodyBytes);
      if (over) return shortCircuit(ctx, 413, 'payload too large');
      if (buf && buf.length) {
        ctx.body = buf;
        ctx.bodyText = buf.toString('utf8');
      }
    }

    return { type: 'continue' };
  },
};
