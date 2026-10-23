// Runs Wrangler with the migration's Cloudflare API token, read from a private file outside the repo.
// The token is never printed. Usage: node scripts/wr.mjs <wrangler arguments>
//   node scripts/wr.mjs whoami
//   node scripts/wr.mjs hyperdrive list
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tokenFile = path.join(os.homedir(), '.config', 's2-migration', 'cloudflare-token');
const token = fs.readFileSync(tokenFile, 'utf8').trim();
const r = spawnSync('npx', ['wrangler', ...process.argv.slice(2)], {
  cwd: path.resolve(import.meta.dirname, '..'),
  shell: true,
  encoding: 'utf8',
  env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: '1f8a493845a44c1c695cde23d2e468f2' },
});
process.stdout.write((r.stdout || '').split(token).join('<token>'));
process.stderr.write((r.stderr || '').split(token).join('<token>'));
process.exit(r.status ?? 1);
