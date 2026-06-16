/**
 * Digits Connect OAuth token store.
 *
 * Mirrors the old qbTokens.js pattern: AES-256-GCM encrypted token file on disk,
 * reusing the same ENCRYPTION_KEY env var. Stores the access + refresh tokens for
 * the single connected Digits business (this is an internal, single-tenant app).
 *
 * OAuth endpoints (Digits Connect, REST, authorization-code flow):
 *   authorize: https://connect.digits.com/v1/oauth/authorize
 *   token:     https://connect.digits.com/v1/oauth/token   (JSON body)
 *   Access token TTL: ~1 hour. Refresh token: indefinite (revoked on app uninstall).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const TOKENS_FILE = process.env.DIGITS_TOKENS_PATH || path.join(__dirname, '../digits-tokens.json');
const DIGITS_TOKEN_URL = 'https://connect.digits.com/v1/oauth/token';
const ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY env var must be a 64-character hex string. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  }
  return Buffer.from(hex, 'hex');
}

function encrypt(text) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text || '', 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(str) {
  if (!str) return '';
  const key = getEncryptionKey();
  const parts = str.split(':');
  if (parts.length !== 3) return '';
  const [ivHex, authTagHex, encryptedHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

function isEncryptedFormat(value) {
  return typeof value === 'string' && value.split(':').length === 3;
}

function loadTokens() {
  try {
    if (fs.existsSync(TOKENS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
      if (isEncryptedFormat(raw.accessToken)) {
        return {
          accessToken: decrypt(raw.accessToken),
          refreshToken: decrypt(raw.refreshToken),
          businessId: raw.businessId ? decrypt(raw.businessId) : '',
          expiresAt: raw.expiresAt || 0,
        };
      }
      return { accessToken: '', refreshToken: '', businessId: '', expiresAt: 0 };
    }
  } catch {
    // Corrupt or unreadable -- force re-auth
  }
  return { accessToken: '', refreshToken: '', businessId: '', expiresAt: 0 };
}

function saveTokens(tokens) {
  try {
    const toSave = {
      accessToken: encrypt(tokens.accessToken || ''),
      refreshToken: encrypt(tokens.refreshToken || ''),
      businessId: encrypt(tokens.businessId || ''),
      expiresAt: tokens.expiresAt,
    };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(toSave, null, 2));
  } catch (err) {
    console.error('Failed to save Digits tokens:', err.message);
  }
}

let tokenCache = loadTokens();

async function refreshAccessToken() {
  const { DIGITS_CLIENT_ID, DIGITS_CLIENT_SECRET } = process.env;

  const res = await fetch(DIGITS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: DIGITS_CLIENT_ID,
      client_secret: DIGITS_CLIENT_SECRET,
      refresh_token: tokenCache.refreshToken,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Digits token refresh failed ${res.status}: ${body}`);
  }

  const data = await res.json();
  tokenCache = {
    accessToken: data.access_token,
    // Digits returns a new refresh token on refresh -- store it, fall back to the old one.
    refreshToken: data.refresh_token || tokenCache.refreshToken,
    businessId: tokenCache.businessId,
    expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
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
  tokenCache = {
    accessToken: tokens.accessToken || '',
    refreshToken: tokens.refreshToken || '',
    businessId: tokens.businessId || tokenCache.businessId || '',
    expiresAt: tokens.expiresAt || 0,
  };
  saveTokens(tokenCache);
}

function getTokenCache() {
  return tokenCache;
}

async function forceRefresh() {
  tokenCache.expiresAt = 0;
  return getToken();
}

module.exports = { getToken, forceRefresh, setTokens, getTokenCache, withRetry, DIGITS_TOKEN_URL };
