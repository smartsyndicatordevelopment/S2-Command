/**
 * Digits Connect OAuth token store -- persisted in Postgres.
 *
 * Railway's container filesystem is ephemeral (wiped on every deploy), so the
 * token is stored in the database (single-row digits_tokens table) rather than a
 * local file. Token values are AES-256-GCM encrypted at rest using ENCRYPTION_KEY.
 *
 * The in-memory tokenCache is hydrated from the DB at startup via init() (called
 * before the server accepts requests) so getTokenCache() stays synchronous for
 * status checks and route guards. Writes update the cache and persist to the DB.
 *
 * OAuth endpoints (Digits Connect, authorization-code flow):
 *   authorize: https://connect.digits.com/v1/oauth/authorize
 *   token:     https://connect.digits.com/v1/oauth/token   (JSON body)
 *   Access token TTL: ~1 hour. Refresh token: indefinite (revoked on app uninstall).
 */

const crypto = require('crypto');
const fetch = require('node-fetch');
const db = require('./db');

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

let tokenCache = { accessToken: '', refreshToken: '', businessId: '', expiresAt: 0 };
let hydrated = false;

async function loadFromDb() {
  try {
    const { rows } = await db.query(
      'SELECT access_token, refresh_token, business_id, expires_at FROM digits_tokens WHERE id = 1'
    );
    if (rows.length) {
      const r = rows[0];
      tokenCache = {
        accessToken: decrypt(r.access_token),
        refreshToken: decrypt(r.refresh_token),
        businessId: r.business_id ? decrypt(r.business_id) : '',
        expiresAt: Number(r.expires_at) || 0,
      };
    }
  } catch (err) {
    console.error('Digits token load failed:', err.message);
  }
  hydrated = true;
  return tokenCache;
}

async function persistToDb() {
  try {
    await db.query(
      `INSERT INTO digits_tokens(id, access_token, refresh_token, business_id, expires_at, updated_at)
       VALUES(1, $1, $2, $3, $4, now())
       ON CONFLICT (id) DO UPDATE SET
         access_token  = EXCLUDED.access_token,
         refresh_token = EXCLUDED.refresh_token,
         business_id   = EXCLUDED.business_id,
         expires_at    = EXCLUDED.expires_at,
         updated_at    = now()`,
      [
        encrypt(tokenCache.accessToken || ''),
        encrypt(tokenCache.refreshToken || ''),
        encrypt(tokenCache.businessId || ''),
        tokenCache.expiresAt || 0,
      ]
    );
  } catch (err) {
    console.error('Digits token persist failed:', err.message);
  }
}

// Hydrate the in-memory cache from the DB. Call once at server startup.
async function init() {
  await loadFromDb();
}

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
    refreshToken: data.refresh_token || tokenCache.refreshToken,
    businessId: tokenCache.businessId,
    expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
  };
  await persistToDb();
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
  if (!hydrated) await loadFromDb();
  if (!tokenCache.accessToken || Date.now() >= tokenCache.expiresAt) {
    return withRetry(() => refreshAccessToken());
  }
  return tokenCache.accessToken;
}

async function setTokens(tokens) {
  tokenCache = {
    accessToken: tokens.accessToken || '',
    refreshToken: tokens.refreshToken || '',
    businessId: tokens.businessId || tokenCache.businessId || '',
    expiresAt: tokens.expiresAt || 0,
  };
  await persistToDb();
}

function getTokenCache() {
  return tokenCache;
}

async function forceRefresh() {
  if (!hydrated) await loadFromDb();
  tokenCache.expiresAt = 0;
  return getToken();
}

module.exports = { init, getToken, forceRefresh, setTokens, getTokenCache, withRetry, DIGITS_TOKEN_URL };
