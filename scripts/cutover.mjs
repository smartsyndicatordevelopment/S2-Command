// The switch of command.smartsyndicator.com from Railway to the Worker, as scripted stages. Every stage prints timestamps. A stage
// that changes anything only runs with --confirm; without it the stage prints exactly what it would do (a dry run).
//   node scripts/cutover.mjs status                 read-only: who answers where, TTL, Worker health, last scheduled-job heartbeat
//   node scripts/cutover.mjs prepare [--confirm]    a day ahead: lower the real record's TTL to 60 s, add the real route to wrangler.jsonc, deploy
//   node scripts/cutover.mjs switch [--confirm]     final data copy (with the Digits token), stop Railway, turn the job switch on, proxy on, poll
//   node scripts/cutover.mjs rollback [--confirm]   proxy off, restart Railway, job switch off
// Run from the migration worktree. Uses the migration token and the Railway tool (the source folder is linked to the project).
// Only with the owner's explicit yes: see docs/cutover-runbook.md for the order, the checks between stages and the rollback trigger.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sourceFolder = path.resolve(root, '..', 'S2 Command');
const cfg = path.join(os.homedir(), '.config', 's2-migration');
const token = fs.readFileSync(path.join(cfg, 'cloudflare-token'), 'utf8').trim();
const ACCOUNT = '1f8a493845a44c1c695cde23d2e468f2';
const HOST = 'command.smartsyndicator.com';
const WORKERS_DEV = 's2-command.throbbing-dawn-3295.workers.dev';
const [stage = 'status', ...flags] = process.argv.slice(2);
const confirm = flags.includes('--confirm');
const railwayExe = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@railway', 'cli', 'bin', 'railway.exe');

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (...a) => console.log(`[${stamp()}]`, ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const hide = (s) => String(s).split(token).join('<token>');

async function cf(p, opts = {}) {
  const r = await fetch('https://api.cloudflare.com/client/v4' + p, {
    ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  return r.json();
}
const zoneId = async () => (await cf('/zones?name=smartsyndicator.com')).result[0].id;
const recordFor = async (z, name) => (await cf(`/zones/${z}/dns_records?name=${name}`)).result.find((r) => r.type === 'CNAME');

// A brand-new connection each time, or a kept-alive one keeps reaching the old server after DNS has moved.
const probe = (host, p = '/health') => new Promise((resolve) => {
  const req = https.request({ host, path: p, agent: false, headers: { connection: 'close' }, timeout: 5000 }, (res) => {
    let t = ''; res.on('data', (d) => (t += d)); res.on('end', () => resolve({ status: res.statusCode, server: String(res.headers.server || ''), body: t }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', (e) => resolve({ status: 0, server: 'error ' + (e.code || e.message), body: '' }));
  req.end();
});
const isWorker = (p) => p.status === 200 && p.body.includes('"ok":true') && p.server.toLowerCase() === 'cloudflare';
const isRailway = (p) => /railway/i.test(p.server);

function run(label, cmd, args, opts = {}) {
  log(label);
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: opts.shell ?? false, cwd: opts.cwd ?? root, input: opts.input,
    env: { ...process.env, CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
  const out = hide(`${r.stdout || ''}${r.stderr || ''}`).trim().split('\n').slice(-6).join('\n');
  if (out) console.log('   ' + out.replace(/\n/g, '\n   '));
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status}); stopping here.`);
}
const node = (label, script, args = []) => run(label, process.execPath, [path.join('scripts', script), ...args]);
const wrangler = (label, args, input) => run(label, 'npx', ['wrangler', ...args], { shell: true, input });
const railway = (label, args) => run(label, railwayExe, args, { cwd: sourceFolder });

async function until(label, want, limitMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < limitMs) {
    const p = await probe(HOST);
    if (want(p)) { log(`${label}: after ${((Date.now() - t0) / 1000).toFixed(1)} s`); return true; }
    await wait(2000);
  }
  log(`${label}: NOT reached within ${Math.round(limitMs / 1000)} s`);
  return false;
}

async function status() {
  const z = await zoneId();
  const rec = await recordFor(z, HOST);
  log(`record ${HOST}: ${rec.content} ${rec.proxied ? '[proxied]' : '[dns-only]'} ttl=${rec.ttl} id=${rec.id}`);
  const live = await probe(HOST);
  log(`live address answers: status ${live.status}, server "${live.server}" -> ${isWorker(live) ? 'THE WORKER' : isRailway(live) ? 'Railway' : 'something else'}`);
  const wd = await probe(WORKERS_DEV);
  log(`workers.dev answers: status ${wd.status} -> ${isWorker(wd) ? 'ok' : 'NOT OK'}`);
  const w = fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8');
  log(`real route in wrangler.jsonc: ${w.includes(`"pattern": "${HOST}/*"`) ? 'present' : 'not yet (added by prepare)'}`);
}

async function prepare() {
  const z = await zoneId();
  const rec = await recordFor(z, HOST);
  log(`plan: set ${HOST} TTL ${rec.ttl} -> 60 (record stays dns-only, behaviour identical); add route ${HOST}/* (inert while dns-only); deploy`);
  if (!confirm) return log('dry run: nothing changed (add --confirm)');
  const r = await cf(`/zones/${z}/dns_records/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ ttl: 60 }) });
  if (!r.success) throw new Error(JSON.stringify(r.errors));
  log('TTL set to 60 s. Wait at least the old TTL (1 hour) before the switch so every resolver has the short one.');
  const file = path.join(root, 'wrangler.jsonc');
  let w = fs.readFileSync(file, 'utf8');
  if (!w.includes(`"pattern": "${HOST}/*"`)) {
    w = w.replace('"routes": [', `"routes": [\n    { "pattern": "${HOST}/*", "zone_name": "smartsyndicator.com" },`);
    fs.writeFileSync(file, w);
  }
  run('build the client', 'npm', ['run', 'build'], { shell: true });
  node('deploy with the real route (inert while the record is dns-only)', 'wr.mjs', ['deploy']);
  log('prepared. The real record is still dns-only, so visitors still reach Railway.');
}

async function switchOver() {
  const z = await zoneId();
  const rec = await recordFor(z, HOST);
  const steps = [
    'check: Railway answers and the Worker answers on workers.dev',
    'final data copy WITH the Digits token: railway-dump (read-only) then dump-load (refuses to commit unless every checksum matches)',
    `stop Railway: railway down --service S2-Command (reversible with railway redeploy)`,
    'turn the scheduled-job switch on: wrangler secret put JOBS_ENABLED = 1',
    `turn the proxy on for ${HOST} (record ${rec.id})`,
    'poll every 2 s until the Worker answers (expect 1 to 2 minutes), then the checks in the runbook',
  ];
  steps.forEach((s, i) => log(`step ${i + 1}: ${s}`));
  if (!confirm) return log('dry run: nothing changed (add --confirm)');
  const before = await probe(HOST), wd = await probe(WORKERS_DEV);
  if (!isRailway(before)) throw new Error(`Railway is not the one answering the live address now (status ${before.status}, server "${before.server}"); not switching`);
  if (!isWorker(wd)) throw new Error('the Worker does not answer on workers.dev; not switching');
  const t0 = Date.now();
  node('final dump (all tables, including the Digits token)', 'railway-dump.mjs', ['--out', 'dump']);
  node('verified load into the new database', 'dump-load.mjs', [path.join(cfg, 's2command-owner-url.txt'), '--dir', 'dump']);
  railway('stop Railway (HOLD begins: nothing is serving the live address correctly until the proxy flips)', ['down', '--service', 'S2-Command', '-y']);
  wrangler('JOBS_ENABLED=1 on the Worker', ['secret', 'put', 'JOBS_ENABLED'], '1\n');
  const r = await cf(`/zones/${z}/dns_records/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ proxied: true }) });
  if (!r.success) throw new Error(JSON.stringify(r.errors));
  log('proxy on. Polling...');
  const ok = await until('first Worker answer', isWorker, 8 * 60 * 1000);
  log(`total from the first stage: ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!ok) log('NOT SWITCHED within 8 minutes: run "rollback --confirm" unless direct probes show the Worker is answering');
}

async function rollback() {
  const z = await zoneId();
  const rec = await recordFor(z, HOST);
  ['turn the proxy off for ' + HOST, 'restart Railway: railway redeploy --service S2-Command', 'remove the job switch: wrangler secret delete JOBS_ENABLED',
    'anything written on the Worker since the switch is NOT copied back (sessions, Email Studio history): decide if it matters']
    .forEach((s, i) => log(`step ${i + 1}: ${s}`));
  if (!confirm) return log('dry run: nothing changed (add --confirm)');
  const r = await cf(`/zones/${z}/dns_records/${rec.id}`, { method: 'PATCH', body: JSON.stringify({ proxied: false }) });
  if (!r.success) throw new Error(JSON.stringify(r.errors));
  log('proxy off');
  railway('restart Railway', ['redeploy', '--service', 'S2-Command', '-y']);
  wrangler('remove JOBS_ENABLED', ['secret', 'delete', 'JOBS_ENABLED', '--force']);
  log('resolvers that cached the proxied answer keep reaching the Worker for up to 5 minutes');
  await until('first Railway answer', isRailway, 8 * 60 * 1000);
}

const stages = { status, prepare, switch: switchOver, rollback };
if (!stages[stage]) { console.log('usage: status | prepare | switch | rollback  [--confirm]'); process.exit(1); }
try { await stages[stage](); } catch (e) { log('STOPPED:', hide(e.message)); process.exit(1); }
