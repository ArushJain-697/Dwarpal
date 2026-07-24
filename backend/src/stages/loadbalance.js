/**
 * Load-balance stage — picks the concrete upstream for this request.
 *
 * Reads the route chosen by the route stage and asks the balancer for one
 * target from its pool. An empty pool means there's nowhere healthy to send
 * the request, so we short-circuit with a 503.
 */

import { pickTarget } from '../proxy/balancer.js';

export const loadbalanceStage = {
  name: 'loadbalance',
  handle(ctx) {
    const target = pickTarget(ctx.route);

    if (!target) {
      return {
        type: 'short_circuit',
        response: {
          status: 503,
          headers: { 'content-type': 'text/plain' },
          body: `dwarpal: no upstream available (id ${ctx.id})\n`,
        },
      };
    }

    ctx.upstream = target;
    return { type: 'continue' };
  },
};
