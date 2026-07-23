/**
 * WAF stage — inspects the request for attack patterns.
 *
 * First pass: a small set of obvious SQL-injection signatures checked against
 * the query string. If anything matches we short-circuit with a 403 before the
 * request ever reaches the upstream. The ruleset grows in later steps.
 */

// Keep this list small and readable for now.
const RULES = [
  { id: 'sqli-or-1-1', pattern: /'\s*or\s*'?\d+'?\s*=\s*'?\d+/i },
  { id: 'sqli-union', pattern: /union\s+select/i },
  { id: 'sqli-comment', pattern: /(--|#|\/\*)/ },
];

// URL-decode for inspection. A malformed encoding is itself suspicious, so we
// fall back to the raw value rather than crashing.
function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function inspect(value) {
  for (const rule of RULES) {
    if (rule.pattern.test(value)) {
      return rule.id;
    }
  }
  return null;
}

export const wafStage = {
  name: 'waf',
  handle(ctx) {
    const hit = inspect(decode(ctx.rawQuery));

    if (hit) {
      console.log(`[waf] blocked ${ctx.method} ${ctx.path} rule=${hit} id=${ctx.id}`);
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
