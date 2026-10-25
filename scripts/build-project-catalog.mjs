/**
 * Builds the catalog behind the "All projects" view on the Projects page.
 *
 * It reads the same files that Generate-Dashboard.ps1 reads (descriptions.txt, production.txt, dev.txt, launch.txt, scopetask.txt,
 * the logos folder and the consolidation plan page, all in "Brandon's Apps/.dashboard"), scans the project folders for their last
 * modified time, and writes:
 *   - server/data/project-catalog.json   (served only to signed-in users by GET /api/projects/catalog)
 *   - client/public/project-logos/*       (the tile logos)
 *
 * Run it on Brandon's PC whenever a project is added or renamed:   node scripts/build-project-catalog.mjs
 * Options:  --root <projects folder>   --dash <.dashboard folder>
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : fallback; };
const root = arg('--root', path.resolve(appRoot, '..'));
const dash = arg('--dash', path.join(root, '.dashboard'));

const NOISE = /[\\/](node_modules|\.git|\.next|dist|build|out|vendor|__pycache__|\.venv|venv)[\\/]/;

function readPairs(file, minParts) {
  const p = path.join(dash, file);
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .filter(l => l.trim() && !l.trim().startsWith('#'))
    .map(l => l.split('|').map(s => s.trim()))
    .filter(parts => parts.length >= minParts);
}

const descriptions = Object.fromEntries(readPairs('descriptions.txt', 2).map(p => [p[0], p.slice(1).join('|')]));
const production = Object.fromEntries(readPairs('production.txt', 2).filter(p => /^https?:\/\//i.test(p[1])).map(p => [p[0], p[1]]));
const dev = Object.fromEntries(readPairs('dev.txt', 2).filter(p => /^https?:\/\//i.test(p[1])).map(p => [p[0], { url: p[1], login: p[2] || null }]));
const launchable = new Set(readPairs('launch.txt', 3).filter(p => p[1] && p[2]).map(p => p[0]));
const scopetask = Object.fromEntries(readPairs('scopetask.txt', 2).filter(p => /^[0-9a-fA-F-]{36}$/.test(p[1])).map(p => [p[0], p[1]]));

// dashcomm:// links only work once DashComm Pro has registered the protocol on this PC.
let dashCommLinks = false;
try { execFileSync('reg', ['query', 'HKCU\\Software\\Classes\\dashcomm'], { stdio: 'ignore' }); dashCommLinks = true; } catch { /* not registered */ }

function lastTouched(dir, depth = 3) {
  let newest = 0;
  (function walk(d, level) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (NOISE.test(full + path.sep)) continue;
      if (e.isDirectory()) { if (level < depth) walk(full, level + 1); continue; }
      try { newest = Math.max(newest, fs.statSync(full).mtimeMs); } catch { /* skip */ }
    }
  })(dir, 0);
  return newest || fs.statSync(dir).mtimeMs;
}

const logoSrc = path.join(dash, 'logos');
const logoOut = path.join(appRoot, 'client', 'public', 'project-logos');
fs.rmSync(logoOut, { recursive: true, force: true });
fs.mkdirSync(logoOut, { recursive: true });
const logos = {};
if (fs.existsSync(logoSrc)) {
  for (const f of fs.readdirSync(logoSrc)) {
    const full = path.join(logoSrc, f);
    if (!fs.statSync(full).isFile()) continue;
    logos[path.basename(f, path.extname(f))] = f;
    fs.copyFileSync(full, path.join(logoOut, f));
  }
}

const projects = fs.readdirSync(root, { withFileTypes: true })
  .filter(e => e.isDirectory())
  .map(e => e.name)
  .filter(n => !n.startsWith('.') && !n.endsWith('-wt') && !n.startsWith('dcp-') && !n.startsWith('_') && n !== 'ADA Worktrees')
  .map(name => {
    const full = path.join(root, name);
    return {
      name,
      description: descriptions[name] || '',
      logo: logos[name] || null,
      touched: new Date(lastTouched(full)).toISOString(),
      production: production[name] || null,
      dev: dev[name] || null,
      launchable: launchable.has(name),
      scopetaskId: scopetask[name] || null,
      folderLink: 'brandon-proj://' + encodeURIComponent(name),
      dashCommLink: dashCommLinks ? 'dashcomm://open?folder=' + encodeURIComponent(full) : null,
    };
  })
  .sort((a, b) => b.touched.localeCompare(a.touched));

// The consolidation plan page: keep its own styles, drop the skip link, and let the client show it in a sandboxed frame.
let planHtml = null;
const planFile = path.join(dash, 'skills-and-projects-cleanup-plan.html');
if (fs.existsSync(planFile)) planHtml = fs.readFileSync(planFile, 'utf8');

const out = { generatedAt: new Date().toISOString(), projects, planHtml };
const outFile = path.join(appRoot, 'server', 'data', 'project-catalog.json');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`Wrote ${path.relative(appRoot, outFile)}: ${projects.length} projects, ${Object.keys(logos).length} logos, plan page ${planHtml ? 'included' : 'missing'}.`);
