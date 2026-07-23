/**
 * Migration runner.
 *
 * Applies every .sql file in migrations/ in filename order. The files use
 * IF NOT EXISTS throughout, so re-running is safe (idempotent). A real project
 * would track applied migrations in a table; for this scope, idempotent SQL is
 * enough.
 *
 *   node src/db/migrate.js
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool, closePool } from './pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', '..', 'migrations');

async function main() {
  const pool = getPool();
  if (!pool) {
    console.error('[migrate] DATABASE_URL is not set');
    process.exit(1);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`[migrate] applying ${file}`);
    await pool.query(sql);
  }

  await closePool();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error(`[migrate] failed: ${err.message}`);
  process.exit(1);
});
