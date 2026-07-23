/**
 * In-memory metrics.
 *
 * Cheap counters and a rolling requests-per-second window, updated once per
 * request from the finalizer. No external dependency — the admin /metrics
 * endpoint and the dashboard both read from here. (prom-client can replace the
 * internals later without changing callers.)
 */

const RPS_WINDOW = 60; // seconds of history to keep

const counters = {
  requestsTotal: 0,
  blocksTotal: 0,
  rateLimitedTotal: 0,
  byCategory: {}, // sqli/xss/... -> count
  byStatusClass: {}, // '2xx'/'4xx'/'5xx' -> count
};

// One slot per second, indexed by unix-second % RPS_WINDOW.
const rps = new Array(RPS_WINDOW).fill(null).map(() => ({ sec: 0, count: 0 }));

function statusClass(status) {
  return `${Math.floor(status / 100)}xx`;
}

function bump(map, key) {
  map[key] = (map[key] ?? 0) + 1;
}

export function recordRequest(record) {
  counters.requestsTotal += 1;
  bump(counters.byStatusClass, statusClass(record.status));

  if (record.decision === 'block') {
    counters.blocksTotal += 1;
    if (record.category) bump(counters.byCategory, record.category);
  } else if (record.decision === 'ratelimit') {
    counters.rateLimitedTotal += 1;
  }

  const sec = Math.floor(Date.now() / 1000);
  const slot = rps[sec % RPS_WINDOW];
  if (slot.sec !== sec) {
    slot.sec = sec; // stale slot from a previous minute — reset it
    slot.count = 0;
  }
  slot.count += 1;
}

// Requests per second over the last `seconds` slots (default 10).
export function currentRps(seconds = 10) {
  const now = Math.floor(Date.now() / 1000);
  let total = 0;
  for (let i = 0; i < seconds; i++) {
    const slot = rps[(now - i) % RPS_WINDOW];
    if (slot.sec === now - i) total += slot.count;
  }
  return total / seconds;
}

export function snapshot() {
  return {
    requestsTotal: counters.requestsTotal,
    blocksTotal: counters.blocksTotal,
    rateLimitedTotal: counters.rateLimitedTotal,
    byCategory: { ...counters.byCategory },
    byStatusClass: { ...counters.byStatusClass },
    rps: Number(currentRps().toFixed(2)),
  };
}
