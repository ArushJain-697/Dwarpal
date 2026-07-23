/**
 * WAF stage — inspects the request for attack patterns.
 *
 * Decodes the query string and runs it through the ruleset. On a match we
 * record the hit on the context and short-circuit with a 403 before the
 * request reaches the upstream.
 */

import { matchRules } from '../waf/rules.js';

// URL-decode for inspection. A malformed encoding is itself suspicious, so we
// fall back to the raw value rather than crashing.
function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export const wafStage = {
  name: 'waf',
  handle(ctx) {
    const hit = matchRules(decode(ctx.rawQuery));

    if (hit) {
      ctx.waf = { blocked: true, ruleId: hit.id, category: hit.category };
      console.log(
        `[waf] blocked ${ctx.method} ${ctx.path} rule=${hit.id} category=${hit.category} id=${ctx.id}`,
      );
      return {
        type: 'short_circuit',
        response: {
          status: 403,
          headers: { 'content-type': 'text/plain' },
          // Don't echo the payload or the matched rule back to the client.
          body: `dwarpal: request blocked (id ${ctx.id})\n`,
        },
      };
    }

    return { type: 'continue' };
  },
};
