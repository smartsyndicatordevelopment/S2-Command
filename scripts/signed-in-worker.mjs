// Calls read-only signed-in routes on a deployed host with the test session cookie (see mint-test-session.mjs) and prints
// status, size and time only, never bodies. Usage: node scripts/signed-in-worker.mjs [base]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.argv[2] || 'https://s2-command.throbbing-dawn-3295.workers.dev';
const value = fs.readFileSync(path.join(os.homedir(), '.config', 's2-migration', 'test-session-cookie.txt'), 'utf8').trim();
const cookie = `__Secure-better-auth.session_token=${value}`;
const routes = [
  '/api/auth/get-session',
  '/api/sessions/overview',
  '/api/sessions/overview/changelog',
  '/api/business-plan',
  '/api/status/integrations',
  '/api/integrate/systems',
  '/api/ghl/email-studio/history',
];
for (const r of routes) {
  const t0 = Date.now();
  const res = await fetch(base + r, { headers: { cookie } });
  const body = await res.text();
  let detail = '';
  try {
    const j = JSON.parse(body);
    detail = Array.isArray(j) ? `array of ${j.length}` : `object keys: ${Object.keys(j).slice(0, 6).join(',')}`;
  } catch { detail = 'not json'; }
  console.log(String(res.status).padEnd(4), `${Date.now() - t0} ms`.padEnd(8), `${body.length}B`.padEnd(8), r.padEnd(36), detail);
}
