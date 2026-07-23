/**
 * WAF stage — inspects the request and scores it.
 *
 * Gathers every inspectable field, runs the scoring engine, and acts on the
 * anomaly score per the live WAF mode:
 *
 *   off    -> skip inspection entirely
 *   detect -> record + log any hit, but let the request through (shadow mode)
 *   block  -> short-circuit with a 403 when the score crosses the threshold
 *
 * The reported category is the highest-scoring hit, so a mixed payload is
 * labelled by its strongest signal rather than whichever rule happened first.
 */

import { config } from '../config/env.js';
import { getWafMode } from '../config/settings.js';
import { evaluate } from '../waf/engine.js';
import { collectFields } from '../waf/fields.js';

function topHit(hits) {
  return hits.reduce((best, h) => (h.score > best.score ? h : best));
}

export const wafStage = {
  name: 'waf',
  handle(ctx) {
    const mode = getWafMode();
    if (mode === 'off') {
      return { type: 'continue' };
    }

    const result = evaluate(collectFields(ctx), config.wafThreshold);
    if (result.hits.length === 0) {
      return { type: 'continue' };
    }

    const top = topHit(result.hits);
    const blocking = mode === 'block' && result.blocked;

    ctx.waf = {
      blocked: blocking,
      anomaly: result.score,
      ruleId: top.id,
      category: top.category,
      source: top.source,
    };

    // Log when we act on it: a real block, or any hit in shadow mode.
    if (blocking || mode === 'detect') {
      const label = blocking ? 'blocked' : 'detected';
      console.log(
        `[waf] ${label} ${ctx.method} ${ctx.path} anomaly=${result.score} category=${top.category} in=${top.source} id=${ctx.id}`,
      );
    }

    if (!blocking) {
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
