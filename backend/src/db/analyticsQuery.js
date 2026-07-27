/**
 * Aggregate read queries for the analytics page.
 *
 * Time-bucketed traffic, top attacking IPs, and block breakdowns over a chosen
 * window. Read-only, hit occasionally (not the hot path) — a few small GROUP BYs
 * over the partitioned table are fine. Every value is a bound parameter; the
 * range is mapped through a fixed whitelist, never interpolated.
 */

import { getPool } from './pool.js';

// range -> { interval, bucket } — whitelist so nothing user-supplied reaches SQL.
const RANGES = {
  '24h': { interval: '24 hours', bucket: 'hour' },
  '7d': { interval: '7 days', bucket: 'day' },
  '30d': { interval: '30 days', bucket: 'day' },
};

export async function queryAnalytics(rangeKey = '24h') {
  const pool = getPool();
  if (!pool) return null; // no DB — caller returns an empty/degraded payload

  const { interval, bucket } = RANGES[rangeKey] || RANGES['24h'];

  const [series, topIps, byCategory, byStatus] = await Promise.all([
    pool.query(
      `SELECT date_trunc($2, ts) AS b,
              count(*)::int AS requests,
              count(*) FILTER (WHERE decision IN ('block','ratelimit'))::int AS blocked
         FROM request_logs
        WHERE ts >= now() - $1::interval
        GROUP BY b ORDER BY b`,
      [interval, bucket],
    ),
    pool.query(
      `SELECT host(client_ip) AS ip, count(*)::int AS count
         FROM request_logs
        WHERE ts >= now() - $1::interval AND decision = 'block' AND client_ip IS NOT NULL
        GROUP BY ip ORDER BY count DESC LIMIT 8`,
      [interval],
    ),
    pool.query(
      `SELECT category, count(*)::int AS count
         FROM request_logs
        WHERE ts >= now() - $1::interval AND decision = 'block' AND category IS NOT NULL
        GROUP BY category`,
      [interval],
    ),
    pool.query(
      `SELECT (status/100)::text || 'xx' AS cls, count(*)::int AS count
         FROM request_logs
        WHERE ts >= now() - $1::interval
        GROUP BY cls ORDER BY cls`,
      [interval],
    ),
  ]);

  return {
    range: RANGES[rangeKey] ? rangeKey : '24h',
    bucket,
    series: series.rows.map((r) => ({ t: r.b.getTime(), requests: r.requests, blocked: r.blocked })),
    topIps: topIps.rows,
    byCategory: Object.fromEntries(byCategory.rows.map((r) => [r.category, r.count])),
    byStatus: Object.fromEntries(byStatus.rows.map((r) => [r.cls, r.count])),
  };
}
