/**
 * Load balancer.
 *
 * Picks one target from a route's pool. Round-robin for now: each route keeps
 * its own cursor so requests spread evenly across its backends. Health-aware
 * selection comes in a later step.
 */

import { isHealthy } from './health.js';

// route id -> next index to use
const cursors = new Map();

export function pickTarget(route) {
  const pool = route.pool ?? [];
  const healthy = pool.filter(isHealthy);
  if (healthy.length === 0) {
    return null;
  }

  const index = cursors.get(route.id) ?? 0;
  const target = healthy[index % healthy.length];
  cursors.set(route.id, (index + 1) % healthy.length);
  return target;
}
