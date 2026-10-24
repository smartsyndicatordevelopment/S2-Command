// Prepares the TEST database (s2command_dev) and loads invented demo data for "ABC Capital Group". Prints no secrets.
//   node scripts/seed-dev.cjs             prepare tables, make the demo login, (re)load the demo rows (safe to repeat)
//   node scripts/seed-dev.cjs --reset     also clear the demo business plan first, then reseed from scratch
// Only rows made by this script are touched (fixed ids), plus the single business-plan row on --reset.
// Reads the dev database login from ~/.config/dev-copies/s2command/ps-dev-url.txt and the dev secrets from dev-secrets.json
// (only inside this process). Refuses to run unless the database name is s2command_dev.
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { CHATS, CHANGELOG, PLAN } = require('./lib/demo-content.cjs');

const reset = process.argv.includes('--reset');
const dir = path.join(os.homedir(), '.config', 'dev-copies', 's2command');
const url = fs.readFileSync(path.join(dir, 'ps-dev-url.txt'), 'utf8').trim();
const parsed = new URL(url);
if (parsed.pathname !== '/s2command_dev' || !decodeURIComponent(parsed.username).startsWith('s2command_dev')) {
  console.error('Refusing: the saved login is not the s2command_dev test database.');
  process.exit(1);
}
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
console.log((prep.stdout + prep.stderr).trim().split('\n').slice(-1).join('\n'));
if (prep.status !== 0) process.exit(1);

const sessionId = (n) => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ago = (days, extraMinutes = 0) => new Date(Date.now() - days * 86400000 + extraMinutes * 60000).toISOString();

(async () => {
  const { getPool } = require('../server/lib/db');
  const { getAuth } = require('../server/lib/auth');
  const pool = getPool();

  // 2. Demo login, made with the app's own sign-up code.
  const have = await pool.query('SELECT 1 FROM "user" WHERE lower(email) = $1', [DEMO_EMAIL]);
  if (!have.rowCount) {
    const auth = await getAuth();
    await auth.api.signUpEmail({ body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Dana Whitfield (demo)' } });
    console.log('made the demo login');
  } else console.log('demo login already there');
  await pool.query('UPDATE "user" SET role = $1, "emailVerified" = true WHERE lower(email) = $2', ['admin', DEMO_EMAIL]);

  // 3. Clear the previous demo rows (fixed ids / names only), then load them again.
  await pool.query("DELETE FROM chat_sessions WHERE id::text LIKE 'de000000-%' OR name LIKE 'Demo:%'");
  await pool.query("DELETE FROM changelog_entries WHERE id LIKE 'demo-%'");
  if (reset) {
    await pool.query('DELETE FROM business_plan WHERE id = 1');
    await pool.query('DELETE FROM server_cache');
    await pool.query('DELETE FROM rate_limit_hits');
  }

  let messages = 0;
  for (let i = 0; i < CHATS.length; i++) {
    const [agent, name, days, turns] = CHATS[i];
    const id = sessionId(i + 1);
    await pool.query('INSERT INTO chat_sessions (id, agent, name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)',
      [id, agent, name, ago(days, 0), ago(days, turns.length * 2)]);
    for (let t = 0; t < turns.length; t++) {
      await pool.query('INSERT INTO chat_messages (session_id, role, content, created_at) VALUES ($1,$2,$3,$4)',
        [id, turns[t][0], turns[t][1], ago(days, t * 2)]);
      messages++;
    }
  }
  for (let i = 0; i < CHANGELOG.length; i++) {
    const [agent, days, description, action, undone] = CHANGELOG[i];
    await pool.query(
      'INSERT INTO changelog_entries (id, agent, timestamp, description, action, result, undo_action, undone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [`demo-${i + 1}`, agent, ago(days, -i * 7), description, JSON.stringify(action), JSON.stringify({ ok: true, demo: true }),
        JSON.stringify({ type: 'undo_' + action.type }), undone]);
  }
  await pool.query(
    `INSERT INTO business_plan (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [JSON.stringify(PLAN)]);

  console.log(`demo data loaded: ${CHATS.length} chat sessions, ${messages} messages, ${CHANGELOG.length} change-log entries, business plan filled`);
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
