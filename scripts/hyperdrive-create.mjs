// Creates the Hyperdrive config for an app's runtime database role, with query caching OFF (the app reads its own writes
// and checks revocation markers, so a cached SELECT would be wrong) and a small origin connection limit (the shared
// PlanetScale node has a fixed number of connections for every app). The connection string is read from a private file
// and handed to wrangler directly; it is never printed. Uses the migration token (scripts/wr.mjs explains where it lives).
//   node scripts/hyperdrive-create.mjs <config name> <connection url file> [origin connection limit, default 5]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const [name, file, limit = '5'] = process.argv.slice(2);
if (!name || !file) throw new Error('usage: hyperdrive-create.mjs <config name> <connection url file> [limit]');
const url = fs.readFileSync(file, 'utf8').trim();
const token = fs.readFileSync(path.join(os.homedir(), '.config', 's2-migration', 'cloudflare-token'), 'utf8').trim();
const r = spawnSync('npx', ['wrangler', 'hyperdrive', 'create', name, `--connection-string=${url}`, '--caching-disabled=true', `--origin-connection-limit=${limit}`], {
  cwd: path.resolve(import.meta.dirname, '..'),
  encoding: 'utf8',
  shell: true,
  env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: '1f8a493845a44c1c695cde23d2e468f2' },
});
const hide = (s) => s.split(url).join('<connection url>').split(token).join('<token>');
console.log(hide(`${r.stdout}\n${r.stderr}`).slice(-1500));
process.exit(r.status ?? 1);
