/**
 * SSRF address guard.
 *
 * Attackers try to make the server fetch internal addresses (cloud metadata at
 * 169.254.169.254, loopback, private ranges). A single regex is easy to dodge
 * because an IPv4 address can be written many ways — dotted, one big decimal,
 * or hex. We normalize those forms to octets before checking the ranges.
 */

// Parse an IPv4 written as dotted / decimal / hex into [a,b,c,d], or null.
function parseIPv4(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    return parts.every((n) => n <= 255) ? parts : null;
  }
  if (/^\d+$/.test(host)) {
    const n = Number(host);
    return n <= 0xffffffff ? octets(n) : null;
  }
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const n = parseInt(host, 16);
    return n <= 0xffffffff ? octets(n) : null;
  }
  return null;
}

function octets(n) {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
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
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost') return true;
  if (h === '::1' || h === '::') return true; // IPv6 loopback / unspecified

  const v4 = parseIPv4(h);
  return v4 ? isPrivateV4(v4) : false;
}

// Does any URL inside this value point at an internal / blocked address? Scans
// the whole field (path, query, or header), so an internal target hidden
// anywhere in the request is caught, not just a bare query param.
export function containsBlockedAddress(value) {
  const re = /[a-z][a-z0-9+.-]*:\/\/([^/:?#\s&]+)/gi;
  let m;
  while ((m = re.exec(value)) !== null) {
    if (isBlockedAddress(m[1])) return true;
  }
  return false;
}
