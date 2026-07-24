/**
 * Load-balance stage — picks the concrete upstream for this request.
 *
 * Reads the route chosen by the route stage and asks the balancer for one
 * target from its pool. An empty pool means there's nowhere healthy to send
 * the request, so we short-circuit with a 503.
 */

import { pickTarget } from '../proxy/balancer.js';
import { shortCircuit } from '../core/verdict.js';

export const loadbalanceStage = {
  name: 'loadbalance',
  handle(ctx) {
    const target = pickTarget(ctx.route);

    if (!target) {
      return shortCircuit(ctx, 503, 'no upstream available');
    }

    ctx.upstream = target;
    return { type: 'continue' };
  },
};
