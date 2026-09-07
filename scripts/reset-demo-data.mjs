/**
 * Delete every contact row. Demo-data housekeeping only — used to re-capture
 * evidence screenshots from a clean slate.
 *
 *   node --env-file=.env.local scripts/reset-demo-data.mjs
 *
 * This connects as the database owner, which bypasses RLS by design. It is a
 * maintenance script and is never part of the application's request path.
 */
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
const client = new Client({ connectionString });

await client.connect();
const { rowCount } = await client.query('delete from contacts');
console.log(`Deleted ${rowCount} contact row(s).`);
await client.end();
