const router = require('express').Router();
const crypto = require('crypto');

router.get('/status', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password || typeof password !== 'string' || password.length > 200) {
    return res.status(400).json({ error: 'Password required' });
  }

  const expected = process.env.DASHBOARD_PASSWORD || '';
  // Timing-safe comparison prevents side-channel attacks
  const match = expected.length > 0 &&
    password.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));

  if (match) {
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
