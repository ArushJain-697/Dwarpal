/**
 * WAF stage — inspects the request for attack patterns.
 *
 * Gathers every inspectable field (path, query, selected headers), canonicalizes
 * each, and runs the ruleset. Behaviour depends on config.wafMode:
 *
 *   off    -> skip inspection entirely
 *   detect -> record + log the hit, but let the request through (shadow mode)
 *   block  -> short-circuit with a 403 before it reaches the upstream
 */

import { config } from '../config/env.js';
import { matchRules } from '../waf/rules.js';
import { canonicalize } from '../waf/normalize.js';
import { collectFields } from '../waf/fields.js';

function findHit(ctx) {
  for (const field of collectFields(ctx)) {
    const hit = matchRules(canonicalize(field.value));
    if (hit) {
      return { ...hit, source: field.source };
    }
  }
  return null;
}

export const wafStage = {
  name: 'waf',
  handle(ctx) {
    if (config.wafMode === 'off') {
      return { type: 'continue' };
    }

    const hit = findHit(ctx);
    if (!hit) {
      return { type: 'continue' };
    }

    const blocking = config.wafMode === 'block';
    ctx.waf = {
      blocked: blocking,
      ruleId: hit.id,
      category: hit.category,
      source: hit.source,
    };

    const label = blocking ? 'blocked' : 'detected';
    console.log(
      `[waf] ${label} ${ctx.method} ${ctx.path} rule=${hit.id} category=${hit.category} in=${hit.source} id=${ctx.id}`,
    );

    if (!blocking) {
      // detect mode: log the hit but let it through.
      return { type: 'continue' };
    }

    return {
      type: 'short_circuit',
      response: {
        status: 403,
        headers: { 'content-type': 'text/plain' },
        // Don't echo the payload or the matched rule back to the client.
        body: `dwarpal: request blocked (id ${ctx.id})\n`,
      },
    };
  },
};
