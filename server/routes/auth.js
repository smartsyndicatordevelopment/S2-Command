const router = require('express').Router();

router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (password === process.env.DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    return res.json({ success: true });
  }

  return res.status(401).json({ error: 'Invalid password' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

module.exports = router;
