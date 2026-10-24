// Makes the test copy's throwaway secrets (random values, no real keys) and saves them to
// ~/.config/dev-copies/s2command/dev-secrets.json, then uploads them to the s2-command-dev Worker only.
//   node scripts/make-dev-secrets.mjs            make (if missing) and upload
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.homedir(), '.config', 'dev-copies', 's2command');
const file = path.join(dir, 'dev-secrets.json');
if (!fs.existsSync(file)) {
  const hex = (n) => crypto.randomBytes(n).toString('hex');
  fs.writeFileSync(file, JSON.stringify({ BETTER_AUTH_SECRET: hex(32), SESSION_SECRET: hex(32), ENCRYPTION_KEY: hex(32) }, null, 2), { mode: 0o600 });
  console.log('Made', file);
}
const r = spawnSync('npx', ['wrangler', 'secret', 'bulk', file, '-c', 'wrangler.dev.jsonc'], { encoding: 'utf8', shell: true, cwd: path.resolve(import.meta.dirname, '..') });
console.log(`${r.stdout}\n${r.stderr}`.slice(-800));
process.exitCode = r.status ?? 1;
