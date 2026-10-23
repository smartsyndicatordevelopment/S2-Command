// Reads the live production database through the production app's own container (railway ssh), strictly read-only, and
// saves every table to JSON lines plus a manifest of row counts, checksums and column lists computed INSIDE production at
// the same instant.
//   node scripts/railway-dump.mjs [--out dump] [--key ~/.ssh/railway_s2_migration] [--service S2-Command] [--exclude digits_tokens]
// Everything is read in one READ ONLY, REPEATABLE READ transaction, so nothing on production can change and every table
// is from the same moment. The script that runs in the container never prints its environment or the database address.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const out = flag('out', 'dump');
const key = flag('key', path.join(os.homedir(), '.ssh', 'railway_s2_migration')).replace(/^~/, os.homedir());
const service = flag('service', 'S2-Command');
// This working copy is not linked to Railway, so the project and environment are named explicitly.
const project = flag('project', '64a4ce43-e88d-412a-8fa9-7f9728f9cf4e');
const environment = flag('environment', '3c2fac31-6dee-4901-bfbe-e77e96d38acf');

const exclude = flag('exclude', '').split(',').filter(Boolean);
const remote = `
const EXCLUDE = ${JSON.stringify(exclude)};
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
(async () => {
  const c = await pool.connect();
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await c.query("SET LOCAL TIME ZONE 'UTC'");
    const tables = (await c.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1")).rows.map((r) => r.table_name).filter((t) => !EXCLUDE.includes(t));
    const edges = (await c.query("select child.relname as child, parent.relname as parent from pg_constraint k join pg_class child on child.oid=k.conrelid join pg_class parent on parent.oid=k.confrelid join pg_namespace n on n.oid=child.relnamespace where k.contype='f' and n.nspname='public' and child.relname<>parent.relname")).rows;
    const cols = (await c.query("select table_name, array_agg(column_name::text order by ordinal_position) as cols from information_schema.columns where table_schema='public' group by 1")).rows;
    console.log('@@S\\t' + JSON.stringify({ tables, edges, cols: Object.fromEntries(cols.map((r) => [r.table_name, r.cols])) }));
    for (const t of tables) {
      const fp = (await c.query('select count(*)::int as n, coalesce(md5(string_agg(to_jsonb(x)::text, \\'|\\' order by to_jsonb(x)::text collate "C")), \\'\\') as sum from "' + t + '" x')).rows[0];
      console.log('@@T\\t' + t + '\\t' + JSON.stringify(fp));
      const rows = await c.query('select row_to_json(x)::text as j from "' + t + '" x order by x.ctid');
      for (const r of rows.rows) console.log('@@R\\t' + t + '\\t' + r.j);
    }
    await c.query('COMMIT');
  } finally {
    c.release();
    await pool.end();
  }
})().catch((e) => { console.error('@@E ' + String(e.message).slice(0, 300)); process.exit(1); });
`;
// The real program, not the npm shim, so no shell quoting is needed.
const railwayExe = process.platform === 'win32' ? path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.exe') : 'railway';
const run = spawnSync(railwayExe, ['ssh', '--project', project, '--environment', environment, '--service', service, '-i', key, '--', 'node', '-'], {
  input: remote,
  encoding: 'utf8',
  maxBuffer: 1024 * 1024 * 1024,
});
if (run.error) throw new Error(`Could not start Railway: ${run.error.message}`);
if (run.status !== 0 || /@@E /.test(run.stdout + run.stderr)) {
  throw new Error(`The read through ${service} failed: ${(run.stderr || run.stdout).replace(/postgres(ql)?:\/\/\S+/g, '<url>').slice(-400)}`);
}

let schema;
const fingerprints = {};
const rows = {};
for (const line of run.stdout.split(/\r?\n/)) {
  const [tag, a, b] = line.split('\t');
  if (tag === '@@S') schema = JSON.parse(a);
  else if (tag === '@@T') {
    fingerprints[a] = JSON.parse(b);
    rows[a] = [];
  } else if (tag === '@@R') rows[a].push(b);
}
if (!schema) throw new Error('Production did not report its tables.');

// Parents before children, so the copy can insert in this order and empty in the reverse order.
const order = [];
const pending = new Set(schema.tables);
while (pending.size) {
  const ready = [...pending].filter((t) => schema.edges.filter((e) => e.child === t).every((e) => !pending.has(e.parent) || e.parent === t));
  if (!ready.length) throw new Error(`Tables depend on each other in a loop: ${[...pending].join(', ')}`);
  for (const t of ready.sort()) {
    order.push(t);
    pending.delete(t);
  }
}

fs.mkdirSync(out, { recursive: true });
const manifest = { takenAt: new Date().toISOString(), order, columns: schema.cols, tables: fingerprints };
for (const t of order) {
  fs.writeFileSync(path.join(out, `${t}.jsonl`), rows[t].join('\n') + (rows[t].length ? '\n' : ''));
  if (fingerprints[t].n !== rows[t].length) throw new Error(`${t}: production reported ${fingerprints[t].n} rows but ${rows[t].length} arrived.`);
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Read ${service} at ${manifest.takenAt}, read-only, ${order.length} tables.`);
for (const t of order) console.log(`  ${t.padEnd(26)} ${String(fingerprints[t].n).padStart(7)} rows  checksum ${fingerprints[t].sum.slice(0, 8) || '(empty)'}`);
console.log(`Saved to ${out}/`);
