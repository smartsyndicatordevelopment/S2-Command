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
const OWNER_EMAIL = (process.env.AUTH_OWNER_EMAIL || 'brandonwong1775@gmail.com').toLowerCase();

// Only these emails may create an account (this is an internal tool -- open sign-up
// would expose the financials). Comma-separated override via AUTH_ALLOWED_EMAILS.
function allowedEmails() {
  return (process.env.AUTH_ALLOWED_EMAILS || OWNER_EMAIL)
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

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
    databaseHooks: {
      user: {
        create: {
          // Enforce the allowlist and make the owner an admin at creation.
          before: async (user) => {
            const email = String(user.email || '').toLowerCase();
            if (!allowedEmails().includes(email)) {
              throw new Error('Sign-up is restricted to authorized accounts.');
            }
            return { data: { ...user, role: email === OWNER_EMAIL ? 'admin' : (user.role || 'user') } };
          },
        },
      },
    },
    plugins: [
      twoFactor(),
      admin(),
      passkey({ rpID, rpName: 'S2 Command', origin: baseURL }),
    ],
  };
}

// One-time housekeeping after migrations: remove the throwaway verification account
// and guarantee the owner is an admin. Non-fatal.
async function seedAuthCleanup() {
  try {
    const { query } = require('./db');
    await query('DELETE FROM "user" WHERE lower(email) = $1', ['verify-test@smartsyndicator.com']);
    await query('UPDATE "user" SET role = $1 WHERE lower(email) = $2', ['admin', OWNER_EMAIL]);
  } catch (err) {
    console.error('auth cleanup (non-fatal):', err.message);
  }
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

module.exports = { getAuth, getOptions, isConfigured, runAuthMigrations, seedAuthCleanup, DEFAULT_BASE_URL };
