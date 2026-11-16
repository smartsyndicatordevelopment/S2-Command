// Renders the Projects page to HTML in Node (no browser) with different data and checks the output.
//   node scripts/render-test-projects.mjs            demo data and hand-made edge cases
//   node scripts/render-test-projects.mjs --live     also the real report from the Cloudflare account (read-only token needed)
// The data hook is swapped for one that returns fixed data, so the page renders in a single pass.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const requireClient = createRequire(path.join(root, 'client', 'package.json'));
const esbuild = requireClient('esbuild');

const entry = `
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloudflareHealth as Projects } from ${JSON.stringify(path.join(root, 'client/src/tabs/Projects.jsx').replace(/\\/g, '/'))};
import { getDemoResponse } from ${JSON.stringify(path.join(root, 'client/src/data/demoData.js').replace(/\\/g, '/'))};
import Page from ${JSON.stringify(path.join(root, 'client/src/tabs/Projects.jsx').replace(/\\/g, '/'))};
import Utilization from ${JSON.stringify(path.join(root, 'client/src/tabs/Utilization.jsx').replace(/\\/g, '/'))};
import AllProjects from ${JSON.stringify(path.join(root, 'client/src/tabs/AllProjects.jsx').replace(/\\/g, '/'))};
const draw = (C) => (data, extra = {}) => { globalThis.__HOOK__ = { data, loading: false, error: null, refetch() {}, ...extra }; return renderToStaticMarkup(React.createElement(C)); };
export const render = draw(Projects);
export const utilization = draw(Utilization);
export const allProjects = draw(AllProjects);
export const page = () => { globalThis.__HOOK__ = { data: getDemoResponse('/api/projects'), loading: false, error: null, refetch() {} }; return renderToStaticMarkup(React.createElement(Page)); };
export const demo = () => getDemoResponse('/api/projects');
export const demoAt = (url) => getDemoResponse(url);
`;

const outfile = path.join(os.tmpdir(), `projects-render-${process.pid}.cjs`);
await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: 'jsx' },
  bundle: true, platform: 'node', format: 'cjs', outfile, jsx: 'automatic', logLevel: 'error',
  nodePaths: [path.join(root, 'client', 'node_modules')],
  plugins: [{
    name: 'stub-use-api',
    setup(build) {
      build.onResolve({ filter: /hooks\/useApi$/ }, () => ({ path: 'use-api-stub', namespace: 'stub' }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const useApi = () => globalThis.__HOOK__;', loader: 'js' }));
    },
  }],
});
const { render, demo, utilization, allProjects, page, demoAt } = createRequire(import.meta.url)(outfile);

let failed = 0;
const test = (name, fn) => { try { fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); } };
const noJunk = (html) => { assert.ok(!/undefined|NaN|\[object/.test(html), 'page contains undefined/NaN/[object]: ' + (html.match(/.{30}(undefined|NaN|\[object).{30}/) || [''])[0]); };

const d = demo();
const html = render(d);
test('demo: shows the title, summary cards and every active project', () => {
  assert.match(html, /Cloudflare Projects/);
  for (const label of ['Active projects', 'Healthy', 'Needs attention', 'Requests \\(24h\\)']) assert.match(html, new RegExp(label));
  for (const p of d.projects.filter((x) => x.status !== 'inactive')) assert.ok(html.includes(p.name), p.name + ' missing');
});
test('demo: status is spelled out in words, not just color', () => {
  for (const w of ['Healthy', 'Degraded', 'Down']) assert.ok(html.includes('>' + w + '<') || html.includes(w + '</span>'), w);
});
test('demo: down and degraded reasons are shown', () => {
  assert.match(html, /HTTP 502/);
  assert.match(html, /6\.5%/);
  assert.match(html, /Slow: answered in 3\.4 s/);
});
test('demo: inactive projects are collapsed in a details element with the right count', () => {
  assert.match(html, /<details/);
  assert.match(html, /Inactive projects \(2\)/);
  assert.ok(html.includes('spike-test'));
});
test('demo: needs-attention count is down + degraded', () => {
  const need = d.summary.down + d.summary.degraded;
  assert.match(html, new RegExp(`Needs attention</p>[\\s\\S]{0,400}?>${need}<`));
});
test('demo: external links are safe and labelled', () => {
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /aria-label="Open [^"]+ \(opens in a new tab\)"/);
});
test('demo: the refresh button is there and enabled', () => {
  assert.match(html, /Refresh Now/);
  assert.ok(!/disabled=""[^>]*>[\s\S]{0,200}Refresh Now/.test(html));
});
test('demo: numbers are formatted and nothing is undefined or NaN', () => noJunk(html));
test('demo: this app (no latency) is shown without a made-up number', () => {
  assert.match(html, /HTTP 200, This app/);
});
test('every active card has a Hide button that names the project', () => {
  assert.match(html, /aria-label="Hide northwind-portal on this page"/);
  assert.ok(!/Hidden projects/.test(html));
});
test('hidden projects leave the cards and the totals and wait in a Hidden list with a Show button', () => {
  const name = d.projects.find((x) => x.status === 'down').name;
  const projects = d.projects.map((x) => (x.name === name ? { ...x, hidden: true } : x));
  const h = render({ ...d, projects });
  assert.match(h, /Hidden projects \(1\)/);
  assert.ok(h.includes(`aria-label="Show ${name} on this page"`));
  assert.ok(!h.includes(`aria-label="Hide ${name} on this page"`));
  const after = h.split('Hidden projects')[0];
  assert.ok(!after.includes(`title="${name}"`), 'hidden project still shown as a card');
  assert.match(h, /Needs attention<\/p>[\s\S]{0,400}?>\d+</);
  noJunk(h);
});
// Sorting is checked with grouping off and no favorites, so the cards are one flat list.
const plain = { ...d, projects: d.projects.map((x) => ({ ...x, favorite: false })) };
const withSort = (value, group = 'none', data = plain) => {
  globalThis.localStorage = { getItem: (k) => (k === 's2:projectsSort' ? value : k === 's2:projectsGroup' ? group : null), setItem() {} };
  try { return render(data); } finally { delete globalThis.localStorage; }
};
const cardOrder = (h) => [...h.matchAll(/<h4 class="[^"]*" title="([^"]+)"/g)].map((m) => m[1]);
const headings = (h) => [...h.matchAll(/<h3 id="cf-group-[^"]+"[^>]*><span[^>]*>([^<]+)</g)].map((m) => m[1]);
const active = d.projects.filter((x) => x.status !== 'inactive');
test('sort: a dropdown offers every ordering, defaulting to needs attention first', () => {
  for (const label of ['Needs attention first', 'Name (A to Z)', 'Most requests', 'Most errors', 'Recently deployed', 'Slowest to answer']) assert.ok(html.includes(label), label);
  assert.match(html, /<option value="attention" selected/);
  const rank = { down: 0, degraded: 1, healthy: 2 };
  const order = cardOrder(withSort(null)).map((n) => rank[d.projects.find((x) => x.name === n).status]);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
test('sort: by name is alphabetical', () => {
  const names = cardOrder(withSort('name'));
  assert.deepEqual(names, active.map((x) => x.name).sort((a, b) => a.localeCompare(b)));
});
test('sort: by requests, errors, deploy time and slowness follow the numbers', () => {
  const nums = (value, f) => cardOrder(withSort(value)).map((n) => f(d.projects.find((x) => x.name === n)));
  const desc = (a) => a.every((v, i) => i === 0 || v <= a[i - 1]);
  assert.ok(desc(nums('requests', (x) => x.requests24h || 0)), 'requests');
  assert.ok(desc(nums('errors', (x) => x.errors24h || 0)), 'errors');
  assert.ok(desc(nums('deployed', (x) => new Date(x.lastDeployedAt || 0).getTime())), 'deployed');
  assert.ok(desc(nums('slowest', (x) => x.latencyMs ?? -1)), 'slowest');
});
test('sort: an unknown saved value falls back to the default', () => {
  assert.deepEqual(cardOrder(withSort('bogus')), cardOrder(withSort(null)));
});
test('groups: favorites come first, then one group per type with apps on top', () => {
  const got = headings(html);
  assert.equal(got[0], 'Favorites');
  assert.deepEqual(got.slice(1), d.types.map((t) => t.label).filter((label) => got.includes(label)));
  assert.equal(got[1], 'Web Apps');
  const fav = d.projects.find((x) => x.favorite).name;
  assert.equal(cardOrder(html)[0], fav);
  assert.equal(cardOrder(html).filter((n) => n === fav).length, 1, 'a favorite is listed once');
});
test('groups: the chosen sort applies inside each group', () => {
  const h = withSort('name', 'type', plain);
  for (const section of h.split('<h3 id="cf-group-').slice(1)) {
    const names = cardOrder(section);
    assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  }
  assert.ok(!headings(h).includes('Favorites'));
});
test('groups: turning grouping off gives one list', () => {
  assert.deepEqual(headings(withSort('name')), ['All Projects']);
});
test('cards: a star button, a traffic button and a logo or initials on every card', () => {
  assert.match(html, /aria-label="Remove s2-command from favorites" [^>]*|aria-pressed="true"/);
  assert.match(html, /aria-label="Add northwind-portal to favorites"/);
  assert.match(html, /aria-label="Show traffic and usage for northwind-portal"/);
  assert.match(html, /src="\/project-logos\/S2%20Command\.png"/);
  assert.match(html, />NP<\/span>/);
});
test('tabs: Cloudflare Health is first and open by default, with Brandon\'s Projects and Utilization after it', () => {
  const t = page();
  const tabs = [...t.matchAll(/role="tab"[^>]*aria-selected="(true|false)"[^>]*>([^<]+)</g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(tabs, [['Cloudflare Health', 'true'], ['Brandon&#x27;s Projects', 'false'], ['Utilization', 'false']]);
  assert.match(t, /Cloudflare Projects/);
});
test('utilization tab: shows plan use for Cloudflare and the database with words, not only bars', () => {
  const u = utilization(demoAt('/api/utilization'));
  for (const label of ['Storage In Use', 'Requests This Month', 'Processor Time This Month', 'File Storage \\(R2\\)', 'PlanetScale \\(Database\\)', 'Busiest Projects This Month', 'Other Services']) assert.match(u, new RegExp(label));
  assert.match(u, /18% used/);
  assert.match(u, /4,120 files in 2 buckets/);
  assert.match(u, /1 database\./);
  assert.match(u, /role="progressbar"/);
  assert.match(u, /81% used \(getting high\)/);
  noJunk(u);
});
test('utilization tab: not connected and failed states are explained', () => {
  const u = utilization({ generatedAt: new Date().toISOString(), cloudflare: { configured: false }, planetscale: { configured: false, warnings: ['database size: timeout'] } });
  assert.match(u, /No read-only Cloudflare token/);
  assert.match(u, /did not answer the size questions/);
  noJunk(u);
  assert.match(utilization(null, { loading: false, error: 'HTTP 502' }), /Could not load the usage numbers/);
  assert.match(utilization(null, { loading: true }), /aria-busy="true"/);
});
test('Brandon\'s Projects tab: groups, stars, logos and the traffic button only where there is a live Worker', () => {
  const a = allProjects(demoAt('/api/projects/catalog'));
  const got = [...a.matchAll(/<h3 id="all-group-[^"]+"[^>]*><span[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(got.slice(0, 3), ['Favorites', 'Web Apps', 'Local Apps']);
  assert.match(a, /aria-label="Remove Summit Leads from favorites"/);
  assert.match(a, /aria-label="Show traffic and usage for Harbor Billing"/);
  assert.ok(!/traffic and usage for Desk Recorder/.test(a));
  assert.ok(!/consolidation/i.test(a), 'the consolidation section is gone');
  noJunk(a);
});
test('not configured: explains the missing token', () => {
  const h = render({ configured: false, projects: [], summary: { total: 0 }, warnings: [] });
  assert.match(h, /read-only Cloudflare token/);
  assert.match(h, /CF_API_TOKEN/);
  noJunk(h);
});
test('empty account renders without crashing', () => {
  const h = render({ configured: true, generatedAt: new Date().toISOString(), summary: { total: 0, active: 0, inactive: 0, healthy: 0, degraded: 0, down: 0, requests24h: 0, errors24h: 0 }, projects: [], warnings: [] });
  assert.match(h, /Needs attention/);
  assert.match(h, /Everything is answering/);
  assert.ok(!/<details/.test(h));
  noJunk(h);
});
test('warnings are shown', () => {
  const h = render({ ...d, warnings: ['traffic analytics: HTTP 403'] });
  assert.match(h, /Some details could not be read: traffic analytics: HTTP 403/);
});
test('while checking, the refresh button is disabled and says so', () => {
  const h = render(d, { loading: true });
  assert.match(h, /Checking\.\.\./);
  assert.match(h, /disabled/);
});
test('a failed refresh keeps the old data and says so', () => {
  const h = render(d, { error: 'HTTP 502' });
  assert.match(h, /last refresh failed/);
  assert.ok(h.includes('northwind-portal'));
});
test('first load shows a spinner, a failure shows the error state', () => {
  assert.match(render(null, { loading: true }), /Checking your Cloudflare projects/);
  assert.match(render(null, { loading: false, error: 'HTTP 500' }), /Could not load your Cloudflare projects/);
});

if (process.argv.includes('--live')) {
  const { buildReport } = createRequire(import.meta.url)('../server/lib/cloudflareProjects.js');
  const token = fs.readFileSync(path.join(os.homedir(), '.config', 's2-projects', 'cf-read-token.txt'), 'utf8').trim();
  const live = await buildReport({ token, accountId: '1f8a493845a44c1c695cde23d2e468f2', selfHost: 'command.smartsyndicator.com' });
  live.cached = false; live.ageSeconds = 0;
  const h = render(live);
  test(`live: renders all ${live.summary.active} active projects and ${live.summary.inactive} inactive`, () => {
    for (const p of live.projects.filter((x) => x.status !== 'inactive')) assert.ok(h.includes(`>${p.name}<`) || h.includes(`title="${p.name}"`), p.name + ' missing');
    assert.match(h, new RegExp(`Inactive projects \\(${live.summary.inactive}\\)`));
  });
  test('live: no undefined or NaN anywhere', () => noJunk(h));
  console.log(`live page: ${h.length} characters of HTML`);
}

fs.rmSync(outfile, { force: true });
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
