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
import { startLogWriter } from './obs/batchLogWriter.js';
import { startPartitionMaintenance } from './db/partitions.js';
import { subscribeConfig } from './redis/pubsub.js';
import { setWafMode } from './config/settings.js';

// Last-resort net: log any escaped error but keep serving. Request-scoped
// errors are already caught in the pipeline; this stops a stray throw from
// silently killing the proxy.
// ponytail: keeps a possibly-corrupt process alive; a prod supervisor should
// still restart on repeated errors.
process.on('uncaughtException', (err) => console.error(`[fatal] uncaughtException: ${err.stack || err}`));
process.on('unhandledRejection', (err) => console.error(`[fatal] unhandledRejection: ${err}`));

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

  startLogWriter();
  startPartitionMaintenance();

  // Apply config changes published by any instance (WAF toggle, etc).
  subscribeConfig((payload) => {
    if (payload.wafMode) {
      setWafMode(payload.wafMode);
      console.log(`[config] applied wafMode=${payload.wafMode} from reload`);
    }
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
