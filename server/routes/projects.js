const router = require('express').Router();
const { getProjects, getHiddenKeys, setHidden, applyHidden, getCachedProjects } = require('../lib/cloudflareProjects');
const { TYPES, decorateCloudflare, decorateFolders } = require('../lib/projectTypes');
const { getFavoriteKeys, setFavorite, key } = require('../lib/projectFavorites');
const { getProjectUsage, getUtilization } = require('../lib/cloudflareUsage');

function catalogFolders() {
  try { return require('../data/project-catalog.json').projects || []; } catch { return []; }
}

// Stars are a nicety: if the table is missing (the schema step has not run yet) the page still works, just without stars.
async function favoriteKeysOrEmpty() {
  try { return await getFavoriteKeys(); } catch (err) { console.error('favorites read failed:', err.message); return new Set(); }
}

// GET /api/projects             -- health and latest status of every Cloudflare project (cached for a few minutes)
// GET /api/projects?refresh=1   -- re-check everything now (ignored if the data is under 30 seconds old)
// Each project carries `hidden`, `favorite`, `type`, `folder` and `logo`; the summary counts only the projects that are not hidden.
router.get('/projects', async (req, res) => {
  try {
    const data = await getProjects({ force: req.query.refresh === '1', selfHost: (req.hostname || '').toLowerCase() || null });
    if (!data.configured) return res.json(data);
    const favorites = await favoriteKeysOrEmpty();
    const out = applyHidden(data, await getHiddenKeys());
    // Each project also gets its type (for grouping) and its project folder's logo.
    out.projects = decorateCloudflare(out.projects, catalogFolders()).map((p) => ({ ...p, favorite: favorites.has(key(p.kind, p.name)) }));
    out.types = TYPES;
    res.json(out);
  } catch (err) {
    console.error('projects error:', err.message);
    res.status(502).json({ error: 'Could not read the Cloudflare account. Check the read-only Cloudflare token.' });
  }
});

// GET /api/projects/catalog  -- the folder-by-folder project list behind the "Brandon's projects" tab (descriptions, links, logos).
// Built from Brandon's .dashboard files by scripts/build-project-catalog.mjs; signed-in users only. Each project carries `favorite`, `type` and `worker`.
router.get('/projects/catalog', async (req, res) => {
  try {
    const catalog = require('../data/project-catalog.json');
    const favorites = await favoriteKeysOrEmpty();
    // The saved Cloudflare report (if there is one) says which folder has a live Worker, so its tile can show traffic.
    const report = await getCachedProjects().catch(() => null);
    const projects = decorateFolders(catalog.projects, report?.projects || []).map((p) => ({ ...p, favorite: favorites.has(key('folder', p.name)) }));
    res.json({ ...catalog, projects, types: TYPES });
  } catch (err) {
    console.error('project catalog error:', err.message);
    res.status(404).json({ error: 'The project catalog has not been built. Run scripts/build-project-catalog.mjs.' });
  }
});

// GET /api/projects/usage?kind=worker&name=<project>  -- traffic for the hover dashboard: 24 hourly points, 14 daily points, totals.
router.get('/projects/usage', async (req, res) => {
  try {
    res.json(await getProjectUsage({ kind: req.query.kind, name: req.query.name, force: req.query.refresh === '1' }));
  } catch (err) {
    if (/^bad /.test(err.message)) return res.status(400).json({ error: 'Invalid project' });
    console.error('projects usage error:', err.message);
    res.status(502).json({ error: 'Could not read the traffic numbers right now.' });
  }
});

// GET /api/utilization  -- Cloudflare and PlanetScale usage against the plan (cached 10 minutes; ?refresh=1 re-reads, at most every 30 s)
router.get('/utilization', async (req, res) => {
  try {
    res.json(await getUtilization({ force: req.query.refresh === '1' }));
  } catch (err) {
    console.error('utilization error:', err.message);
    res.status(502).json({ error: 'Could not read the usage numbers right now.' });
  }
});

// PUT /api/projects/visibility { kind: 'worker'|'pages', name: string, hidden: boolean }  -- hide or show one project
router.put('/projects/visibility', async (req, res) => {
  const { kind, name, hidden } = req.body || {};
  if (typeof hidden !== 'boolean') return res.status(400).json({ error: 'hidden must be true or false' });
  try {
    await setHidden({ kind, name, hidden });
    res.json({ ok: true });
  } catch (err) {
    if (/^bad /.test(err.message)) return res.status(400).json({ error: 'Invalid project' });
    console.error('projects visibility error:', err.message);
    res.status(500).json({ error: 'Could not save that change.' });
  }
});

// PUT /api/projects/favorite { kind: 'worker'|'pages'|'folder', name: string, favorite: boolean }  -- star or unstar one project
router.put('/projects/favorite', async (req, res) => {
  const { kind, name, favorite } = req.body || {};
  try {
    await setFavorite({ kind, name, favorite });
    res.json({ ok: true });
  } catch (err) {
    if (/^bad /.test(err.message)) return res.status(400).json({ error: 'Invalid project' });
    console.error('projects favorite error:', err.message);
    res.status(500).json({ error: 'Could not save that change.' });
  }
});

module.exports = router;
