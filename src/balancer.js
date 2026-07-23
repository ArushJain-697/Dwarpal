/**
 * Load balancer.
 *
 * Picks one target from a route's pool. Round-robin for now: each route keeps
 * its own cursor so requests spread evenly across its backends. Health-aware
 * selection comes in a later step.
 */

// route id -> next index to use
const cursors = new Map();

export function pickTarget(route) {
  const pool = route.pool;
  if (!pool || pool.length === 0) {
    return null;
  }

  const index = cursors.get(route.id) ?? 0;
  const target = pool[index % pool.length];
  cursors.set(route.id, (index + 1) % pool.length);
  return target;
}
