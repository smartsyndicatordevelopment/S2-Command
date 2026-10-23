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
5. Finish the cutover runbook with measured timings (draft: `docs/cutover-runbook.md`), then cutover with Brandon's yes.

## Findings from the Railway inventory (read-only, 2026-10-23)

- Railway holds 19 settings to copy (names only: Anthropic, Stripe, Digits, GoHighLevel, ClickUp, Meta, session and encryption
  keys). Skipped: Railway's own, the database address, the unused QuickBooks and old dashboard-password values, and
  `TOKENS_PATH` (a leftover that no code reads). `scripts/worker-set-secrets.mjs --dry-run` lists the names.
- A 500 MB volume `s2-command-volume` is mounted at `/data` and holds 49 MB. Nothing in the current code reads it. While the
  temporary SSH key is registered, list `/data` before deciding it can be dropped; anything still wanted goes to R2 or the database.
- Email Studio history lived in `/app/sessions`, which is not on the volume, so Railway wiped it on each deploy. The new
  database table fixes that; this is the one deliberate behaviour change.
- The source folder is now linked to the Railway project on this PC (a local CLI setting; nothing changed on Railway).

## Cloudflare access (done 2026-10-23)

`wrangler login` cannot finish in the DashComm browser (it only opens public https addresses, so it cannot hand the result back
to `http://localhost:8976`). Instead an API token was created in the dashboard through the control browser:
"S2 Command migration (delete after cutover)", scoped to this account. Permissions: Workers Scripts, KV, R2, Pages, Builds,
Agents, Observability, Containers, Hyperdrive (edit); Account Settings, Workers Tail (read); zone Workers Routes and DNS (edit,
all zones in the account); user details and memberships (read). It is stored in `~/.config/s2-migration/cloudflare-token`
(never in the repo). Use it only through `node scripts/wr.mjs <wrangler args>`, which never prints it.
**Delete the token** (dashboard, My Profile, API Tokens) and the file when the migration is finished.

## Provisioned and deployed (2026-10-23)

- PlanetScale role `s2-migration` (postgres permission) created in the dashboard with the keyboard (mouse clicks miss their
  targets in the control browser; Tab, Space and Enter work, and a 1280x900 window helps). Its connection string is in
  `~/.config/s2-migration/ps-admin-url.txt`. **Delete the role** (Settings, Roles) at the end.
- Database `s2command` with roles `s2command_owner` (schema) and `s2command_app` (runtime; may also create tables because the
  sync engine does). Strings are in `~/.config/s2-migration/s2command-*-url.txt`.
- Schema applied with `scripts/db-prepare.cjs --url-file ...` (7 migrations plus Better Auth's tables).
- Hyperdrive config `s2-command` id `a3e4e784d51d42a6b053169ee3df2d84`: app role, caching off, origin connection limit 5
  (confirmed through the Cloudflare connector).
- 18 settings copied from Railway to the Worker with `scripts/worker-set-secrets.mjs` (values never printed).
- Worker `s2-command` deployed: https://s2-command.throbbing-dawn-3295.workers.dev (cron every 15 minutes, inert without
  `JOBS_ENABLED=1`). Checked: `/health` 200, page loads with the same headers, protected routes 401, session check reaches the
  database. The database is still empty (no data copied yet), so nobody can sign in. `BETTER_AUTH_URL` is the real address, so
  sign-in testing happens on the staging hostname, not on workers.dev.

## Blocked: reading the Railway database

The only read route is the app's own container over SSH. The permission system refused creating a key in `~/.ssh`, so no key
exists and nothing was registered with Railway. Options: allow `ssh-keygen` and `railway ssh keys add` for a key named
`railway_s2_migration`, or have a person run `railway ssh keys add` themselves. Then `node scripts/railway-dump.mjs --exclude digits_tokens`
and `node scripts/dump-load.mjs <owner url file>`.

## Shared PlanetScale server (checked 2026-10-23)

- `syndication-systems` is now a **PS-40** (not the PS-5 in the skill notes), Postgres 18.6, 2.7 GB of 10 GB used (autoscaling on),
  direct connections 21 of 100, PgBouncer 1 of 400. S2 needs about 5 connections, so the budget is fine.
- The PlanetScale dashboard shows pages but ignores clicks from the control browser (New role did nothing; direct URLs for
  forms 404). The one missing step is therefore done by the owner: Settings, Roles, **New role**, name `s2-migration`,
  inherit the `postgres` role, then save the connection string to `~/.config/s2-migration/ps-admin-url.txt` (the page's
  copy button, then paste into that file; never into chat). After that `scripts/ps-provision.mjs` creates the database
  `s2command` with an owner role and a limited app role.
