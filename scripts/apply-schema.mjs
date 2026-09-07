/**
 * Apply db/schema.sql to the database in DATABASE_URL.
 *
 * A cross-platform stand-in for `psql -f db/schema.sql`, so the project can be
 * set up without a local Postgres client installed.
 *
 *   node --env-file=.env.local scripts/apply-schema.mjs
 *
 * The schema file is re-runnable, so this is safe to run more than once.
 */
import { readFileSync } from 'node:fs';
import { Client } from 'pg';

// Prefer the direct (unpooled) connection for DDL.
const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.');
  process.exit(1);
}

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
const client = new Client({ connectionString });

try {
  await client.connect();
  await client.query(sql);
  console.log('Schema applied.');

  const { rows } = await client.query(`
    select policyname, cmd
    from pg_policies
    where tablename = 'contacts'
    order by policyname
  `);

  console.log(`RLS policies on contacts (${rows.length}):`);
  for (const row of rows) console.log(`  ${row.policyname.padEnd(22)} ${row.cmd}`);

  const [{ relrowsecurity }] = (
    await client.query(
      `select relrowsecurity from pg_class where relname = 'contacts'`,
    )
  ).rows;
  console.log(`Row Level Security enabled: ${relrowsecurity}`);
} catch (error) {
  console.error('Failed to apply schema:', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
