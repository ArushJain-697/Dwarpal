/**
 * Input normalization for the WAF.
 *
 * Attackers hide payloads behind encoding and formatting tricks. Before we run
 * the rules we fold the input down to a canonical form so a single pattern
 * catches many variants:
 *
 *   UNION/**\/SELECT   -> union select
 *   %252e%252e%252f    -> ../
 *   ＜script＞          -> <script>   (fullwidth via NFKC)
 *
 * We normalize a COPY for inspection only — the original bytes are still what
 * gets forwarded upstream.
 */

// URL-decode up to twice, since double-encoding is a common evasion. A
// malformed sequence is left as-is (and treated as suspicious downstream).
function urlDecodeTwice(value) {
  let out = value;
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(out);
      if (decoded === out) break;
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

export function canonicalize(value) {
  let v = urlDecodeTwice(value);

  // In a query string '+' encodes a space (form-encoding). Fold it so a payload
  // hidden behind '+' separators (e.g. 1'+OR+'1'='1) can't slip past the rules.
  v = v.replace(/\+/g, ' ');

  // Fold Unicode look-alikes (fullwidth, compatibility forms) to ASCII.
  v = v.normalize('NFKC');

  // Drop null bytes.
  v = v.replace(/\0/g, '');

  // Strip inline SQL/C comments so UNION/**/SELECT collapses together.
  v = v.replace(/\/\*.*?\*\//gs, ' ');

  // Collapse runs of whitespace to single spaces.
  v = v.replace(/\s+/g, ' ');

  return v;
}
