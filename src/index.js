/**
 * Dwarpal — entry point.
 *
 * For now this just loads config and logs. The proxy server, pipeline, and
 * stages are wired up in later steps.
 */

import { config } from './config.js';

function main() {
  const startedAt = new Date().toISOString();
  console.log(`[dwarpal] starting up (${startedAt})`);
  console.log(`[dwarpal] proxy port: ${config.proxyPort}`);
  console.log(`[dwarpal] upstream:   ${config.upstreamUrl}`);
}

main();
