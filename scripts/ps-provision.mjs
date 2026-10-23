// Creates one app's database inside the shared PlanetScale server: a database, an owner role (runs the schema script) and
// a runtime role with data access only (what the Worker connects as through Hyperdrive). Safe to rerun: existing pieces
// are kept and passwords are only generated the first time. Connection strings go to private files, never to the screen.
//   node scripts/ps-provision.mjs <admin url file> <name> <output folder>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const [adminFile, name, outDir] = process.argv.slice(2);
if (!adminFile || !name || !outDir) throw new Error('usage: ps-provision.mjs <admin url file> <name> <output folder>');
if (!/^[a-z][a-z0-9_]{1,30}$/.test(name)) throw new Error('name must be lowercase letters, digits and underscores');

const admin = new URL(fs.readFileSync(adminFile, 'utf8').trim());
const owner = `${name}_owner`;
const app = `${name}_app`;
fs.mkdirSync(outDir, { recursive: true });

function secretFile(file, make) {
  const p = path.join(outDir, file);
  if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  const v = make();
  fs.writeFileSync(p, v + '\n', { mode: 0o600 });
  return v;
}
const ownerPass = secretFile(`${name}-owner-password.txt`, () => crypto.randomBytes(24).toString('base64url'));
const appPass = secretFile(`${name}-app-password.txt`, () => crypto.randomBytes(24).toString('base64url'));

const q = (s) => `"${s.replace(/"/g, '""')}"`;
const lit = (s) => `'${s.replace(/'/g, "''")}'`;

const c = new pg.Client({ connectionString: admin.toString(), connectionTimeoutMillis: 15000 });
await c.connect();
for (const [role, pass] of [[owner, ownerPass], [app, appPass]]) {
  const have = await c.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
  if (have.rowCount) console.log(`role ${role}: already there`);
  else {
    await c.query(`CREATE ROLE ${q(role)} LOGIN PASSWORD ${lit(pass)}`);
    console.log(`role ${role}: created`);
  }
}
// The admin role must be a member of a role to hand a database to it.
await c.query(`GRANT ${q(owner)} TO CURRENT_USER`).catch((e) => console.log('grant owner to admin:', e.message));
const haveDb = await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
if (haveDb.rowCount) console.log(`database ${name}: already there`);
else {
  await c.query(`CREATE DATABASE ${q(name)} OWNER ${q(owner)}`);
  console.log(`database ${name}: created`);
}
await c.end();

// Inside the new database: the runtime role gets data access only, now and for tables the owner creates later.
const u2 = new URL(admin.toString());
u2.pathname = `/${name}`;
const c2 = new pg.Client({ connectionString: u2.toString(), connectionTimeoutMillis: 15000 });
await c2.connect();
await c2.query(`REVOKE ALL ON DATABASE ${q(name)} FROM PUBLIC`);
await c2.query(`GRANT CONNECT ON DATABASE ${q(name)} TO ${q(app)}`);
await c2.query(`GRANT USAGE ON SCHEMA public TO ${q(app)}`);
// S2's sync engine creates cache tables while running, so its runtime role may create tables in this database's public schema.
await c2.query(`GRANT CREATE ON SCHEMA public TO ${q(app)}`);
await c2.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${q(owner)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${q(app)}`);
await c2.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${q(owner)} IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${q(app)}`);
await c2.end();

for (const [file, role, pass] of [[`${name}-owner-url.txt`, owner, ownerPass], [`${name}-app-url.txt`, app, appPass]]) {
  const u = new URL(admin.toString());
  // PlanetScale logins are "<role>.<branch id>"; the branch id is the part after the dot in the admin login.
  u.username = `${role}.${decodeURIComponent(admin.username).split('.').pop()}`;
  u.password = pass;
  u.pathname = `/${name}`;
  u.search = 'sslmode=verify-full';
  fs.writeFileSync(path.join(outDir, file), u.toString() + '\n', { mode: 0o600 });
}
console.log(`done: connection strings saved in ${outDir} (not shown)`);
