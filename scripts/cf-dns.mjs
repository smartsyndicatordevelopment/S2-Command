// Small Cloudflare DNS helper for the S2 migration. Uses the migration token (never printed).
//   node scripts/cf-dns.mjs list [name filter]
//   node scripts/cf-dns.mjs add <name> <CNAME|A> <content> [--proxied]
//   node scripts/cf-dns.mjs proxy <record id> <on|off>
//   node scripts/cf-dns.mjs ttl <record id> <seconds>
//   node scripts/cf-dns.mjs delete <record id>
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const token = fs.readFileSync(path.join(os.homedir(), '.config', 's2-migration', 'cloudflare-token'), 'utf8').trim();
const ZONE_NAME = 'smartsyndicator.com';
const api = async (p, opts = {}) => {
  const r = await fetch('https://api.cloudflare.com/client/v4' + p, {
    ...opts,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
  });
  return r.json();
};
const fail = (r) => { console.error('FAILED:', JSON.stringify(r.errors ?? r)); process.exit(1); };

const zones = await api('/zones?name=' + ZONE_NAME);
if (!zones.success || !zones.result.length) fail(zones);
const zone = zones.result[0].id;
const [cmd, a, b, c, d] = process.argv.slice(2);

if (cmd === 'list') {
  const r = await api(`/zones/${zone}/dns_records?per_page=200`);
  if (!r.success) fail(r);
  for (const x of r.result.filter((x) => !a || x.name.includes(a))) {
    console.log(x.id, x.type.padEnd(6), x.name.padEnd(36), x.content.slice(0, 60).padEnd(60), x.proxied ? '[proxied]' : '[dns-only]', 'ttl=' + x.ttl);
  }
} else if (cmd === 'add') {
  const body = { name: a, type: b, content: c, proxied: d === '--proxied', ttl: d === '--proxied' ? 1 : 60 };
  const r = await api(`/zones/${zone}/dns_records`, { method: 'POST', body: JSON.stringify(body) });
  if (!r.success) fail(r);
  console.log('added', r.result.id, r.result.name, r.result.proxied ? '[proxied]' : '[dns-only]');
} else if (cmd === 'proxy') {
  const r = await api(`/zones/${zone}/dns_records/${a}`, { method: 'PATCH', body: JSON.stringify({ proxied: b === 'on' }) });
  if (!r.success) fail(r);
  console.log('record', r.result.name, r.result.proxied ? 'now proxied' : 'now dns-only');
} else if (cmd === 'ttl') {
  const r = await api(`/zones/${zone}/dns_records/${a}`, { method: 'PATCH', body: JSON.stringify({ ttl: Number(b) }) });
  if (!r.success) fail(r);
  console.log('record', r.result.name, 'ttl', r.result.ttl);
} else if (cmd === 'delete') {
  const r = await api(`/zones/${zone}/dns_records/${a}`, { method: 'DELETE' });
  if (!r.success) fail(r);
  console.log('deleted', a);
} else {
  console.log('usage: see the top of this file');
}
