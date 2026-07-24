/**
 * The WAF scoring engine.
 *
 * Runs every rule against every inspectable field and sums the scores of all
 * matches into an anomaly score. The request is flagged when the score reaches
 * the threshold — so one strong signature blocks alone, while several weak ones
 * add up, and a single weak signal does not.
 *
 * A rule matches either by regex (`pattern`) or by a predicate (`match`) — the
 * predicate form lets rules that need real parsing (e.g. SSRF address checks)
 * live in the same ruleset instead of being special-cased in the stage.
 */

import { RULES } from './rules.js';
import { canonicalize } from './normalize.js';

export function evaluate(fields, threshold) {
  let score = 0;
  const hits = [];

  for (const field of fields) {
    const value = canonicalize(field.value);
    for (const rule of RULES) {
      const matched = rule.match ? rule.match(value) : rule.pattern.test(value);
      if (matched) {
        score += rule.score;
        hits.push({
          id: rule.id,
          category: rule.category,
          score: rule.score,
          source: field.source,
        });
      }
    }
  }

  return { score, hits, blocked: score >= threshold };
}
