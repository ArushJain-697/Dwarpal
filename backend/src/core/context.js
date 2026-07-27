/**
 * The per-request context.
 *
 * One object is created per request and threaded through every stage of the
 * pipeline. Stages read from it and write their results back onto it, so the
 * shape stays fixed while behaviour grows.
 */

import crypto from 'node:crypto';

export function createContext(req, res) {
  let path = '/';
  let query = new URLSearchParams();
  let rawQuery = '';
  try {
    const url = new URL(req.url, 'http://localhost');
    path = url.pathname;
    query = url.searchParams;
    rawQuery = url.search; // the raw, still-encoded "?..." — used by the WAF
  } catch {
    // Malformed request target (e.g. absolute-form with an out-of-range port).
    // Never throw here — this runs before the pipeline, so a throw would crash
    // the whole process. Keep the raw target as the path so it 404s instead.
    path = req.url ?? '/';
  }

  return {
    id: crypto.randomUUID(),
    startedAt: process.hrtime.bigint(),

    req,
    res,

    method: req.method,
    path,
    query,
    rawQuery,
    headers: req.headers,
    clientIp: req.socket.remoteAddress,
  };
}
