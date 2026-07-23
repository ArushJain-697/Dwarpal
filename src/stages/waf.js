/**
 * WAF stage — inspects the request for attack patterns.
 *
 * Gathers every inspectable field (path, query, selected headers), canonicalizes
 * each, and runs the ruleset. On the first match we record the hit on the
 * context and short-circuit with a 403 before the request reaches the upstream.
 */

import { matchRules } from '../waf/rules.js';
import { canonicalize } from '../waf/normalize.js';
import { collectFields } from '../waf/fields.js';

export const wafStage = {
  name: 'waf',
  handle(ctx) {
    for (const field of collectFields(ctx)) {
      const hit = matchRules(canonicalize(field.value));
      if (!hit) continue;

      ctx.waf = {
        blocked: true,
        ruleId: hit.id,
        category: hit.category,
        source: field.source,
      };
      console.log(
        `[waf] blocked ${ctx.method} ${ctx.path} rule=${hit.id} category=${hit.category} in=${field.source} id=${ctx.id}`,
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
