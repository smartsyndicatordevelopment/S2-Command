const router = require('express').Router();

// Login is handled entirely by better-auth at /api/auth. The legacy shared-password
// login has been removed. /logout stays so the client can also clear any residual
// express-session cookie (express-session is still used for Digits OAuth state).

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

module.exports = router;
