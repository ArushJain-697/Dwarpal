/**
 * Dwarpal — entry point.
 *
 * Loads config and starts the proxy server. The request pipeline and stages
 * are wired up in later steps.
 */

import { config } from './config.js';
import { startServer } from './server.js';

function main() {
  const startedAt = new Date().toISOString();
  console.log(`[dwarpal] starting up (${startedAt})`);
  console.log(`[dwarpal] backend A: ${config.backendAUrl}`);
  console.log(`[dwarpal] backend B: ${config.backendBUrl}`);

  startServer();
}

main();
