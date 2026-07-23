/**
 * Load balancer.
 *
 * Picks one target from a route's pool. Round-robin for now: each route keeps
 * its own cursor so requests spread evenly across its backends. Health-aware
 * selection comes in a later step.
 */

import { isHealthy } from './health.js';
import { isReady, reserve } from './breaker.js';

// route id -> next index to use
const cursors = new Map();

export function pickTarget(route) {
  const pool = route.pool ?? [];
  const candidates = pool.filter((url) => isHealthy(url) && isReady(url));
  if (candidates.length === 0) {
    return null;
  }

  const index = cursors.get(route.id) ?? 0;
  const target = candidates[index % candidates.length];
  cursors.set(route.id, (index + 1) % candidates.length);

  reserve(target); // claim the half-open probe if this target is testing recovery
  return target;
}
