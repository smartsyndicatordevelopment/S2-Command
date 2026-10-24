// Quick check of the hosted test copy: health, page with TEST bar, demo sign-in, and the demo data counts.
//   node scripts/check-dev.mjs
const base = 'https://s2-command-dev.smartsyndicator.workers.dev';
const h = await fetch(`${base}/health`);
console.log('health', h.status, (await h.text()).slice(0, 80));
const page = await fetch(base);
console.log('page', page.status, 'TEST bar:', (await page.text()).includes('TEST COPY'));
const login = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ email: 'demo@test.local', password: 'Test-pass-12345!' }),
});
console.log('sign-in', login.status);
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
const get = async (p) => { const r = await fetch(base + p, { headers: { cookie } }); return [r.status, await r.json().catch(() => null)]; };
for (const agent of ['ghl', 'clickup', 'fb', 'overview', 'digits', 'make']) {
  const [s1, sessions] = await get(`/api/sessions/${agent}`);
  const [s2, log] = await get(`/api/sessions/${agent}/changelog`);
  let msgs = 0;
  for (const s of sessions || []) msgs += ((await get(`/api/sessions/${agent}/${s.id}/messages`))[1] || []).length;
  console.log(agent, 'sessions', s1, (sessions || []).length, 'messages', msgs, 'changelog', s2, (log || []).length);
}
const [ps, plan] = await get('/api/business-plan');
console.log('business-plan', ps, 'phases', plan?.phases?.length, 'risks', plan?.risks?.length, 'rows', plan?.costComparison?.rows?.length, 'vision starts:', String(plan?.vision).slice(0, 30));
const bad = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email: 'x@y.z', password: 'nope-nope-1' }) });
console.log('wrong password rejected:', bad.status);
