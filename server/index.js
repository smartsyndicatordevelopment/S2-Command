require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const authRouter = require('./routes/auth');
const qbOAuthRouter = require('./routes/qbOAuth');
const stripeRouter = require('./routes/stripe');
const quickbooksRouter = require('./routes/quickbooks');
const salesTaxRouter = require('./routes/salesTax');
const chatRouter     = require('./routes/chat');

const app = express();
const isDev = process.env.NODE_ENV !== 'production';

app.set('trust proxy', 1); // trust Railway's load balancer for HTTPS detection

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: isDev ? 'http://localhost:5173' : false,
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? 'lax' : 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

// Health check -- unauthenticated, used by Railway
app.get('/health', (req, res) => res.json({ ok: true }));

// Unauthenticated routes
app.use('/auth', authRouter);
app.use('/auth', qbOAuthRouter); // /auth/quickbooks and /auth/quickbooks/callback

// Auth middleware for all /api routes
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.use('/api', requireAuth, stripeRouter);
app.use('/api', requireAuth, quickbooksRouter);
app.use('/api', requireAuth, salesTaxRouter);
app.use('/api', requireAuth, chatRouter);

// Serve React build in production
if (!isDev) {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`S2 Command running on http://localhost:${PORT}`);
  if (isDev) console.log(`Client dev server at http://localhost:5173`);
});
