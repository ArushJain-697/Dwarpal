/**
 * The per-request context.
 *
 * One object is created per request and threaded through every stage of the
 * pipeline. Stages read from it and write their results back onto it, so the
 * shape stays fixed while behaviour grows.
 */

import crypto from 'node:crypto';

export function createContext(req, res) {
  const url = new URL(req.url, 'http://localhost');

  return {
    id: crypto.randomUUID(),
    startedAt: process.hrtime.bigint(),

    req,
    res,

    method: req.method,
    path: url.pathname,
    query: url.searchParams,
    rawQuery: url.search, // the raw, still-encoded "?..." — used by the WAF
    headers: req.headers,
    clientIp: req.socket.remoteAddress,
  };
}
