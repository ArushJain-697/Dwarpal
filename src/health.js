/**
 * Backend health checks with hysteresis.
 *
 * A background timer probes each backend's /healthz. To avoid flapping, a
 * target only flips state after a run of consecutive results:
 *
 *   healthy  -> unhealthy   after `unhealthyAfter` consecutive failures
 *   unhealthy -> healthy     after `healthyAfter` consecutive successes
 *
 * Targets start healthy so a fresh boot doesn't 503 before the first probe.
 */

import http from 'node:http';

// url -> { healthy, ups, downs }
const state = new Map();

let thresholds = { healthyAfter: 2, unhealthyAfter: 3 };

function entryFor(url) {
  let e = state.get(url);
  if (!e) {
    e = { healthy: true, ups: 0, downs: 0 };
    state.set(url, e);
  }
  return e;
}

export function isHealthy(url) {
  const e = state.get(url);
  return e ? e.healthy : true;
}

function recordSuccess(url) {
  const e = entryFor(url);
  e.ups += 1;
  e.downs = 0;
  if (!e.healthy && e.ups >= thresholds.healthyAfter) {
    e.healthy = true;
    console.log(`[health] ${url} is UP`);
  }
}

function recordFailure(url) {
  const e = entryFor(url);
  e.downs += 1;
  e.ups = 0;
  if (e.healthy && e.downs >= thresholds.unhealthyAfter) {
    e.healthy = false;
    console.log(`[health] ${url} is DOWN`);
  }
}

function probe(url) {
  const target = new URL(url);
  const req = http.request(
    {
      hostname: target.hostname,
      port: target.port,
      path: '/healthz',
      method: 'GET',
      timeout: 2000,
    },
    (res) => {
      if (res.statusCode === 200) recordSuccess(url);
      else recordFailure(url);
      res.resume();
    },
  );

  req.on('error', () => recordFailure(url));
  req.on('timeout', () => {
    req.destroy();
    recordFailure(url);
  });
  req.end();
}

export function startHealthChecks(pools, options) {
  const { intervalMs, healthyAfter, unhealthyAfter } = options;
  thresholds = { healthyAfter, unhealthyAfter };

  const targets = [...new Set(pools.flat())];

  const runAll = () => targets.forEach(probe);
  runAll();

  const timer = setInterval(runAll, intervalMs);
  timer.unref();
  return timer;
}
