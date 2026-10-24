const router = require('express').Router();
const { getProjects } = require('../lib/cloudflareProjects');

// GET /api/projects             -- health and latest status of every Cloudflare project (cached for a few minutes)
// GET /api/projects?refresh=1   -- re-check everything now (ignored if the data is under 30 seconds old)
router.get('/projects', async (req, res) => {
  try {
    const data = await getProjects({ force: req.query.refresh === '1', selfHost: (req.hostname || '').toLowerCase() || null });
    res.json(data);
  } catch (err) {
    console.error('projects error:', err.message);
    res.status(502).json({ error: 'Could not read the Cloudflare account. Check the read-only Cloudflare token.' });
  }
});

module.exports = router;
