/**
 * Route stage — picks the upstream for this request.
 *
 * Matches the path against the router. No match means there's nowhere to send
 * the request, so we short-circuit with a 404.
 */

import { matchRoute } from '../proxy/router.js';
import { shortCircuit } from '../core/verdict.js';

export const routeStage = {
  name: 'route',
  handle(ctx) {
    const route = matchRoute(ctx.path);

    if (!route) {
      return shortCircuit(ctx, 404, 'no route');
    }

    ctx.route = route;
    return { type: 'continue' };
  },
};
