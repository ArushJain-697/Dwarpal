/**
 * Recent request log — a bounded in-memory ring buffer.
 *
 * Keeps the last N request records so the dashboard can backfill history when a
 * client connects, then resume the live WebSocket feed. Bounded so it can't grow
 * without limit. Durable, queryable storage (partitioned Postgres) replaces this
 * in a later step; the read shape stays the same.
 */

const MAX = 1000;
const buffer = [];

export function addRecord(record) {
  buffer.push({ ...record, ts: Date.now() });
  if (buffer.length > MAX) {
    buffer.shift(); // drop the oldest
  }
}

export function getRecent({ limit = 100, decision = null } = {}) {
  let items = buffer;
  if (decision) {
    items = items.filter((r) => r.decision === decision);
  }
  // newest first
  return items.slice(-limit).reverse();
}
