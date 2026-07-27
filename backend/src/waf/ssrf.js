/**
 * SSRF address guard.
 *
 * Attackers try to make the server fetch internal addresses (cloud metadata at
 * 169.254.169.254, loopback, private ranges). A single regex is easy to dodge
 * because an IPv4 address can be written many ways — dotted, one big decimal,
 * or hex. We normalize those forms to octets before checking the ranges.
 */

// Parse one address part as decimal / hex (0x..) / octal (0..).
function parseNum(s) {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

// inet_aton semantics: 1-4 dotted parts, each dec/hex/octal; the LAST part
// fills all remaining low bytes (so 127.1 == 127.0.0.1, 0x7f.0.0.1 == 127.0.0.1,
// 2130706433 == 127.0.0.1). Returns [a,b,c,d] or null.
function parseIPv4(host) {
  const parts = host.split('.');
  if (parts.length < 1 || parts.length > 4) return null;
  const nums = parts.map(parseNum);
  if (nums.some((n) => n === null)) return null;

  const leading = nums.length - 1;
  for (let i = 0; i < leading; i++) if (nums[i] > 255) return null; // leading parts are single bytes
  const last = nums[leading];
  if (last > 2 ** (8 * (4 - leading)) - 1) return null; // last must fit the rest

  const bytes = [0, 0, 0, 0];
  for (let i = 0; i < leading; i++) bytes[i] = nums[i];
  let l = last;
  for (let i = 3; i >= leading; i--) {
    bytes[i] = l & 255;
    l = Math.floor(l / 256);
  }
  return bytes;
}

function isPrivateV4([a, b]) {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  return false;
}

export function isBlockedAddress(host) {
  let h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost') return true;
  if (h === '::1' || h === '::') return true; // IPv6 loopback / unspecified

  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 -> 127.0.0.1
  const mapped = h.match(/^::ffff:(\d+(?:\.\d+){0,3}|0x[0-9a-f]+)$/i);
  if (mapped) h = mapped[1];

  const v4 = parseIPv4(h);
  return v4 ? isPrivateV4(v4) : false;
  // ponytail: hostname-based SSRF (e.g. *.nip.io, DNS rebinding) needs DNS
  // resolution, which belongs at fetch time in the backend's HTTP client, not
  // in the WAF hot path.
}

// Does any URL inside this value point at an internal / blocked address? Scans
// the whole field (path, query, or header), so an internal target hidden
// anywhere in the request is caught, not just a bare query param. Handles
// bracketed IPv6 hosts ([::ffff:127.0.0.1]).
export function containsBlockedAddress(value) {
  const re = /[a-z][a-z0-9+.-]*:\/\/(\[[^\]]+\]|[^/:?#\s&]+)/gi;
  let m;
  while ((m = re.exec(value)) !== null) {
    if (isBlockedAddress(m[1])) return true;
  }
  return false;
}
