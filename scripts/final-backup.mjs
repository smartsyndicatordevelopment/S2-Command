// One last restorable backup of Railway's Postgres (pg_dump, gzip) saved into a private folder.
// The dump travels as base64 text because the Railway tool translates line endings in a raw binary stream, which corrupts gzip.
//   node scripts/final-backup.mjs <output file .sql.gz>
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: final-backup.mjs <output file .sql.gz>');
const exe = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.exe');
const key = path.join(os.homedir(), '.ssh', 'railway_s2_migration');
const child = spawn(exe, [
  'ssh', '--project', '64a4ce43-e88d-412a-8fa9-7f9728f9cf4e', '--environment', '3c2fac31-6dee-4901-bfbe-e77e96d38acf',
  '--service', 'Postgres', '-i', key, '--', 'sh', '-c',
  'echo @@START; pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-acl | gzip -c | base64; echo @@END',
], { stdio: ['ignore', 'pipe', 'pipe'] });
let text = '';
let err = '';
child.stdout.on('data', (d) => (text += d));
child.stderr.on('data', (d) => (err += d));
child.on('close', (code) => {
  const m = text.match(/@@START\s*([\s\S]*?)\s*@@END/);
  if (code !== 0 || !m) {
    console.log(`FAILED: exit ${code}, no complete dump in the output. First 200 chars: ${text.slice(0, 200)} ${err.slice(0, 100)}`);
    process.exit(1);
  }
  const bytes = Buffer.from(m[1].replace(/[\r\n\s]/g, ''), 'base64');
  fs.writeFileSync(out, bytes);
  console.log(`wrote ${bytes.length} bytes (gzip magic ${bytes[0] === 0x1f && bytes[1] === 0x8b ? 'ok' : 'WRONG'})`);
});
