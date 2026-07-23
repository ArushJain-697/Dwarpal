/**
 * Route stage — picks the upstream for this request.
 *
 * Matches the path against the router. No match means there's nowhere to send
 * the request, so we short-circuit with a 404.
 */

import { matchRoute } from '../router.js';

export const routeStage = {
  name: 'route',
  handle(ctx) {
    const route = matchRoute(ctx.path);

    if (!route) {
      return {
        type: 'short_circuit',
        response: {
          status: 404,
          headers: { 'content-type': 'text/plain' },
          body: `dwarpal: no route (id ${ctx.id})\n`,
        },
      };
    }

    ctx.route = route;
    return { type: 'continue' };
  },
};
