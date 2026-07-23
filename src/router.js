/**
 * The router.
 *
 * Maps a request path to an upstream by longest-prefix match, so a more
 * specific route (/api/a/admin) wins over a broader one (/api/a). For now the
 * table is built from config; later it comes from the database.
 */

import { config } from './config.js';

const ROUTES = [
  { id: 'a', prefix: '/api/a', upstream: config.backendAUrl },
  { id: 'b', prefix: '/api/b', upstream: config.backendBUrl },
];

export function matchRoute(path) {
  let best = null;
  for (const route of ROUTES) {
    if (path === route.prefix || path.startsWith(route.prefix + '/')) {
      if (!best || route.prefix.length > best.prefix.length) {
        best = route;
      }
    }
  }
  return best;
}
