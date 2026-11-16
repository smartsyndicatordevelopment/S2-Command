// End-to-end test of "passkey as the second sign-in step" against the local test database (throwaway values, never real keys).
//   node scripts/local-dbs.cjs && node scripts/db-prepare.cjs --local-test s2_node && node scripts/test-passkey-second-step.mjs
// It talks to the real better-auth handler in-process and plays the part of the browser and of a passkey device: the device
// is a software key pair made here, and its answers are signed the same way a real authenticator signs them.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ORIGIN = 'http://localhost:3101';
Object.assign(process.env, {
  DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://frost:frost@127.0.0.1:5433/s2_node',
  BETTER_AUTH_SECRET: 'local-test-auth-value-not-real-0123456789abcdef',
  BETTER_AUTH_URL: ORIGIN,
  AUTH_OWNER_EMAIL: 'pk-a@example.com',
  AUTH_ALLOWED_EMAILS: 'pk-a@example.com,pk-b@example.com',
});
const { getAuth } = require('../server/lib/auth');
const { query, getPool } = require('../server/lib/db');
const auth = await getAuth();

let failed = 0;
const test = async (name, fn) => { try { await fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); } };

// A tiny browser: keeps cookies between calls.
function browser() {
  const jar = new Map();
  return {
    jar,
    async call(path, { method = 'POST', body } = {}) {
      const headers = { origin: ORIGIN, 'content-type': 'application/json' };
      if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
      const res = await auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) }));
      for (const c of res.headers.getSetCookie()) {
        const [pair, ...attrs] = c.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1);
        const gone = !value || attrs.some((a) => /max-age=0/i.test(a));
        if (gone) jar.delete(name); else jar.set(name, value);
      }
      let json = null;
      try { json = await res.json(); } catch { /* empty body */ }
      return { status: res.status, json };
    },
    signedIn() { return [...jar.keys()].some((k) => k.endsWith('session_token')); },
  };
}

// A software passkey device.
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function makeDevice() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  // The public key in the COSE format passkeys use: {1: 2 (EC), 3: -7 (ES256), -1: 1 (P-256), -2: x, -3: y}
  const cose = Buffer.concat([Buffer.from([0xa5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20]), x, Buffer.from([0x22, 0x58, 0x20]), y]);
  const id = b64u(crypto.randomBytes(16));
  let counter = 0;
  return {
    id, cose,
    answer(challenge, { origin = ORIGIN, rpId = 'localhost', key = privateKey, flags = 0x05 } = {}) {
      counter += 1;
      const count = Buffer.alloc(4); count.writeUInt32BE(counter);
      const authData = Buffer.concat([crypto.createHash('sha256').update(rpId).digest(), Buffer.from([flags]), count]);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin, crossOrigin: false }));
      const signature = crypto.sign('sha256', Buffer.concat([authData, crypto.createHash('sha256').update(clientDataJSON).digest()]), key);
      return { id, rawId: id, type: 'public-key', clientExtensionResults: {}, response: { authenticatorData: b64u(authData), clientDataJSON: b64u(clientDataJSON), signature: b64u(signature) } };
    },
  };
}
async function registerDevice(userId, device, name) {
  const rowId = crypto.randomUUID();
  await query(
    'INSERT INTO passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", transports, "createdAt") VALUES ($1,$2,$3,$4,$5,0,$6,false,$7,now())',
    [rowId, name, device.cose.toString('base64'), userId, device.id, 'singleDevice', 'internal']);
  return rowId;
}

const PASSWORD = 'Test-pass-12345!';
await query('DELETE FROM "user" WHERE email = ANY($1)', [['pk-a@example.com', 'pk-b@example.com']]);

const a = browser();
let userA; let userB;
await test('sign up two test people', async () => {
  const r = await a.call('/sign-up/email', { body: { email: 'pk-a@example.com', password: PASSWORD, name: 'A' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  userA = r.json.user.id;
  const b = browser();
  const rb = await b.call('/sign-up/email', { body: { email: 'pk-b@example.com', password: PASSWORD, name: 'B' } });
  assert.equal(rb.status, 200);
  userB = rb.json.user.id;
});

const deviceA = makeDevice();
const deviceB = makeDevice();
let passkeyRowA;
let backupCodes = [];
await test('turning it on needs the right password and at least one passkey', async () => {
  assert.equal((await a.call('/passkey-2fa/enable', { body: { password: 'wrong' } })).status, 400);
  const none = await a.call('/passkey-2fa/enable', { body: { password: PASSWORD } });
  assert.equal(none.status, 400);
  assert.match(none.json.message, /Add a passkey first/);
  passkeyRowA = await registerDevice(userA, deviceA, 'Test device A');
  await registerDevice(userB, deviceB, 'Test device B');
  const noCodes = await a.call('/passkey-2fa/enable', { body: { password: PASSWORD } });
  assert.equal(noCodes.status, 400, 'backup codes must exist before it can be turned on');
  assert.match(noCodes.json.message, /Backup codes/);
  // What the Settings page does: make the backup codes with the library's endpoint, then turn it on.
  const made = await a.call('/two-factor/enable', { body: { password: PASSWORD } });
  assert.equal(made.status, 200);
  backupCodes = made.json.backupCodes;
  assert.ok(backupCodes.length >= 5);
  assert.equal((await a.call('/passkey-2fa/enable', { body: { password: PASSWORD } })).status, 200);
  const s = await a.call('/passkey-2fa/status', { method: 'GET' });
  assert.deepEqual(s.json, { enabled: true, authenticatorApp: false, passkeys: 1, backupCodes: true });
});

await test('status and enable refuse someone who is not signed in', async () => {
  const anon = browser();
  assert.equal((await anon.call('/passkey-2fa/status', { method: 'GET' })).status, 401);
  assert.equal((await anon.call('/passkey-2fa/enable', { body: { password: PASSWORD } })).status, 401);
});

await test('the only second step cannot be removed', async () => {
  const r = await a.call('/passkey/delete-passkey', { body: { id: passkeyRowA } });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /only second sign-in step/);
  assert.equal((await query('SELECT count(*)::int AS n FROM passkey WHERE id = $1', [passkeyRowA])).rows[0].n, 1);
});

const start = async () => {
  const b = browser();
  const r = await b.call('/sign-in/email', { body: { email: 'pk-a@example.com', password: PASSWORD } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.twoFactorRedirect, true);
  assert.equal(b.signedIn(), false, 'the password alone must not sign in');
  return b;
};

await test('the password alone no longer signs in', async () => {
  const b = await start();
  const s = await b.call('/get-session', { method: 'GET' });
  assert.equal(s.json, null);
});

await test('no pending sign-in: options and verify are refused', async () => {
  const anon = browser();
  assert.equal((await anon.call('/passkey-2fa/options')).status, 401);
  assert.equal((await anon.call('/passkey-2fa/verify', { body: { response: deviceA.answer('x') } })).status, 401);
});

await test('the right passkey finishes the sign-in, and the same answer cannot be used twice', async () => {
  const b = await start();
  const o = await b.call('/passkey-2fa/options');
  assert.equal(o.status, 200);
  assert.equal(o.json.available, true);
  assert.deepEqual(o.json.options.allowCredentials.map((c) => c.id), [deviceA.id]);
  const answer = deviceA.answer(o.json.options.challenge);
  const saved = new Map(b.jar);
  const v = await b.call('/passkey-2fa/verify', { body: { response: answer } });
  assert.equal(v.status, 200, JSON.stringify(v.json));
  assert.equal(b.signedIn(), true);
  assert.equal((await b.call('/get-session', { method: 'GET' })).json.user.email, 'pk-a@example.com');
  // Replay with the cookies from before the sign-in finished.
  const replay = browser();
  for (const [k, val] of saved) replay.jar.set(k, val);
  assert.equal((await replay.call('/passkey-2fa/verify', { body: { response: answer } })).status, 401);
  assert.equal(replay.signedIn(), false);
});

await test('a wrong key, a wrong site and someone else\'s passkey are all refused', async () => {
  const b = await start();
  const fresh = async () => (await b.call('/passkey-2fa/options')).json.options.challenge;
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(await fresh(), { key: other }) } })).status, 401);
  assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(await fresh(), { origin: 'https://evil.example' }) } })).status, 401);
  assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(await fresh(), { rpId: 'evil.example' }) } })).status, 401);
  // Person B's real passkey, correctly signed, must not finish person A's sign-in.
  assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceB.answer(await fresh()) } })).status, 401);
  // An answer to an old challenge is refused too.
  const old = await fresh(); await fresh();
  assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(old) } })).status, 401);
  assert.equal(b.signedIn(), false);
});

await test('after five failed tries the password has to be entered again', async () => {
  const b = await start(); // a new pending sign-in with a fresh counter
  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  for (let i = 0; i < 5; i++) {
    const c = (await b.call('/passkey-2fa/options')).json.options.challenge;
    assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(c, { key: other }) } })).status, 401, `try ${i + 1}`);
  }
  const c = (await b.call('/passkey-2fa/options')).json.options.challenge;
  const locked = await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(c) } });
  assert.equal(locked.status, 400);
  assert.match(locked.json.message, /Too many tries/);
  assert.equal(b.signedIn(), false);
  assert.equal((await b.call('/passkey-2fa/options')).status, 401, 'the pending sign-in is gone');
});

await test('a backup code finishes the sign-in once, when the passkey is lost', async () => {
  const b = await start();
  assert.equal((await b.call('/two-factor/verify-backup-code', { body: { code: 'not-a-real-code' } })).status, 401);
  assert.equal(b.signedIn(), false);
  assert.equal((await b.call('/two-factor/verify-backup-code', { body: { code: backupCodes[0] } })).status, 200);
  assert.equal(b.signedIn(), true);
  const again = await start();
  assert.equal((await again.call('/two-factor/verify-backup-code', { body: { code: backupCodes[0] } })).status, 401, 'a used code must not work twice');
});

await test('passkey-only sign-in needs the device to have checked the person when two-step is on', async () => {
  const direct = async (flags) => {
    const b = browser();
    const o = await b.call('/passkey/generate-authenticate-options', { method: 'GET' });
    const r = await b.call('/passkey/verify-authentication', { body: { response: deviceA.answer(o.json.challenge, { flags }) } });
    return { status: r.status, signedIn: b.signedIn() };
  };
  assert.deepEqual(await direct(0x01), { status: 401, signedIn: false }); // touched, but no fingerprint, face or PIN
  assert.deepEqual(await direct(0x05), { status: 200, signedIn: true });
});

await test('a person without two-step sign-in is not affected', async () => {
  const b = browser();
  const r = await b.call('/sign-in/email', { body: { email: 'pk-b@example.com', password: PASSWORD } });
  assert.equal(r.status, 200);
  assert.equal(b.signedIn(), true);
});

await test('turning two-step sign-in off lets the passkey be removed', async () => {
  const b = await start();
  const c = (await b.call('/passkey-2fa/options')).json.options.challenge;
  assert.equal((await b.call('/passkey-2fa/verify', { body: { response: deviceA.answer(c) } })).status, 200);
  assert.equal((await b.call('/two-factor/disable', { body: { password: PASSWORD } })).status, 200);
  assert.equal((await b.call('/passkey-2fa/status', { method: 'GET' })).json.enabled, false);
  assert.equal((await b.call('/passkey/delete-passkey', { body: { id: passkeyRowA } })).status, 200);
});

await query('DELETE FROM "user" WHERE email = ANY($1)', [['pk-a@example.com', 'pk-b@example.com']]);
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
await getPool().end();
process.exit(failed ? 1 : 0);
