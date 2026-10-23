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

## Staging hostname and switch rehearsal (2026-10-23)

- `command-staging.smartsyndicator.com`: grey-cloud CNAME to Railway plus a Worker route (inert while grey-cloud). The real
  record `command.smartsyndicator.com` is untouched. `scripts/cf-dns.mjs` lists, adds, proxies and deletes records.
- Rehearsed the switch twice: 60.6 s and 120.7 s to the first Worker answer, rollback 299.3 s. Details in the runbook.
- Lesson: a polling script must open a new connection every time, or it keeps reaching the old server over its old connection.

## Parity against the live Railway site (signed out, 2026-10-23)

- Production and this copy are the same code: the live site and the Worker serve the same JavaScript bundle
  (`index-CBhBseDO.js`) and local `dev` is at the same commit as `origin/main`'s tip (`261fe3c`).
- Byte check (SHA-1) of `/`, `/index.html`, `/robots.txt`, `/eula.html`, `/privacy.html`, `/logo.png`, `/favicon-32x32.png`,
  `/apple-touch-icon.png`, the JS and CSS bundles and an unknown path: **11 of 11 identical**.
- Found and fixed: a Windows checkout turned `client/index.html` and the public text files into CRLF (17 extra bytes), so the
  built page differed from the Linux build. `.gitattributes` now forces LF for those files.
- `scripts/smoke-compare.mjs` live versus Worker, 15 steps (status, headers, body): 10 identical, 5 differ only in the
  `Accept-Ranges` header on compressed pages (Cloudflare drops it on compressed text; harmless, **needs the owner's
  acceptance in the final report**).
- Still not compared: anything signed in (needs the real data), Stripe, Digits, GoHighLevel, ClickUp, Meta and Anthropic pages.

## Data copy and signed-in checks (2026-10-23)

- Owner said to go with the recommendations, so the temporary key pair was copied into `~/.ssh` and registered with Railway as
  `s2-migration-temp`. **Remove it at the end:** `railway ssh keys rm s2-migration-temp`, then delete
  `~/.ssh/railway_s2_migration*` and the original pair in `~/.config/s2-migration/`.
- `scripts/railway-dump.mjs --exclude digits_tokens` then `scripts/dump-load.mjs`: 14 tables, 244 rows, every count and checksum
  identical to Railway, committed in one transaction. Whole copy 4 s. At the cutover run the dump WITHOUT `--exclude` so the
  Digits token row comes across with the final data.
- The Railway volume `/data` holds only `tokens.json` (1.5 KB, an old QuickBooks token file; contents not read). Nothing in the
  code uses it. Keep it inside the final backup, then it goes with the project. `/app/sessions` is empty or absent, so there is
  no Email Studio history to carry over.
- `scripts/mint-test-session.mjs create|remove` makes a 2-hour test session for the owner account in the COPY only (never in
  Railway) so signed-in routes can be tested without the password; removed after use.
- Signed-in checks on the deployed Worker with the real data (`scripts/signed-in-worker.mjs`): session, chat history lists
  (12 overview chats), business plan, integrations status, sync systems, Email Studio history: all 200 in 230 to 880 ms.
  From the Worker, Stripe, Meta Ads, GoHighLevel, ClickUp and Anthropic report connected. Digits shows disconnected until the
  token row is copied at the cutover; Make has no key on Railway either.
- Bugs found and fixed by those checks: the status page said "DATABASE_URL not set" on the Worker; the metrics warm-up and the
  sync engine both quietly did nothing without `DATABASE_URL`, which would have silently disabled the scheduled job.

## Risk tests and the bugs they found (2026-10-23)

- **Digits refresh lock** (`scripts/test-digits-refresh.cjs`, local test database, stubbed Digits server, no real keys): four
  simultaneous callers with an expired token. First run FAILED (4 refresh calls instead of 1): the "did someone else already
  refresh?" check compared against the in-memory token, which the first caller had already updated. Fixed by re-reading the
  stored token after getting the lock and using it if still valid. Second finding: a failed save inside the lock was only logged,
  so a rotated refresh token could have been lost; it now fails loudly. Now 4 of 4 checks pass (exactly one refresh call, all
  callers get the same token, expiry stored, token encrypted at rest).
- **Scheduled job**: fired through Wrangler's real scheduled handler (`/__scheduled`) with the job switch on locally. The job
  ran ("Completed: 0 ok, 0 errors", S2 has no registered sync systems) and wrote a heartbeat row
  (`server_cache` key `scheduled_jobs_last_run`) so a running schedule is visible in the database. The deployed Worker has the
  switch off.
- **Rate limits** on the deployed Worker with the temporary test session: `RateLimit-Remaining` 299, 298, 297, 296, so the
  Postgres counters work across requests. (Unsigned requests are refused with 401 before the limiter, as on Railway.)
- Local dev note: Wrangler's local log does not print the Worker's console output in this version; read it with
  `POST /cdn-cgi/local/explorer/api/local/observability/query` (`SELECT ... FROM logs`). Two local dev servers can share one
  port on Windows (another session's server was on 8788 and answered some of my first test requests); check
  `netstat -ano | findstr :<port>` and use an unusual port.

## Decisions taken (owner: "go with your recommendations", 2026-10-23)

- The `Accept-Ranges` header difference on compressed pages is accepted (harmless Cloudflare behaviour).
- Email Studio history now persists across deploys (it was wiped on every Railway deploy).
- CLAUDE.md in this branch carries the new deploy rule (work on `dev`, push once per finished piece, deploy with
  `npm run deploy`); the "Hosting" line still needs its fallback date filled in at the cutover. The source folder's CLAUDE.md
  changes when this branch is merged.

## Was blocked: reading the Railway database (now unblocked)

The only read route is the app's own container over SSH (the Postgres has no public address, and opening one is a Railway
account change). The permission system refused creating a key in `~/.ssh`. The Railway tool only accepts keys that live in
`~/.ssh` ("Key not found" for the same key in `~/.config/s2-migration/`), so nothing is registered. An unused key pair
`railway_s2_migration` sits in `~/.config/s2-migration/`; delete it if it is not used. To unblock: copy the `.pub` file into
`~/.ssh` and run `railway ssh keys add --key ~/.ssh/railway_s2_migration.pub` (or allow me to), pass `--key` pointing at the
private key to `railway-dump.mjs`, then `node scripts/railway-dump.mjs --exclude digits_tokens` and
`node scripts/dump-load.mjs <owner url file>`. Delete the key from Railway afterwards (`railway ssh keys rm`).

## Shared PlanetScale server (checked 2026-10-23)

- `syndication-systems` is now a **PS-40** (not the PS-5 in the skill notes), Postgres 18.6, 2.7 GB of 10 GB used (autoscaling on),
  direct connections 21 of 100, PgBouncer 1 of 400. S2 needs about 5 connections, so the budget is fine.
- The PlanetScale dashboard shows pages but ignores clicks from the control browser (New role did nothing; direct URLs for
  forms 404). The one missing step is therefore done by the owner: Settings, Roles, **New role**, name `s2-migration`,
  inherit the `postgres` role, then save the connection string to `~/.config/s2-migration/ps-admin-url.txt` (the page's
  copy button, then paste into that file; never into chat). After that `scripts/ps-provision.mjs` creates the database
  `s2command` with an owner role and a limited app role.

## Decommission and cleanup (2026-10-23, after the cutover)

- Railway project **S2 Command Center deleted** (owner's instruction). It shows as deleted in `railway status` and in the usage report
  (final erasure Oct 25). A final restorable backup of the database export is in
  `_Private Backups (outside every repo)/railway-final-2026-10-23/s2-command`: 18 tables, 254 rows, every file checked against its
  manifest. A second `pg_dump` was attempted afterwards but the database was already gone. The unused legacy `/data/tokens.json`
  (1.5 KB) went with the volume.
- Temporary access removed: the Railway SSH key (removed from the account, local key files deleted), the PlanetScale admin login
  `s2-migration` (deleted in the dashboard; the other sessions' logins were not touched), the Cloudflare token "S2 Command migration"
  (deleted; `wrangler whoami` now answers "Invalid access token"), the token and admin-login files, the duplicate password files and the
  local `dump/` folder of real data.
- Kept on purpose: the database's own logins `s2command_owner` (schema changes) and `s2command_app` (Hyperdrive), with their
  connection files `~/.config/s2-migration/s2command-owner-url.txt` and `-app-url.txt`.
- **Not done:** the two local test databases `s2_node` and `s2_cf` still sit in the shared local test Postgres (it was not running).
  Drop them when it is next started: `DROP DATABASE s2_node; DROP DATABASE s2_cf;`.
- Because the token is gone, `scripts/wr.mjs`, `scripts/cutover.mjs` and `scripts/cf-dns.mjs` need a new token file at
  `~/.config/s2-migration/cloudflare-token` (or `CLOUDFLARE_API_TOKEN`) to work again.
- Browser lesson: the shared control browser keeps other sessions' tabs open; reusing tab 0 replaced a Railway dashboard tab (restored
  afterwards). In this Playwright-based browser, clicks wait for the tab to be in front (`browser_tabs select`), and the click tool takes
  the element as `target`.

## Final cleanup (2026-10-23)

- Deleted the staging DNS record `command-staging.smartsyndicator.com` (it still pointed at the deleted Railway host, a dangling
  record) and Railway's `_railway-verify.command.smartsyndicator.com` TXT record, in the Cloudflare dashboard.
- Removed the Worker route `command-staging.smartsyndicator.com/*` (dashboard) and from `wrangler.jsonc`, so a future deploy does not
  recreate it. The real route `command.smartsyndicator.com/*` is untouched.
- The migration worktree `S2 Command-wt-cloudflare` and branch `cloudflare-migration` were removed after merging into `dev` and `main`.
