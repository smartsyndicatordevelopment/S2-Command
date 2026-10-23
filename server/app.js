// better-auth (and its deps) rely on the global Web Crypto API, which Node 18 does
// not expose as a global. Polyfill it before anything loads better-auth.
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

if (!process.env.CF_WORKER) require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const { PgStore } = require('./lib/rateLimitStore');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { getPool } = require('./lib/db');

const authRouter = require('./routes/auth');
const digitsOAuthRouter = require('./routes/digitsOAuth');
const stripeRouter = require('./routes/stripe');
const digitsRouter = require('./routes/digits');
const salesTaxRouter = require('./routes/salesTax');
const chatRouter     = require('./routes/chat');
const ghlRouter        = require('./routes/ghl');
const clickupRouter    = require('./routes/clickup');
const fbChatRouter        = require('./routes/fbChat');
const sessionsRouter      = require('./routes/sessions');
const integrateRouter     = require('./routes/integrate');
const statusRouter        = require('./routes/status');
const businessPlanRouter  = require('./routes/businessPlan');
const digitsRecatRouter   = require('./routes/digitsRecat');
const { getAuth: getBetterAuth, isConfigured: betterAuthConfigured } = require('./lib/auth');

const app = express();
const isDev = process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT_NAME;

app.set('trust proxy', 1); // trust Railway's load balancer for HTTPS detection

// Security headers -- CSP disabled until per-resource policy is tuned for the React SPA
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// better-auth handler -- mounted BEFORE express.json (it reads the raw body) and
// OUTSIDE the /api requireAuth gate (login must be reachable unauthenticated). The
// actual handler loads async during startup; until then (or when unconfigured) this
// returns 503, so the route is inert and the existing express-session login is
// completely unaffected.
let betterAuthNodeHandler = null;
let fromNodeHeadersRef = null; // set once better-auth/node loads
let betterAuthLoading = null;
// Loads the better-auth request handler once. On Node it is called at startup; on Cloudflare (no startup phase) the
// first request that needs it triggers it. Schema migrations are NOT run here (see runStartupTasks / db-prepare).
function loadBetterAuth() {
  if (!betterAuthLoading) {
    betterAuthLoading = (async () => {
      if (!betterAuthConfigured()) return;
      try {
        const auth = await getBetterAuth();
        if (auth) {
          const { toNodeHandler, fromNodeHeaders } = await import('better-auth/node');
          betterAuthNodeHandler = toNodeHandler(auth);
          fromNodeHeadersRef = fromNodeHeaders; // enables requireAuth to read better-auth sessions
          console.log('better-auth active at /api/auth');
        }
      } catch (err) {
        betterAuthLoading = null; // allow a retry on the next request
        console.error('better-auth activation failed (non-fatal):', err.message);
      }
    })();
  }
  return betterAuthLoading;
}

app.all('/api/auth/*', async (req, res) => {
  await loadBetterAuth();
  if (betterAuthNodeHandler) return betterAuthNodeHandler(req, res);
  return res.status(503).json({ error: 'auth not configured' });
});

// 12mb ceiling so the Overview agent can accept pasted/dropped images (base64) --
// the chat route caps individual images at 5mb and 6 per message.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));

// Disable TRACE and other unused HTTP methods
app.use((req, res, next) => {
  if (['TRACE', 'TRACK', 'OPTIONS'].includes(req.method)) {
    return res.status(405).set('Allow', 'GET, POST').end();
  }
  next();
});

// Prevent caching on all responses containing sensitive data
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache');
  next();
});

app.use(cors({
  origin: isDev ? 'http://localhost:5173' : false,
  credentials: true,
}));

if (!isDev && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required in production');
}

// Persist sessions in Postgres so logins survive deploys (Railway's memory and
// filesystem are ephemeral, so the default in-memory store logs everyone out on
// every restart). Fall back to the in-memory store if the PG store can't be set
// up -- a session-store problem must never lock users out of the whole app.
let sessionStore;
if (process.env.DATABASE_URL || process.env.CF_WORKER) {
  try {
    const PgSession = require('connect-pg-simple')(session);
    sessionStore = new PgSession({
      pool: getPool(),
      tableName: 'user_sessions',
      createTableIfMissing: !process.env.CF_WORKER,
    });
    sessionStore.on('error', (err) => console.error('PG session store error:', err.message));
  } catch (err) {
    console.error('PG session store init failed -- using in-memory sessions:', err.message);
    sessionStore = undefined;
  }
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'dev-secret-not-for-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'lax', // lax (not strict) so OAuth redirect callbacks still send the session cookie
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// Health check -- unauthenticated, used by Railway
app.get('/health', (req, res) => res.json({ ok: true }));

// Rate limit login attempts -- 5 tries per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts -- try again in 15 minutes' },
  store: new PgStore('login'), passOnStoreError: true,
});

// Global rate limit for all authenticated API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests -- please wait 15 minutes' },
  store: new PgStore('api'), passOnStoreError: true,
});

// Stricter limit for the chat endpoint (each request calls Anthropic + possibly Stripe/Digits)
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Chat rate limit reached -- please wait before sending more messages' },
  store: new PgStore('chat'), passOnStoreError: true,
});

// Unauthenticated routes
if (process.env.CF_WORKER) {
  const digitsTokens = require('./lib/digitsTokens');
  app.use('/auth', (req, res, next) => digitsTokens.hydrate().then(() => next(), () => next()));
}
app.use('/auth/login', loginLimiter);
app.use('/auth', authRouter);
app.use('/auth', digitsOAuthRouter); // /auth/digits and /auth/digits/callback

// Auth middleware for all /api routes -- better-auth sessions only (the legacy
// shared-password path has been fully removed).
async function requireAuth(req, res, next) {
  try {
    await loadBetterAuth();
    const auth = await getBetterAuth();
    if (auth && fromNodeHeadersRef) {
      const session = await auth.api.getSession({ headers: fromNodeHeadersRef(req.headers) });
      if (session && session.user) { req.authUser = session.user; return next(); }
    }
  } catch (err) {
    console.error('better-auth session check error:', err.message);
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

// On Cloudflare each request may land on a different app copy, so refresh the Digits token cache from the database
// (the route guards read it synchronously). The Node server hydrates once at startup instead.
if (process.env.CF_WORKER) {
  const digitsTokens = require('./lib/digitsTokens');
  const hydrate = (req, res, next) => digitsTokens.hydrate().then(() => next(), () => next());
  app.use('/api', hydrate);
}

// Apply auth and rate limiting once for all /api/* routes
app.use('/api', requireAuth);
app.use('/api', apiLimiter);
app.use('/api/chat', chatLimiter); // additional limit on the Anthropic-backed endpoint

app.use('/api', stripeRouter);
app.use('/api', digitsRouter);
app.use('/api', salesTaxRouter);
app.use('/api', chatRouter);
app.use('/api', ghlRouter);
app.use('/api', clickupRouter);
app.use('/api', fbChatRouter);
app.use('/api', sessionsRouter);
app.use('/api', integrateRouter);
app.use('/api', statusRouter);
app.use('/api', businessPlanRouter);
app.use('/api', digitsRecatRouter);

// Serve React build in production
if (!isDev && !process.env.CF_WORKER) {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

module.exports = { app, isDev, loadBetterAuth };
