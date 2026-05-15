const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const TOKENS_FILE = path.join(__dirname, '../tokens.json');
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    }
  } catch {}
  return {
    accessToken: process.env.QB_ACCESS_TOKEN || '',
    refreshToken: process.env.QB_REFRESH_TOKEN || '',
    expiresAt: 0,
  };
}

function saveTokens(tokens) {
  try {
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
  } catch (err) {
    console.error('Failed to save QB tokens:', err.message);
  }
}

let tokenCache = loadTokens();

async function refreshAccessToken() {
  const { QB_CLIENT_ID, QB_CLIENT_SECRET } = process.env;
  const creds = Buffer.from(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(tokenCache.refreshToken)}`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`QB token refresh failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokenCache.refreshToken,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  saveTokens(tokenCache);
  return tokenCache.accessToken;
}

async function withRetry(fn, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

async function getToken() {
  if (!tokenCache.accessToken || Date.now() >= tokenCache.expiresAt) {
    return withRetry(() => refreshAccessToken());
  }
  return tokenCache.accessToken;
}

function setTokens(tokens) {
  tokenCache = tokens;
  saveTokens(tokens);
}

function getTokenCache() {
  return tokenCache;
}

async function forceRefresh() {
  tokenCache.expiresAt = 0;
  return getToken();
}

module.exports = { getToken, forceRefresh, setTokens, getTokenCache, withRetry, QB_TOKEN_URL };
