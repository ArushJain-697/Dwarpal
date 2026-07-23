/**
 * Dwarpal — entry point.
 *
 * For now this just boots and logs. The proxy server, pipeline, and stages
 * are wired up in later steps.
 */

function main() {
  const startedAt = new Date().toISOString();
  console.log(`[dwarpal] starting up (${startedAt})`);
  console.log('[dwarpal] nothing wired yet — hello from the gatekeeper');
}

main();
