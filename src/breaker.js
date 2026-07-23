/**
 * Per-target circuit breaker.
 *
 * Health checks catch a backend that's fully down. The breaker catches one
 * that's up but failing real requests: after enough failures it trips OPEN and
 * we stop sending traffic for a cooldown, then allow a single HALF-OPEN probe
 * to test recovery.
 *
 *   closed     -> normal; count failures
 *   open        -> reject fast until cooldown elapses
 *   half_open   -> let exactly one request through
 *
 * The balancer calls isReady()/reserve() to pick a target; the forwarder calls
 * onSuccess()/onFailure() to report the outcome.
 */

const breakers = new Map();

let cfg = { threshold: 5, cooldownMs: 10000 };

export function configureBreaker(options) {
  cfg = { threshold: options.threshold, cooldownMs: options.cooldownMs };
}

function get(url) {
  let b = breakers.get(url);
  if (!b) {
    b = { state: 'closed', failures: 0, openedAt: 0, probeInFlight: false };
    breakers.set(url, b);
  }
  return b;
}

// Can we route to this target right now? May transition open -> half_open once
// the cooldown has elapsed.
export function isReady(url) {
  const b = get(url);

  if (b.state === 'open') {
    if (Date.now() - b.openedAt >= cfg.cooldownMs) {
      b.state = 'half_open';
      b.probeInFlight = false;
    } else {
      return false;
    }
  }

  if (b.state === 'half_open') {
    return !b.probeInFlight;
  }

  return true; // closed
}

// Reserve the single half-open probe for the target we actually picked.
export function reserve(url) {
  const b = get(url);
  if (b.state === 'half_open') {
    b.probeInFlight = true;
  }
}

export function onSuccess(url) {
  const b = get(url);
  if (b.state !== 'closed') {
    console.log(`[breaker] ${url} recovered -> closed`);
  }
  b.state = 'closed';
  b.failures = 0;
  b.probeInFlight = false;
}

export function onFailure(url) {
  const b = get(url);

  if (b.state === 'half_open') {
    b.state = 'open';
    b.openedAt = Date.now();
    b.probeInFlight = false;
    console.log(`[breaker] ${url} probe failed -> open`);
    return;
  }

  b.failures += 1;
  if (b.state === 'closed' && b.failures >= cfg.threshold) {
    b.state = 'open';
    b.openedAt = Date.now();
    console.log(`[breaker] ${url} tripped -> open (${b.failures} failures)`);
  }
}
