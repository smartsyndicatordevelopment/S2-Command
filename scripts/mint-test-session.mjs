// Creates (or removes) a short-lived test session for the owner account in the COPY database (s2command on PlanetScale),
// so signed-in routes can be tested on the deployed Worker without the owner's password. Never touches Railway's database.
// The cookie value is written to a private file and never printed.
//   node scripts/mint-test-session.mjs create     writes ~/.config/s2-migration/test-session-cookie.txt
//   node scripts/mint-test-session.mjs remove     deletes the test session row and the cookie file
// Reads the signing value from the Railway variables (read-only) so the Worker accepts the cookie; run from any folder.
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const cmd = process.argv[2];
const dir = path.join(os.homedir(), '.config', 's2-migration');
const cookieFile = path.join(dir, 'test-session-cookie.txt');
const url = fs.readFileSync(path.join(dir, 's2command-owner-url.txt'), 'utf8').trim();
const TOKEN = 's2-migration-test-session-token-0001';
const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 20000 });
await c.connect();
try {
  if (cmd === 'remove') {
    const r = await c.query('DELETE FROM "session" WHERE token = $1', [TOKEN]);
    fs.rmSync(cookieFile, { force: true });
    console.log('removed test session rows:', r.rowCount);
  } else if (cmd === 'create') {
    const railwayExe = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.exe');
    const read = spawnSync(railwayExe, ['variables', '--service', 'S2-Command', '--environment', 'production', '--json'], {
      encoding: 'utf8', cwd: path.resolve(import.meta.dirname, '..', '..', 'S2 Command'),
    });
    if (read.status !== 0) throw new Error('could not read Railway variables');
    const secret = JSON.parse(read.stdout).BETTER_AUTH_SECRET;
    if (!secret) throw new Error('no signing value found');
    const user = (await c.query('SELECT id FROM "user" ORDER BY "createdAt" LIMIT 1')).rows[0];
    if (!user) throw new Error('no user in the copy');
    await c.query('DELETE FROM "session" WHERE token = $1', [TOKEN]);
    await c.query(
      `INSERT INTO "session" (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId")
       VALUES ($1, now() + interval '2 hours', $2, now(), now(), '127.0.0.1', 's2-migration-test', $3)`,
      ['s2-migration-test-session-0001', TOKEN, user.id],
    );
    const signature = crypto.createHmac('sha256', secret).update(TOKEN).digest('base64');
    const value = encodeURIComponent(`${TOKEN}.${signature}`);
    fs.writeFileSync(cookieFile, value, { mode: 0o600 });
    console.log('test session created for the owner account (expires in 2 hours); cookie saved privately');
  } else {
    console.log('usage: create | remove');
  }
} finally {
  await c.end();
}
