/**
 * better-auth server instance (email/password + 2FA + admin + passkey + Google).
 *
 * SAFETY: this whole module is INERT until BETTER_AUTH_SECRET is set. getAuth()
 * returns null when unconfigured, so importing or deploying it changes nothing
 * about the existing express-session login until Phase-2 activation.
 *
 * better-auth is ESM-only and the server is CommonJS, so the library is pulled in
 * via dynamic import() inside an async factory.
 */
const { getPool } = require('./db');

const DEFAULT_BASE_URL = 'https://command.smartsyndicator.com';

function isConfigured() {
  return !!process.env.BETTER_AUTH_SECRET;
}

async function buildAuth() {
  if (!isConfigured()) return null;

  const { betterAuth } = await import('better-auth');
  const { twoFactor, admin } = await import('better-auth/plugins');
  const { passkey } = await import('@better-auth/passkey');

  const baseURL = process.env.BETTER_AUTH_URL || DEFAULT_BASE_URL;
  const rpID = new URL(baseURL).hostname;

  const socialProviders = (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : undefined;

  return betterAuth({
    database: getPool(),          // node-postgres Pool (validated at activation)
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL,
    basePath: '/api/auth',
    trustedOrigins: [baseURL],
    emailAndPassword: { enabled: true },
    ...(socialProviders ? { socialProviders } : {}),
    plugins: [
      twoFactor(),
      admin(),
      passkey({ rpID, rpName: 'S2 Command', origin: baseURL }),
    ],
  });
}

// Lazily build + cache the instance. Returns Promise<auth|null>.
let cached;
function getAuth() {
  if (!cached) {
    cached = buildAuth().catch(err => {
      console.error('better-auth init failed (staying on express-session):', err.message);
      return null;
    });
  }
  return cached;
}

module.exports = { getAuth, isConfigured, DEFAULT_BASE_URL };
