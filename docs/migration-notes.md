# S2 Command: Cloudflare migration notes

Branch `cloudflare-migration` (worktree `S2 Command-wt-cloudflare`). Railway keeps serving `command.smartsyndicator.com`
until the cutover has held for a week. Nothing here touches Railway.

## What changed in the code

- `server/app.js` is the Express app both hosts serve. `server/index.js` is the Node entry (unchanged behaviour:
  migrations, timers, listen). `worker/index.js` is the Cloudflare entry.
- `server/lib/db.js`: one shared pool on Node, a small per-request pool on the Worker (Hyperdrive).
- Moved from memory or disk into Postgres (migration `007_shared_state.sql`):
  - rate limits (`rate_limit_hits`, `server/lib/rateLimitStore.js`)
  - recategorize preview snapshots (`recat_previews`)
  - Email Studio history (`ghl_email_history`). Behaviour change to approve: it used to be wiped at every Railway
    deploy and now survives deploys.
- Digits token refresh takes a Postgres advisory lock so two app copies cannot refresh at once (the refresh token may rotate).
  On the Worker the token cache is reloaded from the database at the start of each request.
- The 15-minute sync timer is a Cron Trigger (`server/lib/scheduledJobs.js`), inert until `JOBS_ENABLED=1`.
- Schema work (migrations, Better Auth tables, session table) runs from `scripts/db-prepare.cjs` before deploy.

## Rules for the copy

- **Do not copy the `digits_tokens` row until the cutover.** Digits may rotate the refresh token on use, so a copy that
  refreshes would invalidate Railway's token. Staging runs without Digits; the real row is copied in the final sync.
- **`JOBS_ENABLED` stays unset** on the Worker until the same step that stops Railway's timer.
- Hyperdrive: caching off, origin connection limit 5, limited role. The shared node allows 25 connections in total and the
  existing configs add up to 95 (ferretbooks 20, frost-fm 5, lead-sifter 10, tabor 60), so read pg_stat_activity first.
- The sync engine creates cache tables while running, so S2's app role needs CREATE on its own database (not on others).

## Local test results (2026-10-23)

- `scripts/smoke-compare.mjs`: 15 signed-out steps, 0 differences between Node and the Worker.
- `scripts/signed-in-compare.mjs`: 10 signed-in steps, 1 harmless difference (stored sign-in IP).
- Not yet tested: anything touching Stripe, Digits, GoHighLevel, ClickUp, Make, Meta or Anthropic (need real keys), the Digits
  refresh lock, the cron handler, and deployed-platform behaviour (CPU limit, Hyperdrive).

## Still to do

1. Cloudflare credentials in the session, then create the PlanetScale database `s2command` with an owner role and an app
   role, the Hyperdrive config, and fill in `wrangler.jsonc`.
2. Railway read channel (temporary SSH key), dump and load with checksums, rehearse the delta sync.
3. Deploy to workers.dev, run the comparison against it and against live Railway (read-only).
4. Staging hostname `command-staging.smartsyndicator.com`, time the switch and rollback.
5. Cutover runbook, then cutover with Brandon's yes.
