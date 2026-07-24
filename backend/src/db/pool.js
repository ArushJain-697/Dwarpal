/**
 * Postgres connection pool.
 *
 * A small pool — the proxy never queries Postgres on the hot path; only the log
 * writer and admin/migration code touch it. Returns null when DATABASE_URL is
 * unset so the proxy can still run (logging just degrades to console only).
 */

import pg from 'pg';
import { config } from '../config/env.js';

let pool = null;

export function getPool() {
  if (!config.databaseUrl) return null;
  if (!pool) {
    pool = new pg.Pool({ connectionString: config.databaseUrl, max: 4 });
    pool.on('error', (err) => console.error(`[db] pool error: ${err.message}`));
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
