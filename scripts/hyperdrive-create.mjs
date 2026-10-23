// Creates the Hyperdrive config for an app's runtime database role, with query caching OFF (the app reads its own writes
// and checks revocation markers, so a cached SELECT would be wrong). The connection string is read from a private file and
// handed to wrangler directly; it is never printed.
//   node scripts/hyperdrive-create.mjs <config name> <connection url file>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const [name, file] = process.argv.slice(2);
if (!name || !file) throw new Error('usage: hyperdrive-create.mjs <config name> <connection url file>');
const url = fs.readFileSync(file, 'utf8').trim();
const r = spawnSync('npx', ['wrangler', 'hyperdrive', 'create', name, `--connection-string=${url}`, '--caching-disabled=true'], {
  encoding: 'utf8',
  shell: true,
});
const text = `${r.stdout}\n${r.stderr}`.split(url).join('<connection url>');
console.log(text.slice(-1500));
process.exit(r.status ?? 1);
