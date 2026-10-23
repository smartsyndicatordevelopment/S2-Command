// Schema work the Node server does at start-up, run on its own before a deploy (a Worker has no start-up phase):
// the app's migrations, Better Auth's tables, and the owner/admin housekeeping. Safe to rerun.
//
// Usage:
//   node scripts/db-prepare.cjs --local-test s2_cf     local test database with throwaway values (never real keys)
//   node scripts/db-prepare.cjs                         uses DATABASE_URL and BETTER_AUTH_SECRET from the environment
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

const args = process.argv.slice(2);
if (args[0] === '--local-test') {
  process.env.DATABASE_URL = `postgresql://frost:frost@127.0.0.1:5433/${args[1] || 's2_cf'}`;
  process.env.BETTER_AUTH_SECRET = 'local-test-auth-value-not-real-0123456789abcdef';
  process.env.AUTH_ALLOWED_EMAILS = 'test@example.com';
  process.env.BETTER_AUTH_URL = 'http://localhost:8787';
}

const { runMigrations, getPool } = require('../server/lib/db');
const { runAuthMigrations, seedAuthCleanup, isConfigured } = require('../server/lib/auth');

(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  await runMigrations();
  if (isConfigured()) {
    const res = await runAuthMigrations();
    if (res.error) throw new Error('better-auth migration failed: ' + res.error);
    await seedAuthCleanup();
  } else {
    console.warn('BETTER_AUTH_SECRET not set -- skipped Better Auth tables');
  }
  // express-session store table (the Node server creates it lazily; the Worker's database role may not be allowed to).
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    ) WITH (OIDS=FALSE)`).catch(async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL
      )`);
  });
  await getPool().query('ALTER TABLE "user_sessions" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE')
    .catch(() => {});
  await getPool().query('CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "user_sessions" ("expire")');
  console.log('database prepared');
  await getPool().end();
})().catch((e) => { console.error(e.message); process.exit(1); });
