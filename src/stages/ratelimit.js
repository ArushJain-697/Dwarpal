/**
 * Rate-limit stage — caps requests per client IP.
 *
 * Spends a token for this client. If the bucket is empty we short-circuit with
 * a 429 and a Retry-After hint; otherwise we attach the remaining budget and
 * let the request continue.
 */

import { take } from '../ratelimit/limiter.js';

export const ratelimitStage = {
  name: 'ratelimit',
  handle(ctx) {
    const result = take(ctx.clientIp);
    ctx.rateLimit = { remaining: result.remaining, limited: !result.allowed };

    if (!result.allowed) {
      return {
        type: 'short_circuit',
        response: {
          status: 429,
          headers: {
            'content-type': 'text/plain',
            'retry-after': String(result.retryAfterSec),
            'ratelimit-limit': String(result.limit),
            'ratelimit-remaining': '0',
          },
          body: `dwarpal: rate limited (id ${ctx.id})\n`,
        },
      };
    }

    return { type: 'continue' };
  },
};
