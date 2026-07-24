/**
 * Integration test — the whole pipeline in-process against a stub upstream.
 *
 * The load-bearing assertion: a blocked SQLi returns 403 AND the stub upstream
 * records nothing. That proves the WAF is a GATE (it stops the request) and not
 * a bystander that logs after the fact. Also checks that benign traffic reaches
 * the upstream, the body streams back, and the rate limiter returns 429.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';

let stub;
let proxy;
let proxyPort;
let stubLastReq = null;

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

const url = (path) => `http://127.0.0.1:${proxyPort}${path}`;

beforeAll(async () => {
  // A stub upstream that records the last request it received.
  stub = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      stubLastReq = { method: req.method, url: req.url, body };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, echo: req.url }));
    });
  });
  const stubPort = await listen(stub);

  // Point both backends at the stub, and force block mode — BEFORE importing the
  // proxy so its config snapshot reads these values.
  process.env.BACKEND_A_URL = `http://127.0.0.1:${stubPort}`;
  process.env.BACKEND_B_URL = `http://127.0.0.1:${stubPort}`;
  process.env.WAF_MODE = 'block';
  process.env.LOG_LEVEL = 'error'; // keep request logs out of the test output
  delete process.env.DATABASE_URL; // no DB in the test
  delete process.env.REDIS_URL; // in-memory limiter

  const { createServer } = await import('../../src/proxy/server.js');
  const { configureLimiter } = await import('../../src/ratelimit/limiter.js');
  configureLimiter({ capacity: 20, refillPerSec: 0 }); // headroom, then exhaust at the end

  proxy = createServer();
  proxyPort = await listen(proxy);
});

afterAll(() => {
  proxy?.closeAllConnections?.();
  stub?.closeAllConnections?.();
  proxy?.close();
  stub?.close();
});

describe('proxy pipeline', () => {
  it('forwards a benign request to the upstream', async () => {
    stubLastReq = null;
    const res = await fetch(url('/api/a/users?id=42'));
    expect(res.status).toBe(200);
    expect(stubLastReq).not.toBeNull();
    expect(stubLastReq.url).toContain('id=42');
  });

  it('blocks a SQLi AND it never reaches the upstream', async () => {
    stubLastReq = null;
    const res = await fetch(url(`/api/a/users?id=${encodeURIComponent("1' OR '1'='1")}`));
    expect(res.status).toBe(403);
    expect(stubLastReq).toBeNull(); // <-- the WAF is a gate, not a logger-after-the-fact
  });

  it('streams the upstream response body back intact', async () => {
    const res = await fetch(url('/api/a/data'));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.echo).toContain('/api/a/data');
  });

  it('rate-limits with a 429 and a Retry-After header', async () => {
    let limited = null;
    for (let i = 0; i < 25; i++) {
      const res = await fetch(url(`/api/a/ok?n=${i}`));
      if (res.status === 429) {
        limited = res;
        break;
      }
    }
    expect(limited).not.toBeNull();
    expect(limited.headers.get('retry-after')).toBeTruthy();
    expect(limited.headers.get('ratelimit-limit')).toBe('20');
  });
});
