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
import Projects from ${JSON.stringify(path.join(root, 'client/src/tabs/Projects.jsx').replace(/\\/g, '/'))};
import { getDemoResponse } from ${JSON.stringify(path.join(root, 'client/src/data/demoData.js').replace(/\\/g, '/'))};
export const render = (data, extra = {}) => { globalThis.__HOOK__ = { data, loading: false, error: null, refetch() {}, ...extra }; return renderToStaticMarkup(React.createElement(Projects)); };
export const demo = () => getDemoResponse('/api/projects');
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
const { render, demo } = createRequire(import.meta.url)(outfile);

let failed = 0;
const test = (name, fn) => { try { fn(); console.log('PASS', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); } };
const noJunk = (html) => { assert.ok(!/undefined|NaN|\[object/.test(html), 'page contains undefined/NaN/[object]: ' + (html.match(/.{30}(undefined|NaN|\[object).{30}/) || [''])[0]); };

const d = demo();
const html = render(d);
test('demo: shows the title, summary cards and every active project', () => {
  assert.match(html, /Cloudflare projects/);
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
  assert.match(html, /Refresh now/);
  assert.ok(!/disabled=""[^>]*>[\s\S]{0,200}Refresh now/.test(html));
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
