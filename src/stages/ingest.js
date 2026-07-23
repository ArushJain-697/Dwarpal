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

const ALLOWED_METHODS = new Set([
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
]);

function reject(ctx, status, message) {
  return {
    type: 'short_circuit',
    response: {
      status,
      headers: { 'content-type': 'text/plain' },
      body: `dwarpal: ${message} (id ${ctx.id})\n`,
    },
  };
}

export const ingestStage = {
  name: 'ingest',
  handle(ctx) {
    const { req } = ctx;

    if (!ALLOWED_METHODS.has(ctx.method)) {
      return reject(ctx, 405, 'method not allowed');
    }

    // Conflicting framing is the classic request-smuggling vector — reject it
    // outright rather than guess which length is authoritative.
    if (
      req.headers['content-length'] !== undefined &&
      req.headers['transfer-encoding'] !== undefined
    ) {
      return reject(ctx, 400, 'bad request');
    }

    // rawHeaders is a flat [name, value, name, value, ...] array.
    if (req.rawHeaders.length / 2 > config.maxHeaderCount) {
      return reject(ctx, 431, 'too many headers');
    }

    return { type: 'continue' };
  },
};
