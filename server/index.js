require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { runMigrations } = require('./lib/db');
const { startSyncRunner } = require('./lib/syncEngine');

const authRouter = require('./routes/auth');
const qbOAuthRouter = require('./routes/qbOAuth');
const stripeRouter = require('./routes/stripe');
const quickbooksRouter = require('./routes/quickbooks');
const salesTaxRouter = require('./routes/salesTax');
const chatRouter     = require('./routes/chat');
const ghlRouter        = require('./routes/ghl');
const clickupRouter    = require('./routes/clickup');
const ghlChatRouter       = require('./routes/ghlChat');
const ghlEmailStudioRouter = require('./routes/ghlEmailStudio');
const clickupChatRouter   = require('./routes/clickupChat');
const fbChatRouter        = require('./routes/fbChat');
const sessionsRouter      = require('./routes/sessions');
const integrateRouter     = require('./routes/integrate');

const app = express();
const isDev = process.env.NODE_ENV !== 'production' && !process.env.RAILWAY_ENVIRONMENT_NAME;

app.set('trust proxy', 1); // trust Railway's load balancer for HTTPS detection

// Security headers -- CSP disabled until per-resource policy is tuned for the React SPA
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-not-for-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: !isDev,
    sameSite: 'strict',
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
});

// Global rate limit for all authenticated API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests -- please wait 15 minutes' },
});

// Stricter limit for the chat endpoint (each request calls Anthropic + possibly Stripe/QB)
const chatLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Chat rate limit reached -- please wait before sending more messages' },
});

// Unauthenticated routes
app.use('/auth/login', loginLimiter);
app.use('/auth', authRouter);
app.use('/auth', qbOAuthRouter); // /auth/quickbooks and /auth/quickbooks/callback

// Auth middleware for all /api routes
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Apply auth and rate limiting once for all /api/* routes
app.use('/api', requireAuth);
app.use('/api', apiLimiter);
app.use('/api/chat', chatLimiter); // additional limit on the Anthropic-backed endpoint

app.use('/api', stripeRouter);
app.use('/api', quickbooksRouter);
app.use('/api', salesTaxRouter);
app.use('/api', chatRouter);
app.use('/api', ghlRouter);
app.use('/api', clickupRouter);
app.use('/api', ghlChatRouter);
app.use('/api', ghlEmailStudioRouter);
app.use('/api', clickupChatRouter);
app.use('/api', fbChatRouter);
app.use('/api', sessionsRouter);
app.use('/api', integrateRouter);

// Serve React build in production
if (!isDev) {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;

runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`S2 Command running on port ${PORT}`);
      if (isDev) {
        console.log(`Development mode: expecting client dev server at http://localhost:5173`);
      } else {
        console.log(`Production mode: serving client static files from client/dist`);
      }
    });
    // Start the Dynamic Sync Engine runner after the server is up and migrations are applied
    const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10);
    startSyncRunner(SYNC_INTERVAL_MINUTES);
  })
  .catch((err) => {
    console.error('Migration failed -- server not started:', err.message);
    process.exit(1);
  });
