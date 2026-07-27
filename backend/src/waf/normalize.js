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

// URL-decode until the string stops changing (bounded), so triple+ encoding
// (%25252e -> %252e -> %2e -> .) can't slip past. A malformed sequence stops
// the loop and is treated as suspicious downstream.
function urlDecodeStable(value) {
  let out = value;
  for (let i = 0; i < 5; i++) {
    let decoded;
    try {
      decoded = decodeURIComponent(out);
    } catch {
      break;
    }
    if (decoded === out) break;
    out = decoded;
  }
  return out;
}

export function canonicalize(value) {
  let v = urlDecodeStable(value);

  // In a query string '+' encodes a space (form-encoding). Fold it so a payload
  // hidden behind '+' separators (e.g. 1'+OR+'1'='1) can't slip past the rules.
  v = v.replace(/\+/g, ' ');

  // Fold Unicode look-alikes (fullwidth, compatibility forms) to ASCII.
  v = v.normalize('NFKC');

  // Drop null bytes.
  v = v.replace(/\0/g, '');

  // MySQL executable comments /*!...*/ RUN the code inside — unwrap them (keep
  // the payload) rather than deleting it, which used to hide the SELECT.
  v = v.replace(/\/\*!(?:\d+)?([\s\S]*?)\*\//g, ' $1 ');

  // Strip remaining plain /* */ comments (their contents are inert).
  v = v.replace(/\/\*[\s\S]*?\*\//g, ' ');

  // Collapse runs of whitespace to single spaces.
  v = v.replace(/\s+/g, ' ');

  return v;
}
