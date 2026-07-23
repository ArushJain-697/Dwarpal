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

function loadConfig(env = process.env) {
  const config = {
    // ports
    proxyPort: toInt(env.PROXY_PORT ?? '8080', 'PROXY_PORT'),

    // the backends we route to, by path prefix
    backendAUrl: required(env.BACKEND_A_URL ?? 'http://localhost:9001', 'BACKEND_A_URL'),
    backendBUrl: required(env.BACKEND_B_URL ?? 'http://localhost:9002', 'BACKEND_B_URL'),

    // WAF behaviour: off = don't inspect, detect = log only, block = 403
    wafMode: oneOf(env.WAF_MODE ?? 'block', 'WAF_MODE', ['off', 'detect', 'block']),

    // logging
    logLevel: env.LOG_LEVEL ?? 'info',
  };

  return Object.freeze(config);
}

export const config = loadConfig();
