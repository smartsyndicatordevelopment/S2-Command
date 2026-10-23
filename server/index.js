// Node entry point (Railway-style host and local development). The Express app itself lives in app.js so the
// Cloudflare Worker (worker/index.js) serves exactly the same app.

// better-auth (and its deps) rely on the global Web Crypto API, which Node 18 does
// not expose as a global. Polyfill it before anything loads better-auth.
if (!globalThis.crypto) globalThis.crypto = require('node:crypto').webcrypto;

require('dotenv').config();

const { app, isDev, loadBetterAuth } = require('./app');
const { runMigrations } = require('./lib/db');
const { startSyncRunner } = require('./lib/syncEngine');
const { warmAll: warmMetrics } = require('./lib/metricsCache');
const { runAuthMigrations, seedAuthCleanup, isConfigured: betterAuthConfigured } = require('./lib/auth');

const PORT = process.env.PORT || 3001;

runMigrations()
  .then(async () => {
    // Hydrate the Digits token cache from Postgres before serving requests.
    await require('./lib/digitsTokens').init().catch(err =>
      console.error('Digits token init failed:', err.message)
    );

    // Activate better-auth if configured -- run its own (non-fatal) migrations, then
    // load the request handler. All wrapped so it can never block server startup.
    if (betterAuthConfigured()) {
      try {
        await runAuthMigrations();
        await seedAuthCleanup();
      } catch (err) {
        console.error('better-auth activation failed (non-fatal):', err.message);
      }
      await loadBetterAuth();
    }

    app.listen(PORT, () => {
      console.log(`S2 Command running on port ${PORT}`);
      if (isDev) {
        console.log(`Development mode: expecting client dev server at http://localhost:5173`);
      } else {
        console.log(`Production mode: serving client static files from client/dist`);
      }
    });
    // Warm the metrics cache immediately after startup (non-blocking)
    warmMetrics().catch(() => {});

    // Start the Dynamic Sync Engine runner after the server is up and migrations are applied
    const SYNC_INTERVAL_MINUTES = parseInt(process.env.SYNC_INTERVAL_MINUTES || '15', 10);
    startSyncRunner(SYNC_INTERVAL_MINUTES, warmMetrics);
  })
  .catch((err) => {
    console.error('Migration failed -- server not started:', err.message);
    process.exit(1);
  });
