// Rehearses the switch on the staging hostname and times it. The staging record is a DNS-only CNAME to Railway; the Worker has
// a route for it (inert while DNS-only). Switching = turning the proxy on; rolling back = turning it off.
//   node scripts/switch-rehearsal.mjs <staging record id> [hostname]
// Prints the seconds from the proxy call to the first answer from the Worker, then from the rollback call to the first answer
// that is no longer the Worker, polling every 2 s. Never touches the real hostname.
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const [recordId, host = 'command-staging.smartsyndicator.com'] = process.argv.slice(2);
if (!recordId) throw new Error('usage: switch-rehearsal.mjs <staging record id> [hostname]');
if (host === 'command.smartsyndicator.com') throw new Error('refusing to rehearse on the real hostname');
const token = fs.readFileSync(path.join(os.homedir(), '.config', 's2-migration', 'cloudflare-token'), 'utf8').trim();
const zoneId = (await (await fetch('https://api.cloudflare.com/client/v4/zones?name=smartsyndicator.com', { headers: { Authorization: 'Bearer ' + token } })).json()).result[0].id;
const setProxy = async (on) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${recordId}`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ proxied: on }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors));
};
// Who answered: the Worker (this app's /health from Cloudflare with the app's own header set) or something else.
const probe = async () => {
  // A brand-new connection every time (agent: false): a reused keep-alive connection keeps reaching the old server after DNS moved.
  return new Promise((resolve) => {
    const req = https.request({ host, path: '/health', method: 'GET', agent: false, headers: { connection: 'close', 'cache-control': 'no-cache' }, timeout: 5000 }, (res) => {
      let text = '';
      res.on('data', (d) => (text += d));
      res.on('end', () => {
        const server = String(res.headers.server || '');
        resolve({ status: res.statusCode, worker: res.statusCode === 200 && text.includes('"ok":true') && server.toLowerCase() === 'cloudflare', server });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (e) => resolve({ status: 0, worker: false, server: 'error ' + (e.code || e.message) }));
    req.end();
  });
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (wantWorker, limitMs) => {
  const t0 = Date.now();
  let failures = 0;
  while (Date.now() - t0 < limitMs) {
    const p = await probe();
    if (p.status === 0) failures++;
    if (p.worker === wantWorker) return { seconds: (Date.now() - t0) / 1000, failures };
    await wait(2000);
  }
  return { seconds: null, failures };
};

console.log('before:', await probe());
console.log('switching (proxy on)...');
const t0 = Date.now();
await setProxy(true);
console.log(`  API call took ${((Date.now() - t0) / 1000).toFixed(1)} s`);
const on = await until(true, 10 * 60 * 1000);
console.log('  first Worker answer after', on.seconds === null ? 'NEVER (10 min)' : on.seconds.toFixed(1) + ' s', `(failed polls: ${on.failures})`);
console.log('rolling back (proxy off)...');
await setProxy(false);
const off = await until(false, 10 * 60 * 1000);
console.log('  first non-Worker answer after', off.seconds === null ? 'not within 10 min' : off.seconds.toFixed(1) + ' s', `(failed polls: ${off.failures})`);
console.log('after:', await probe());
