/**
 * Dwarpal — entry point.
 *
 * Loads config and starts the proxy server. The request pipeline and stages
 * are wired up in later steps.
 */

import { config } from './config/env.js';
import { startServer } from './proxy/server.js';
import { startAdminServer } from './admin/server.js';
import { startHealthChecks } from './proxy/health.js';
import { configureBreaker } from './proxy/breaker.js';
import { installShutdown } from './proxy/lifecycle.js';
import { configureLimiter } from './ratelimit/limiter.js';

function main() {
  const startedAt = new Date().toISOString();
  console.log(`[dwarpal] starting up (${startedAt})`);
  console.log(`[dwarpal] pool A: ${config.backendAPool.join(', ')}`);
  console.log(`[dwarpal] pool B: ${config.backendBPool.join(', ')}`);

  configureBreaker({
    threshold: config.breakerThreshold,
    cooldownMs: config.breakerCooldownMs,
  });

  configureLimiter({
    capacity: config.rlCapacity,
    refillPerSec: config.rlRefillPerSec,
  });

  startHealthChecks([config.backendAPool, config.backendBPool], {
    intervalMs: config.healthIntervalMs,
    healthyAfter: config.healthyAfter,
    unhealthyAfter: config.unhealthyAfter,
  });

  const server = startServer();
  startAdminServer();
  installShutdown(server, { drainMs: config.shutdownDrainMs });
}

main();
