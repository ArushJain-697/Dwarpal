/**
 * Configuration boundary.
 *
 * Reads process.env once at startup, applies defaults, validates, and hands
 * back a frozen config object. Nothing else in the app should touch
 * process.env directly — they import this instead.
 */

function required(value, name) {
  if (value === undefined || value === '') {
    console.error(`[config] missing required env var: ${name}`);
    process.exit(1);
  }
  return value;
}

function toInt(value, name) {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) {
    console.error(`[config] env var ${name} must be a number, got: ${value}`);
    process.exit(1);
  }
  return n;
}

function oneOf(value, name, allowed) {
  if (!allowed.includes(value)) {
    console.error(`[config] env var ${name} must be one of ${allowed.join(', ')}, got: ${value}`);
    process.exit(1);
  }
  return value;
}

// Parse a comma-separated list of upstream URLs into a clean array.
function toList(value, name) {
  const list = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (list.length === 0) {
    console.error(`[config] env var ${name} must have at least one URL`);
    process.exit(1);
  }
  return list;
}

function loadConfig(env = process.env) {
  const config = {
    // ports
    proxyPort: toInt(env.PROXY_PORT ?? '8080', 'PROXY_PORT'),
    adminPort: toInt(env.ADMIN_PORT ?? '3000', 'ADMIN_PORT'),

    // the backend pools we route to, by path prefix (comma-separated URLs)
    backendAPool: toList(env.BACKEND_A_URL ?? 'http://localhost:9001,http://localhost:9011', 'BACKEND_A_URL'),
    backendBPool: toList(env.BACKEND_B_URL ?? 'http://localhost:9002', 'BACKEND_B_URL'),

    // WAF behaviour: off = don't inspect, detect = log only, block = 403
    wafMode: oneOf(env.WAF_MODE ?? 'block', 'WAF_MODE', ['off', 'detect', 'block']),
    // anomaly score at which a request is blocked
    wafThreshold: toInt(env.WAF_THRESHOLD ?? '5', 'WAF_THRESHOLD'),

    // how often to probe each backend's /healthz
    healthIntervalMs: toInt(env.HEALTH_INTERVAL_MS ?? '5000', 'HEALTH_INTERVAL_MS'),

    // consecutive results needed to flip a backend up / down (anti-flapping)
    healthyAfter: toInt(env.HEALTH_HEALTHY_AFTER ?? '2', 'HEALTH_HEALTHY_AFTER'),
    unhealthyAfter: toInt(env.HEALTH_UNHEALTHY_AFTER ?? '3', 'HEALTH_UNHEALTHY_AFTER'),

    // circuit breaker: failures before tripping open, and how long to stay open
    breakerThreshold: toInt(env.BREAKER_THRESHOLD ?? '5', 'BREAKER_THRESHOLD'),
    breakerCooldownMs: toInt(env.BREAKER_COOLDOWN_MS ?? '10000', 'BREAKER_COOLDOWN_MS'),

    // how many times to retry a failed forward onto a different healthy target
    maxRetries: toInt(env.MAX_RETRIES ?? '1', 'MAX_RETRIES'),
    // give up on an upstream that hasn't responded within this many ms
    upstreamTimeoutMs: toInt(env.UPSTREAM_TIMEOUT_MS ?? '30000', 'UPSTREAM_TIMEOUT_MS'),

    // on SIGTERM, how long to let in-flight requests drain before forcing exit
    shutdownDrainMs: toInt(env.SHUTDOWN_DRAIN_MS ?? '25000', 'SHUTDOWN_DRAIN_MS'),

    // rate limit: bucket capacity (burst) and refill rate per second per client
    rlCapacity: toInt(env.RL_CAPACITY ?? '100', 'RL_CAPACITY'),
    rlRefillPerSec: toInt(env.RL_REFILL_PER_SEC ?? '50', 'RL_REFILL_PER_SEC'),

    // reject requests with more than this many headers (slow-loris / abuse)
    maxHeaderCount: toInt(env.MAX_HEADER_COUNT ?? '100', 'MAX_HEADER_COUNT'),

    // Postgres connection string (optional — logging degrades gracefully if unset)
    databaseUrl: env.DATABASE_URL ?? null,

    // logging
    logLevel: env.LOG_LEVEL ?? 'info',
  };

  return Object.freeze(config);
}

export const config = loadConfig();
