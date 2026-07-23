/**
 * Graceful shutdown.
 *
 * On SIGTERM/SIGINT we stop accepting new connections but let in-flight
 * requests finish, up to a drain deadline. Idle keep-alive sockets are closed
 * immediately so they don't hold the drain open. If the deadline passes,
 * whatever is left is closed and we exit anyway.
 */

export function installShutdown(server, options) {
  const drainMs = options.drainMs;
  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[lifecycle] ${signal} received — draining in-flight requests`);

    // Stop accepting new connections; callback fires once existing ones finish.
    server.close(() => {
      console.log('[lifecycle] all connections drained — exiting');
      process.exit(0);
    });

    // Drop idle keep-alive sockets so they don't keep the drain waiting.
    server.closeIdleConnections();

    // Hard deadline: force whatever's left closed and exit.
    const timer = setTimeout(() => {
      console.log('[lifecycle] drain deadline reached — forcing exit');
      server.closeAllConnections();
      process.exit(0);
    }, drainMs);
    timer.unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
