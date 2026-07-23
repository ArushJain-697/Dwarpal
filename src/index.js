/**
 * Dwarpal — entry point.
 *
 * Loads config and starts the proxy server. The request pipeline and stages
 * are wired up in later steps.
 */

import { config } from './config.js';
import { startServer } from './server.js';
import { startHealthChecks } from './health.js';

function main() {
  const startedAt = new Date().toISOString();
  console.log(`[dwarpal] starting up (${startedAt})`);
  console.log(`[dwarpal] pool A: ${config.backendAPool.join(', ')}`);
  console.log(`[dwarpal] pool B: ${config.backendBPool.join(', ')}`);

  startHealthChecks([config.backendAPool, config.backendBPool], {
    intervalMs: config.healthIntervalMs,
    healthyAfter: config.healthyAfter,
    unhealthyAfter: config.unhealthyAfter,
  });
  startServer();
}

main();
