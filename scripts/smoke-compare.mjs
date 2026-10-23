// Replays the same requests against the Node reference server and the Worker, then diffs status, content type,
// browser-visible headers and body. Signed-out routes only; signed-in comparisons come from parity.mjs.
// Usage: node scripts/smoke-compare.mjs [nodeBase] [workerBase]
const NODE = process.argv[2] || 'http://127.0.0.1:3101';
const WORKER = process.argv[3] || 'http://127.0.0.1:8787';

const steps = [
  ['GET', '/health'],
  ['GET', '/'],
  ['GET', '/index.html'],
  ['GET', '/favicon.ico'],
  ['GET', '/no-such-page'],
  ['GET', '/assets/missing.js'],
  ['GET', '/api/overview'],
  ['GET', '/api/digits/status'],
  ['POST', '/api/chat', { message: 'hi' }],
  ['POST', '/auth/logout', {}],
  ['GET', '/auth/digits'],
  ['GET', '/api/auth/get-session'],
  ['POST', '/api/auth/sign-in/email', { email: 'nobody@example.com', password: 'wrong-password' }],
  ['POST', '/api/auth/sign-up/email', { email: 'intruder@example.com', password: 'a-long-password-123', name: 'x' }],
  ['POST', '/api/chat', '{broken json', 'raw'],
];

const HEADERS = [
  'content-type', 'cache-control', 'x-content-type-options', 'x-frame-options', 'strict-transport-security',
  'referrer-policy', 'cross-origin-opener-policy', 'cross-origin-resource-policy', 'x-dns-prefetch-control',
  'origin-agent-cluster', 'x-permitted-cross-domain-policies', 'x-xss-protection', 'access-control-allow-origin',
  'allow', 'accept-ranges',
];

async function hit(base, [method, path, body, raw]) {
  const init = { method, redirect: 'manual', headers: {} };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = raw ? body : JSON.stringify(body);
  }
  try {
    const res = await fetch(base + path, init);
    const text = await res.text();
    const headers = {};
    for (const h of HEADERS) if (res.headers.has(h)) headers[h] = res.headers.get(h);
    // Each server names itself in a few web addresses; compare with the address replaced.
    const normalised = text.split(base).join('<BASE>');
    return { status: res.status, headers, body: normalised.slice(0, 4000), length: text.length };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

let differences = 0;
for (const step of steps) {
  const [a, b] = [await hit(NODE, step), await hit(WORKER, step)];
  const label = `${step[0]} ${step[1]}`;
  const problems = [];
  if (a.error || b.error) problems.push(`error node=${a.error} worker=${b.error}`);
  else {
    if (a.status !== b.status) problems.push(`status ${a.status} vs ${b.status}`);
    for (const h of HEADERS) if (a.headers[h] !== b.headers[h]) problems.push(`header ${h}: ${a.headers[h]} | ${b.headers[h]}`);
    if (a.body !== b.body) problems.push(`body differs (len ${a.length} vs ${b.length})`);
  }
  if (problems.length) {
    differences++;
    console.log(`DIFF  ${label}\n      ${problems.join('\n      ')}`);
  } else {
    console.log(`same  ${label}  [${a.status}]`);
  }
}
console.log(`\n${steps.length} steps, ${differences} with differences`);
process.exit(differences ? 1 : 0);
