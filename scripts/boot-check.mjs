// Starts the Node entry point (what Railway runs) with NO database and throwaway values, checks that it boots and answers, then
// stops it. Proves every module loads and the server starts; it does not test database behaviour.
//   node scripts/boot-check.mjs
import { spawn } from 'node:child_process';

const port = '3102';
const env = { ...process.env, NODE_ENV: 'production', PORT: port, SESSION_SECRET: 'boot-check-value', SYNC_INTERVAL_MINUTES: '600' };
delete env.DATABASE_URL;
const child = spawn(process.execPath, ['server/index.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = false;
for (let i = 0; i < 20 && !ok; i++) {
  await wait(500);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/health`);
    ok = r.status === 200 && (await r.json()).ok === true;
  } catch { /* not up yet */ }
}
const page = ok ? (await fetch(`http://127.0.0.1:${port}/`)).status : 0;
const api = ok ? (await fetch(`http://127.0.0.1:${port}/api/overview`)).status : 0;
child.kill();
console.log(ok ? 'PASS' : 'FAIL', `health ok=${ok}, page ${page}, protected route ${api} (expect 200, 200, 401)`);
if (!ok) console.log(log.slice(-600));
process.exit(ok && page === 200 && api === 401 ? 0 : 1);
