// Starts the Node reference server on port 3101 against the local test database s2_node, with throwaway test
// values only (never real keys). The Worker (wrangler dev) is the copy under test; this is what it is compared to.
// Usage: node scripts/local-node.mjs
import { spawn } from 'node:child_process';

const env = {
  ...process.env,
  DATABASE_URL: 'postgresql://frost:frost@127.0.0.1:5433/s2_node',
  NODE_ENV: 'production',
  PORT: '3101',
  SESSION_SECRET: 'local-test-session-value',
  BETTER_AUTH_SECRET: 'local-test-auth-value-not-real-0123456789abcdef',
  ENCRYPTION_KEY: '0'.repeat(64),
  AUTH_ALLOWED_EMAILS: 'test@example.com',
  BETTER_AUTH_URL: 'http://localhost:3101',
  SYNC_INTERVAL_MINUTES: '600',
};
spawn(process.execPath, ['server/index.js'], { env, stdio: 'inherit' });
