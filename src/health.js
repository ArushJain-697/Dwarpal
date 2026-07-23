/**
 * Backend health checks.
 *
 * A background timer probes each backend's /healthz. The balancer asks
 * isHealthy() before routing to a target, so a backend that goes down stops
 * receiving traffic until it recovers.
 *
 * A target is treated as healthy until proven otherwise, so a fresh boot
 * doesn't 503 everything before the first probe lands.
 */

import http from 'node:http';

// url -> boolean. Missing entry means "not yet checked" -> assume healthy.
const state = new Map();

export function isHealthy(url) {
  return state.get(url) !== false;
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
      state.set(url, res.statusCode === 200);
      res.resume(); // drain and free the socket
    },
  );

  req.on('error', () => state.set(url, false));
  req.on('timeout', () => {
    req.destroy();
    state.set(url, false);
  });
  req.end();
}

export function startHealthChecks(pools, intervalMs) {
  const targets = [...new Set(pools.flat())];

  const runAll = () => targets.forEach(probe);
  runAll(); // probe once immediately

  const timer = setInterval(runAll, intervalMs);
  timer.unref(); // don't keep the process alive just for probes
  return timer;
}
