// Quick check of the hosted test copy: health, page with TEST bar, demo sign-in, one signed-in API call.
//   node scripts/check-dev.mjs
const base = 'https://s2-command-dev.smartsyndicator.workers.dev';
const h = await fetch(`${base}/health`);
console.log('health', h.status, (await h.text()).slice(0, 80));
const page = await fetch(base);
const html = await page.text();
console.log('page', page.status, 'TEST bar:', html.includes('TEST COPY'));
const login = await fetch(`${base}/api/auth/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: base },
  body: JSON.stringify({ email: 'demo@test.local', password: 'Test-pass-12345!' }),
});
console.log('sign-in', login.status);
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
for (const p of ['/api/auth/get-session', '/api/sessions?agent=ghl', '/api/business-plan']) {
  const r = await fetch(base + p, { headers: { cookie } });
  const t = await r.text();
  console.log(p, r.status, t.replace(/\s+/g, ' ').slice(0, 160));
}
const bad = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ email: 'x@y.z', password: 'nope-nope-1' }) });
console.log('wrong password rejected:', bad.status);
