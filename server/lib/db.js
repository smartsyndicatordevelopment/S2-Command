const { Pool } = require('pg');
const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('fs');
const path = require('path');

// On Node there is one shared pool. On Cloudflare a Worker request must not reuse a connection opened by an
// earlier request, so worker/index.js builds a small pool per request (through Hyperdrive) and runs the request
// inside runWithPool(); every caller keeps using getPool()/query() unchanged.
const requestPool = new AsyncLocalStorage();
let sharedPool;

function makePool(connectionString, options = {}) {
  const pool = new Pool({
    connectionString,
    ssl: connectionString?.includes('railway.internal') || options.noSsl
      ? false
      : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ...options.pool,
  });
  pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
  });
  return pool;
}

function realPool() {
  const scoped = requestPool.getStore();
  if (scoped) return scoped;
  if (!sharedPool) sharedPool = makePool(process.env.DATABASE_URL);
  return sharedPool;
}

function runWithPool(pool, fn) {
  return requestPool.run(pool, fn);
}

// A Proxy stands in for the pool: express-session's store and better-auth capture it once at load time, before
// any request exists, and still need the current request's pool afterwards. The `has` trap answers
// `"connect" in pool`, which better-auth checks while loading.
const poolProxy = new Proxy({}, {
  get(_t, prop) {
    const pool = realPool();
    const value = pool[prop];
    return typeof value === 'function' ? value.bind(pool) : value;
  },
  has(_t, prop) { return prop in Pool.prototype || prop in realPool(); },
});

function getPool() {
  return poolProxy;
}

async function query(sql, params) {
  const client = await realPool().connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function runMigrations() {
  if (!process.env.DATABASE_URL) {
    console.warn('DATABASE_URL not set -- skipping database migrations');
    return;
  }

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Ensure migrations table exists
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      ran_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const { rows } = await query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
    if (rows.length > 0) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    await query(sql);
    await query('INSERT INTO _migrations(filename) VALUES($1)', [file]);
    console.log(`Migration applied: ${file}`);
  }
}

module.exports = { query, runMigrations, getPool, makePool, runWithPool };
