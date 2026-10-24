// Prepares the TEST database (s2command_dev) and loads invented demo data. Safe to repeat. Prints no secrets.
//   node scripts/seed-dev.cjs
// Reads the dev database login from ~/.config/dev-copies/s2command/ps-dev-url.txt and the dev secrets from dev-secrets.json
// (only inside this process). Refuses to run unless the database name is s2command_dev.
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const dir = path.join(os.homedir(), '.config', 'dev-copies', 's2command');
const url = fs.readFileSync(path.join(dir, 'ps-dev-url.txt'), 'utf8').trim();
if (new URL(url).pathname !== '/s2command_dev') { console.error('Refusing: this is not the s2command_dev database.'); process.exit(1); }
const secrets = JSON.parse(fs.readFileSync(path.join(dir, 'dev-secrets.json'), 'utf8'));
const DEMO_EMAIL = 'demo@test.local';
const DEMO_PASSWORD = 'Test-pass-12345!';

process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET = secrets.BETTER_AUTH_SECRET;
process.env.BETTER_AUTH_URL = 'https://s2-command-dev.smartsyndicator.workers.dev';
process.env.AUTH_OWNER_EMAIL = DEMO_EMAIL;
process.env.AUTH_ALLOWED_EMAILS = DEMO_EMAIL;

// 1. Tables: the app's migrations, Better Auth's tables and the session table (same script production uses).
const prep = spawnSync(process.execPath, [path.join(__dirname, 'db-prepare.cjs')], { encoding: 'utf8', env: process.env });
console.log((prep.stdout + prep.stderr).trim().split('\n').slice(-3).join('\n'));
if (prep.status !== 0) process.exit(1);

(async () => {
  const { getPool } = require('../server/lib/db');
  const { getAuth } = require('../server/lib/auth');
  const pool = getPool();
  // 2. Demo login, made with the app's own sign-up code.
  const have = await pool.query('SELECT 1 FROM "user" WHERE lower(email) = $1', [DEMO_EMAIL]);
  if (!have.rowCount) {
    const auth = await getAuth();
    await auth.api.signUpEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo User' } });
    console.log('made the demo login');
  } else console.log('demo login already there');
  await pool.query('UPDATE "user" SET role = $1, "emailVerified" = true WHERE lower(email) = $2', ['admin', DEMO_EMAIL]);

  // 3. Invented demo rows (replaced on every run).
  await pool.query("DELETE FROM chat_sessions WHERE name LIKE 'Demo:%'");
  await pool.query("DELETE FROM changelog_entries WHERE id LIKE 'demo-%'");
  const s = await pool.query("INSERT INTO chat_sessions (agent, name) VALUES ('ghl', 'Demo: Welcome chat') RETURNING id");
  await pool.query("INSERT INTO chat_messages (session_id, role, content) VALUES ($1,'user','What can this test copy do?'),($1,'assistant','This is a demo conversation with invented text. Nothing real is connected here.')", [s.rows[0].id]);
  await pool.query("INSERT INTO chat_sessions (agent, name) VALUES ('clickup', 'Demo: Sample planning chat')");
  for (let i = 1; i <= 3; i++) {
    await pool.query("INSERT INTO changelog_entries (id, agent, description, action, result) VALUES ($1,'ghl',$2,'{}','{}')", [`demo-${i}`, `Demo change ${i} (invented, nothing was changed anywhere)`]);
  }
  console.log('demo data loaded');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
