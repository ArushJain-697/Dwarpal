/**
 * Daily partition maintenance for request_logs.
 *
 * Pre-creates one partition per day for the next N days (at boot, then on a
 * daily timer). Without this, an INSERT for a day that has no partition would
 * fail — the classic "works at 11:58pm, dies at midnight" outage.
 *
 * There is still a DEFAULT partition as a safety net, so a day whose rows
 * already landed in the default (typically today, on an existing DB) simply
 * stays there — we skip it rather than fight the overlap.
 */

import { getPool } from './pool.js';
import { config } from '../config/env.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoDay(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

async function createDay(pool, date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const name = `request_logs_${isoDay(start).replace(/-/g, '_')}`;

  try {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF request_logs
       FOR VALUES FROM ('${isoDay(start)}') TO ('${isoDay(end)}')`,
    );
    return name;
  } catch (err) {
    // Most likely the default partition already holds rows for this day.
    console.log(`[partitions] skipped ${name}: ${err.message}`);
    return null;
  }
}

export async function ensurePartitions(daysAhead = config.partitionDaysAhead) {
  const pool = getPool();
  if (!pool) return;

  const now = new Date();
  const created = [];
  for (let i = 0; i <= daysAhead; i++) {
    const day = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
    const name = await createDay(pool, day);
    if (name) created.push(name);
  }
  if (created.length) {
    console.log(`[partitions] ensured ${created.length} daily partition(s)`);
  }
}

export function startPartitionMaintenance() {
  const pool = getPool();
  if (!pool) return;

  ensurePartitions();
  const timer = setInterval(() => ensurePartitions(), 24 * 60 * 60 * 1000);
  timer.unref();
}
