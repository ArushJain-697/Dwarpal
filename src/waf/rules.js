/**
 * The WAF ruleset.
 *
 * Each rule has a stable id, a category (used for logging and, later, the
 * dashboard breakdown), and a pattern. This list grows over time — keep the
 * patterns readable and high-signal rather than exhaustive.
 */

export const RULES = [
  // SQL injection
  { id: 'sqli-or-1-1', category: 'sqli', pattern: /'\s*or\s*'?\d+'?\s*=\s*'?\d+/i },
  { id: 'sqli-union', category: 'sqli', pattern: /union\s+select/i },
  { id: 'sqli-comment', category: 'sqli', pattern: /(--|#|\/\*)/ },

  // Cross-site scripting
  { id: 'xss-script-tag', category: 'xss', pattern: /<\s*script/i },
  { id: 'xss-event-handler', category: 'xss', pattern: /on\w+\s*=/i },
  { id: 'xss-js-uri', category: 'xss', pattern: /javascript:/i },

  // Path traversal
  { id: 'traversal-dotdot', category: 'traversal', pattern: /\.\.[\/\\]/ },
  { id: 'traversal-etc-passwd', category: 'traversal', pattern: /\/etc\/passwd/i },

  // Command injection
  { id: 'cmdi-shell-meta', category: 'cmdi', pattern: /[;|`]|\$\(/ },

  // SSRF
  { id: 'ssrf-metadata-ip', category: 'ssrf', pattern: /169\.254\.169\.254/ },
];

/**
 * Test a value against every rule. Returns the first match { id, category }
 * or null if the value is clean.
 */
export function matchRules(value) {
  for (const rule of RULES) {
    if (rule.pattern.test(value)) {
      return { id: rule.id, category: rule.category };
    }
  }
  return null;
}
