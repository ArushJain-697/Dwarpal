/**
 * Rate-limit stage — caps requests per client IP.
 *
 * Spends a token for this client. If the bucket is empty we short-circuit with
 * a 429 and a Retry-After hint; otherwise we attach the remaining budget and
 * let the request continue.
 */

import { take } from '../ratelimit/limiter.js';
import { shortCircuit } from '../core/verdict.js';

export const ratelimitStage = {
  name: 'ratelimit',
  async handle(ctx) {
    const result = await take(ctx.clientIp);
    ctx.rateLimit = { remaining: result.remaining, limited: !result.allowed };

    if (!result.allowed) {
      return shortCircuit(ctx, 429, 'rate limited', {
        'retry-after': String(result.retryAfterSec),
        'ratelimit-limit': String(result.limit),
        'ratelimit-remaining': '0',
      });
    }

    return { type: 'continue' };
  },
};
