import { env } from 'cloudflare:workers';

// The app reads its settings from process.env when its modules load. Imported first by worker/index.js, so every
// plain-text setting and the private values are in process.env before any of the app's own modules run.
for (const [key, value] of Object.entries(env)) {
  if (typeof value === 'string') process.env[key] = value;
}
