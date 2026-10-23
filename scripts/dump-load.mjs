// Replaces the contents of a S2 Command database with a dump taken by scripts/railway-dump.mjs, in ONE transaction, and refuses
// to commit unless every table's row count and checksum equals what production reported at the instant of the dump.
//   node scripts/dump-load.mjs <connection url file> [--dir dump]
// Run it as the owner role. The schema must already exist (scripts/db-prepare.cjs). Safe to rerun: it empties first.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const [urlFile, ...rest] = process.argv.slice(2);
if (!urlFile) throw new Error('usage: dump-load.mjs <connection url file> [--dir dump]');
const dir = rest.includes('--dir') ? rest[rest.indexOf('--dir') + 1] : 'dump';
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

const c = new pg.Client({ connectionString: fs.readFileSync(urlFile, 'utf8').trim(), connectionTimeoutMillis: 20000 });
await c.connect();
const started = Date.now();
try {
  await c.query('BEGIN');
  await c.query("SET LOCAL TIME ZONE 'UTC'");
  await c.query("SET LOCAL statement_timeout = '600s'");

  // The two sides must have the same tables and the same columns, or a column would be dropped silently.
  const have = await c.query("select table_name, array_agg(column_name::text order by ordinal_position) as cols from information_schema.columns where table_schema='public' group by 1");
  const targetCols = Object.fromEntries(have.rows.map((r) => [r.table_name, r.cols]));
  const tableNames = Object.keys(manifest.columns).filter((t) => manifest.order.includes(t));
  for (const t of manifest.order) {
    if (!targetCols[t]) throw new Error(`The target has no table ${t}. Run scripts/db-prepare.cjs first.`);
    if (JSON.stringify([...targetCols[t]].sort()) !== JSON.stringify([...manifest.columns[t]].sort())) {
      throw new Error(`Columns differ in ${t}: production ${manifest.columns[t].join(',')} / target ${targetCols[t].join(',')}`);
    }
  }
  const extra = Object.keys(targetCols).filter((t) => !tableNames.includes(t));
  if (extra.length) console.log(`Note: the target also has ${extra.join(', ')}, which production does not have; left empty.`);

  // Empty children first, then fill parents first.
  for (const t of [...manifest.order].reverse()) await c.query(`DELETE FROM "${t}"`);
  for (const t of manifest.order) {
    const lines = fs.readFileSync(path.join(dir, `${t}.jsonl`), 'utf8').split('\n').filter(Boolean);
    for (let i = 0; i < lines.length; i += 400) {
      const batch = '[' + lines.slice(i, i + 400).join(',') + ']';
      await c.query(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(null::"${t}", $1::json)`, [batch]);
    }
  }

  // The proof: the same count and the same checksum as production computed inside itself.
  const bad = [];
  for (const t of manifest.order) {
    const fp = (await c.query(`select count(*)::int as n, coalesce(md5(string_agg(to_jsonb(x)::text, '|' order by to_jsonb(x)::text collate "C")), '') as sum from "${t}" x`)).rows[0];
    const want = manifest.tables[t];
    const ok = fp.n === want.n && fp.sum === want.sum;
    console.log(`  ${t.padEnd(26)} ${String(fp.n).padStart(7)} rows  ${ok ? 'identical' : 'MISMATCH (expected ' + want.n + ' rows, checksum ' + want.sum.slice(0, 8) + ', got ' + fp.sum.slice(0, 8) + ')'}`);
    if (!ok) bad.push(t);
  }
  if (bad.length) throw new Error(`Not committing: ${bad.join(', ')} differ from production.`);
  await c.query('COMMIT');
  console.log(`Committed. ${manifest.order.length} tables identical to production as of ${manifest.takenAt} (${((Date.now() - started) / 1000).toFixed(1)} s).`);
} catch (e) {
  await c.query('ROLLBACK').catch(() => {});
  console.error(String(e.message).replace(/postgres(ql)?:\/\/\S+/g, '<url>'));
  process.exitCode = 1;
} finally {
  await c.end();
}
