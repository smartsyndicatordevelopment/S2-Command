// Copies the app's private settings from the Railway service to the Worker, without ever printing a value.
// Reads Railway read-only (`railway variables`), writes a private temporary file, runs `wrangler secret bulk`, deletes the file.
//   node scripts/worker-set-secrets.mjs --dry-run      prints the NAMES that would be copied, and the ones skipped
//   node scripts/worker-set-secrets.mjs                copies them
// Run with the current folder set to a folder linked to the Railway project (the source folder), not the worktree:
//   cd "../S2 Command" && node "../S2 Command-wt-cloudflare/scripts/worker-set-secrets.mjs" --dry-run
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dryRun = process.argv.includes('--dry-run');
const service = 'S2-Command';
const environment = 'production';
const worker = 'S2 Command-wt-cloudflare';

// The host's own settings and the database address (the Worker reaches the database through Hyperdrive) are not copied.
// BETTER_AUTH_URL and NODE_ENV are plain settings in wrangler.jsonc. JOBS_ENABLED is switched on only at the cutover.
const SKIP = [/^RAILWAY_/, /^DATABASE_URL$/, /^DATABASE_PUBLIC_URL$/, /^PG/, /^POSTGRES/, /^PORT$/, /^NODE_ENV$/, /^BETTER_AUTH_URL$/,
  /^JOBS_ENABLED$/, /^NIXPACKS_/, /^DASHBOARD_PASSWORD$/, /^QB_/, /^TOKENS_PATH$/];

const railwayExe = process.platform === 'win32' ? path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.exe') : 'railway';
const read = spawnSync(railwayExe, ['variables', '--service', service, '--environment', environment, '--json'], { encoding: 'utf8' });
if (read.status !== 0) throw new Error('Could not read the Railway variables (run from the Railway-linked folder): ' + (read.stderr || '').slice(0, 200));
const vars = JSON.parse(read.stdout);

const copy = {};
const skipped = [];
for (const [name, value] of Object.entries(vars)) {
  if (SKIP.some((re) => re.test(name)) || typeof value !== 'string' || value === '') skipped.push(name);
  else copy[name] = value;
}
console.log(`copy (${Object.keys(copy).length}): ${Object.keys(copy).sort().join(', ')}`);
console.log(`skipped (${skipped.length}): ${skipped.sort().join(', ')}`);
if (dryRun) process.exit(0);

const file = path.join(os.tmpdir(), `s2-secrets-${process.pid}.json`);
fs.writeFileSync(file, JSON.stringify(copy), { mode: 0o600 });
try {
  const cfToken = fs.readFileSync(path.join(os.homedir(), '.config', 's2-migration', 'cloudflare-token'), 'utf8').trim();
  const wrangler = spawnSync('npx', ['wrangler', 'secret', 'bulk', file], {
    encoding: 'utf8',
    shell: true,
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, CLOUDFLARE_API_TOKEN: cfToken, CLOUDFLARE_ACCOUNT_ID: '1f8a493845a44c1c695cde23d2e468f2' },
  });
  let out = `${wrangler.stdout}\n${wrangler.stderr}`;
  for (const value of Object.values(copy)) if (value.length > 5) out = out.split(value).join('<hidden>');
  console.log(out.slice(-800));
  process.exitCode = wrangler.status ?? 1;
} finally {
  fs.rmSync(file, { force: true });
}
void worker;
