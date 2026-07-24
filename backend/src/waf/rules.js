/**
 * The WAF ruleset.
 *
 * Each rule has a stable id, a category, a pattern, and a score. Strong,
 * unambiguous signatures score at or above the block threshold so they block on
 * their own; weaker heuristics score low so they only contribute — several
 * together cross the threshold, one alone does not. This is what keeps benign
 * lookalikes (a stray `--`, the word "union") from tripping the WAF.
 *
 * A rule matches by regex (`pattern`) or by predicate (`match`).
 */

import { containsBlockedAddress } from './ssrf.js';

export const RULES = [
  // SQL injection
  { id: 'sqli-or-1-1', category: 'sqli', score: 5, pattern: /'\s*or\s*'?\d+'?\s*=\s*'?\d+/i },
  { id: 'sqli-union', category: 'sqli', score: 5, pattern: /union\s+select/i },
  { id: 'sqli-comment', category: 'sqli', score: 2, pattern: /(--|#|\/\*)/ },

  // Cross-site scripting
  { id: 'xss-script-tag', category: 'xss', score: 5, pattern: /<\s*script/i },
  { id: 'xss-event-handler', category: 'xss', score: 3, pattern: /on\w+\s*=/i },
  // a tag carrying an event handler, e.g. <img src=x onerror=...> — strong signal
  { id: 'xss-tag-event', category: 'xss', score: 5, pattern: /<[a-z][^>]*\son[a-z]+\s*=/i },
  { id: 'xss-js-uri', category: 'xss', score: 5, pattern: /javascript:/i },

  // Path traversal
  { id: 'traversal-dotdot', category: 'traversal', score: 5, pattern: /\.\.[\/\\]/ },
  { id: 'traversal-etc-passwd', category: 'traversal', score: 5, pattern: /\/etc\/passwd/i },

  // Command injection
  { id: 'cmdi-shell-meta', category: 'cmdi', score: 4, pattern: /[;|`]|\$\(/ },
  {
    id: 'cmdi-chained-cmd',
    category: 'cmdi',
    score: 5,
    // a shell separator immediately followed by a common command
    pattern: /[;|&]\s*(cat|ls|id|whoami|curl|wget|nc|bash|sh|ping|uname)\b/i,
  },

  // SSRF — a URL anywhere in the request pointing at an internal / metadata
  // address (checks dotted / decimal / hex forms via isBlockedAddress).
  { id: 'ssrf-internal-target', category: 'ssrf', score: 5, match: containsBlockedAddress },
];
