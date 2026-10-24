const router = require('express').Router();
const { getProjects, getHiddenKeys, setHidden, applyHidden } = require('../lib/cloudflareProjects');

// GET /api/projects             -- health and latest status of every Cloudflare project (cached for a few minutes)
// GET /api/projects?refresh=1   -- re-check everything now (ignored if the data is under 30 seconds old)
// Each project carries `hidden`; the summary counts only the projects that are not hidden.
router.get('/projects', async (req, res) => {
  try {
    const data = await getProjects({ force: req.query.refresh === '1', selfHost: (req.hostname || '').toLowerCase() || null });
    if (!data.configured) return res.json(data);
    res.json(applyHidden(data, await getHiddenKeys()));
  } catch (err) {
    console.error('projects error:', err.message);
    res.status(502).json({ error: 'Could not read the Cloudflare account. Check the read-only Cloudflare token.' });
  }
});

// PUT /api/projects/visibility  { kind: 'worker'|'pages', name: string, hidden: boolean }  -- hide or show one project
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

module.exports = router;
