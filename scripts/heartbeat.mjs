// Prints the scheduled job's last heartbeat from the live database (read-only). Usage: node scripts/heartbeat.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const url = fs.readFileSync(path.join(os.homedir(), '.config', 's2-migration', 's2command-app-url.txt'), 'utf8').trim();
const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await c.connect();
const r = await c.query("SELECT data, computed_at FROM server_cache WHERE key = 'scheduled_jobs_last_run'");
console.log(r.rows.length ? `last run: ${JSON.stringify(r.rows[0].data)}` : 'no heartbeat yet (the job has not run since the switch)');
await c.end();
