// Creates (or signs in) the throwaway test user on the Node reference and the Worker, replays database-only
// signed-in routes on both and diffs status and normalised body. Test databases only.
// Usage: node scripts/signed-in-compare.mjs [nodeBase] [workerBase]
const NODE = process.argv[2] || 'http://localhost:3101';
const WORKER = process.argv[3] || 'http://localhost:8787';
const EMAIL = 'test@example.com';
const PASSWORD = 'local-test-password-123';

async function login(base) {
  const post = (path, body) => fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body),
  });
  let res = await post('/api/auth/sign-up/email', { email: EMAIL, password: PASSWORD, name: 'Test' });
  if (!res.ok) res = await post('/api/auth/sign-in/email', { email: EMAIL, password: PASSWORD });
  if (!res.ok) throw new Error(`login failed on ${base}: ${res.status} ${await res.text()}`);
  const cookies = res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  if (!cookies) throw new Error(`no session cookie from ${base}`);
  return cookies;
}

const steps = [
  ['GET', '/api/auth/get-session'],
  ['GET', '/api/ghl/email-studio/history'],
  ['DELETE', '/api/ghl/email-studio/history/does-not-exist'],
  ['GET', '/api/integrate/systems'],
  ['GET', '/api/sessions'],
  ['GET', '/api/business-plan'],
  ['GET', '/api/digits/recat/preview?year=2026&month=9'],
  ['POST', '/api/digits/recat/apply', { previewId: 'pv_missing' }],
  ['POST', '/api/chat', { message: '' }],
  ['GET', '/api/does-not-exist'],
];

const norm = (text, base) => text.split(base).join('<BASE>')
  .replace(/"(createdAt|updatedAt|expiresAt|created_at|updated_at)":"[^"]*"/g, '"$1":"<T>"')
  .replace(/"(id|token|userId)":"[^"]*"/g, '"$1":"<ID>"');

async function hit(base, cookie, [method, path, body]) {
  const init = { method, headers: { cookie, origin: base } };
  if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  const res = await fetch(base + path, init);
  return { status: res.status, type: res.headers.get('content-type'), body: norm((await res.text()).slice(0, 3000), base) };
}

const [nodeCookie, workerCookie] = [await login(NODE), await login(WORKER)];
console.log('signed in on both');
let differences = 0;
for (const step of steps) {
  const [a, b] = [await hit(NODE, nodeCookie, step), await hit(WORKER, workerCookie, step)];
  const same = a.status === b.status && a.type === b.type && a.body === b.body;
  if (same) console.log(`same  ${step[0]} ${step[1]}  [${a.status}]`);
  else {
    differences++;
    console.log(`DIFF  ${step[0]} ${step[1]}\n      node   ${a.status} ${a.type} ${a.body.slice(0, 160)}\n      worker ${b.status} ${b.type} ${b.body.slice(0, 160)}`);
  }
}
console.log(`\n${steps.length} steps, ${differences} with differences`);
process.exit(differences ? 1 : 0);
