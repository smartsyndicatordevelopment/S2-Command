// Makes the Hyperdrive configuration `s2-command-dev` (caching off) for the test database, reading the login from
// ~/.config/dev-copies/s2command/ps-dev-url.txt. Prints no password. Prints the new id.
//   node scripts/make-dev-hyperdrive.mjs            create
//   node scripts/make-dev-hyperdrive.mjs <id>       update an existing dev configuration instead
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const url = new URL(fs.readFileSync(path.join(os.homedir(), '.config', 'dev-copies', 's2command', 'ps-dev-url.txt'), 'utf8').trim());
if (url.pathname !== '/s2command_dev') throw new Error('The saved login does not point at the s2command_dev database; stopping.');
const id = process.argv[2];
const args = id ? ['hyperdrive', 'update', id] : ['hyperdrive', 'create', 's2-command-dev'];
args.push('--host', url.hostname, '--port', url.port || '5432', '--user', decodeURIComponent(url.username),
  '--password', decodeURIComponent(url.password), '--database', 's2command_dev', '--caching-disabled', 'true');
const r = spawnSync('npx', ['wrangler', ...args], { encoding: 'utf8', shell: true, cwd: path.resolve(import.meta.dirname, '..') });
let out = `${r.stdout}\n${r.stderr}`;
out = out.split(decodeURIComponent(url.password)).join('<hidden>');
console.log(out.slice(-1500));
process.exitCode = r.status ?? 1;
