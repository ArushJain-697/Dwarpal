/**
 * Read queries for request_logs.
 *
 * Keyset (cursor) pagination on (ts, req_id): each page asks for rows strictly
 * "before" the last row of the previous page, so deep pages stay fast — no
 * OFFSET scan-and-discard. Every value is a bound parameter, never interpolated.
 */

import { getPool } from './pool.js';

const SELECT = `
  SELECT req_id AS id, ts, host(client_ip) AS "clientIp", method, path, upstream,
         status, duration_ms AS "durationMs", decision, rule_id AS "ruleId",
         category, anomaly
  FROM request_logs`;

export async function queryLogs({
  limit = 100,
  decision = null,
  category = null,
  beforeTs = null,
  beforeId = null,
} = {}) {
  const pool = getPool();
  if (!pool) return null; // no DB — caller falls back to the in-memory buffer

  const where = [];
  const params = [];

  if (decision) {
    params.push(decision);
    where.push(`decision = $${params.length}`);
  }
  if (category) {
    params.push(category);
    where.push(`category = $${params.length}`);
  }
  if (beforeTs && beforeId) {
    params.push(new Date(Number(beforeTs)).toISOString());
    params.push(beforeId);
    where.push(`(ts, req_id) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(Math.min(Number(limit) || 100, 200));

  const sql =
    SELECT +
    (where.length ? `\n  WHERE ${where.join(' AND ')}` : '') +
    `\n  ORDER BY ts DESC, req_id DESC\n  LIMIT $${params.length}`;

  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({ ...r, ts: r.ts.getTime() }));
}
