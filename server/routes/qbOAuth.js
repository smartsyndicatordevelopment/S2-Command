const router = require('express').Router();
const fetch = require('node-fetch');
const { setTokens, QB_TOKEN_URL } = require('../lib/qbTokens');

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Kick off OAuth -- user must be logged into the dashboard
router.get('/quickbooks', requireAuth, (req, res) => {
  const { QB_CLIENT_ID, QB_REDIRECT_URI } = process.env;
  const state = Math.random().toString(36).slice(2);
  req.session.qbState = state;

  const params = new URLSearchParams({
    client_id: QB_CLIENT_ID,
    redirect_uri: QB_REDIRECT_URI,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });

  res.redirect(`${QB_AUTH_URL}?${params}`);
});

// QB redirects back here after user authorizes
router.get('/quickbooks/callback', async (req, res) => {
  const { code, state, realmId } = req.query;

  if (!req.session.qbState || state !== req.session.qbState) {
    return res.status(400).send('OAuth state mismatch. Close this tab and try again.');
  }

  try {
    const { QB_CLIENT_ID, QB_CLIENT_SECRET, QB_REDIRECT_URI } = process.env;
    const creds = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');

    const tokenRes = await fetch(QB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: QB_REDIRECT_URI,
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed ${tokenRes.status}: ${body}`);
    }

    const data = await tokenRes.json();
    setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      realmId: realmId || process.env.QB_REALM_ID || '',
    });

    if (realmId) console.log('QB Realm ID from callback (save to QB_REALM_ID in .env):', realmId);

    res.send(`
      <!DOCTYPE html><html><head>
      <style>body{font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#0a0a0f;color:#22c55e;margin:0}h2{margin:0 0 8px}p{color:#6b7280;font-size:14px;margin:0}</style>
      </head><body><div style="text-align:center">
      <h2>QuickBooks Connected</h2><p>You can close this tab.</p>
      </div><script>setTimeout(()=>window.close(),2000)</script></body></html>
    `);
  } catch (err) {
    console.error('QB OAuth callback error:', err.message);
    res.status(500).send('QuickBooks auth failed: ' + err.message);
  }
});

module.exports = router;
