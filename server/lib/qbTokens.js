const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const TOKENS_FILE = path.join(__dirname, '../tokens.json');
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
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
          realmId: decrypt(raw.realmId),
          expiresAt: raw.expiresAt || 0,
        };
      }
      // Old plaintext file -- discard and force re-auth
      return { accessToken: '', refreshToken: '', realmId: '', expiresAt: 0 };
    }
  } catch {
    // Corrupt or unreadable -- force re-auth
  }
  return { accessToken: '', refreshToken: '', realmId: '', expiresAt: 0 };
}

function saveTokens(tokens) {
  try {
    const toSave = {
      accessToken: encrypt(tokens.accessToken || ''),
      refreshToken: encrypt(tokens.refreshToken || ''),
      realmId: encrypt(tokens.realmId || ''),
      expiresAt: tokens.expiresAt,
    };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(toSave, null, 2));
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
    realmId: tokenCache.realmId,
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
