/**
 * better-auth server instance (email/password + 2FA + admin + passkey + optional Google).
 *
 * SAFETY: inert until BETTER_AUTH_SECRET is set. getAuth() and getOptions() return
 * null when unconfigured, so nothing changes about the existing express-session
 * login until this is activated. better-auth is ESM-only and the server is CommonJS,
 * so the library is pulled in via dynamic import().
 */
const { getPool } = require('./db');

const DEFAULT_BASE_URL = 'https://command.smartsyndicator.com';

function isConfigured() {
  return !!process.env.BETTER_AUTH_SECRET;
}

// --- options (the BetterAuthOptions object; also what getMigrations() needs) ---
let optionsPromise;
async function buildOptions() {
  if (!isConfigured()) return null;

  const { twoFactor, admin } = await import('better-auth/plugins');
  const { passkey } = await import('@better-auth/passkey');

  const baseURL = process.env.BETTER_AUTH_URL || DEFAULT_BASE_URL;
  const rpID = new URL(baseURL).hostname;

  const socialProviders = (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET } }
    : undefined;

  return {
    database: getPool(),                       // node-postgres Pool
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
  };
}
function getOptions() {
  if (!optionsPromise) optionsPromise = buildOptions().catch(err => {
    console.error('better-auth options build failed:', err.message);
    return null;
  });
  return optionsPromise;
}

// --- the auth instance ---
let authPromise;
async function buildAuth() {
  const opts = await getOptions();
  if (!opts) return null;
  const { betterAuth } = await import('better-auth');
  return betterAuth(opts);
}
function getAuth() {
  if (!authPromise) authPromise = buildAuth().catch(err => {
    console.error('better-auth init failed (staying on express-session):', err.message);
    return null;
  });
  return authPromise;
}

// --- migrations (create better-auth's own tables). NON-FATAL by design: any
// failure logs and leaves better-auth inactive, but never crashes the app. ---
async function runAuthMigrations() {
  try {
    const opts = await getOptions();
    if (!opts) return { ran: false, reason: 'not configured' };
    const { getMigrations } = await import('better-auth/db/migration');
    const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(opts);
    await runMigrations();
    console.log(`better-auth migrations applied (${toBeCreated.length} created, ${toBeAdded.length} altered)`);
    return { ran: true };
  } catch (err) {
    console.error('better-auth migration error (non-fatal):', err.message);
    return { ran: false, error: err.message };
  }
}

module.exports = { getAuth, getOptions, isConfigured, runAuthMigrations, DEFAULT_BASE_URL };
