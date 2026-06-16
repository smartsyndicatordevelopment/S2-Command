const router = require('express').Router();
const fetch = require('node-fetch');
const { setTokens, getTokenCache, DIGITS_TOKEN_URL } = require('../lib/digitsTokens');

const DIGITS_AUTH_URL = 'https://connect.digits.com/v1/oauth/authorize';
// Read-only access to the ledger (P&L, transactions, categories). No write scopes.
const DIGITS_SCOPE = 'ledger:read';

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Kick off OAuth -- user must be logged into the dashboard.
router.get('/digits', requireAuth, (req, res) => {
  const { DIGITS_CLIENT_ID, DIGITS_REDIRECT_URI } = process.env;
  if (!DIGITS_CLIENT_ID || !DIGITS_REDIRECT_URI) {
    return res.redirect('/auth/digits/error?reason=not_configured');
  }
  const state = Math.random().toString(36).slice(2);
  req.session.digitsState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: DIGITS_CLIENT_ID,
    redirect_uri: DIGITS_REDIRECT_URI,
    scope: DIGITS_SCOPE,
    state,
  });

  res.redirect(`${DIGITS_AUTH_URL}?${params}`);
});

// Digits redirects back here after the user authorizes.
// Receives sensitive params (code) in the URL, so this endpoint does a 302
// redirect rather than returning HTML, keeping those values out of any served page.
router.get('/digits/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!req.session.digitsState || state !== req.session.digitsState) {
    return res.redirect('/auth/digits/error?reason=state_mismatch');
  }

  try {
    const { DIGITS_CLIENT_ID, DIGITS_CLIENT_SECRET, DIGITS_REDIRECT_URI } = process.env;

    const tokenRes = await fetch(DIGITS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: DIGITS_CLIENT_ID,
        client_secret: DIGITS_CLIENT_SECRET,
        code,
        redirect_uri: DIGITS_REDIRECT_URI,
      }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      throw new Error(`Token exchange failed ${tokenRes.status}: ${body}`);
    }

    const data = await tokenRes.json();
    setTokens({
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      businessId: getTokenCache().businessId || process.env.DIGITS_BUSINESS_ID || '',
      expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
    });

    res.redirect('/auth/digits/success');
  } catch (err) {
    console.error('Digits OAuth callback error:', err.message);
    res.redirect('/auth/digits/error?reason=token_exchange_failed');
  }
});

// Success page -- no sensitive params in URL, safe to return HTML.
router.get('/digits/success', (req, res) => {
  res.send(`<!DOCTYPE html><html><head>
    <style>
      body { font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center;
             justify-content: center; height: 100vh; background: #0a0a0f; color: #5A7A65; margin: 0; }
      h2 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
      p { color: #6b7280; font-size: 14px; margin: 0; }
    </style></head>
    <body><div style="text-align:center">
      <h2>Digits Connected</h2>
      <p>You can close this tab.</p>
    </div>
    <script>setTimeout(() => window.close(), 2000)</script>
  </body></html>`);
});

// Error page -- safe to return HTML, no sensitive params forwarded.
router.get('/digits/error', (req, res) => {
  const reason = req.query.reason || 'unknown';
  res.status(400).send(`<!DOCTYPE html><html><head>
    <style>
      body { font-family: 'Inter', system-ui, sans-serif; display: flex; align-items: center;
             justify-content: center; height: 100vh; background: #0a0a0f; color: #ef4444; margin: 0; }
      h2 { margin: 0 0 8px; font-size: 20px; font-weight: 600; }
      p { color: #6b7280; font-size: 14px; margin: 0; }
      code { color: #9ca3af; font-size: 12px; margin-top: 8px; display: block; }
    </style></head>
    <body><div style="text-align:center">
      <h2>Digits Connection Failed</h2>
      <p>Close this tab and try connecting again from the dashboard.</p>
      <code>reason: ${reason}</code>
    </div>
  </body></html>`);
});

module.exports = router;
