// Creates the two local test databases (Node reference copy and Worker copy) on the local test Postgres.
// Usage: node scripts/local-dbs.cjs
const { Client } = require('pg');

(async () => {
  const c = new Client({ connectionString: 'postgresql://frost:frost@127.0.0.1:5433/postgres', connectionTimeoutMillis: 5000 });
  await c.connect();
  for (const n of ['s2_node', 's2_cf']) {
    const r = await c.query('select 1 from pg_database where datname=$1', [n]);
    if (!r.rows.length) await c.query(`CREATE DATABASE ${n} ENCODING 'UTF8' TEMPLATE template0`);
    console.log(n, 'ready');
  }
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });
