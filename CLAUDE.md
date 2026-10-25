# CLAUDE.md — S2 Command

Internal command center for Smart Syndicator. Express + Postgres + React (Vite), running on Cloudflare Workers
(`worker/index.js`, shared app in `server/app.js`), database on PlanetScale through Hyperdrive. `server/index.js` is the Node
entry kept for local development and as the reference copy.

**Hosting: this app deploys to Cloudflare. Do not deploy to Railway. Cut over 2026-10-23 20:45 UTC. The Railway project was
deleted the same day (its final backup is in `_Private Backups (outside every repo)/railway-final-2026-10-23/s2-command`).**

## Deploy rule (standing directive)

Brandon's standing authorization for S2 Command: deploy finished work to production without asking.

1. Work on `dev` (use a worktree for branch work; the source folder stays on `dev`).
2. Verify it builds (`npm run build`); if the schema changed, add a numbered file in `server/migrations/`.
3. Commit with a clear message (end with the `Co-Authored-By` line). Push once per finished piece of work, not after every
   commit. Merge `dev` into `main` when pushing.
4. Apply schema changes first: `node scripts/db-prepare.cjs --url-file <owner url file>` (safe to rerun). The Worker never runs
   migrations at request time.
5. Deploy: `npm run deploy` (builds the client, then `wrangler deploy`). It needs a Cloudflare API token in the session (`CLOUDFLARE_API_TOKEN`): the migration token was deleted on 2026-10-23, so create a new one when needed (account: Workers Scripts, Hyperdrive, Workers KV/R2 as needed; zone: Workers Routes and DNS edit) and delete it when done. Confirm
   `/health` answers on https://command.smartsyndicator.com and the page loads. Pushing to GitHub deploys nothing by itself.

## Deploy facts

### Cloudflare (live)

- Git remote: `origin` → github.com/smartsyndicatordevelopment/S2-Command.git.
- Worker: **s2-command** (`wrangler.jsonc`), entry `worker/index.js`, shared Express app in `server/app.js`
  (`server/index.js` is the Node entry used for local development). Same code runs on both.
- Database: PlanetScale database `s2command` on the shared server `syndication-systems`, reached through the Hyperdrive config
  `s2-command` (id in `wrangler.jsonc`; caching off, connection limit 5, limited role). Owner role for schema work only.
- Private settings are Worker secrets (`wrangler secret put` / `scripts/worker-set-secrets.mjs`), never in a file.
- Cron: every 15 minutes runs the sync engine and metrics warm-up (`server/lib/scheduledJobs.js`), only when the secret
  `JOBS_ENABLED=1` is set.
- Rate limits, recategorize previews and Email Studio history live in Postgres (migration `007_shared_state.sql`).
- Digits token refresh takes a Postgres lock; never copy `digits_tokens` to a second live copy (the refresh token may rotate).
- Test bed (dev copy): see `docs/test-bed.md` (`wrangler.dev.jsonc`, Worker s2-command-dev). Never deploy it without `-c wrangler.dev.jsonc`.
- Health check at `/health`. Migration notes, cost ledger and cutover runbook are in `docs/`.
- Projects page (`client/src/tabs/Projects.jsx`, `server/lib/cloudflareProjects.js`, `GET /api/projects`): health and latest status of every Worker and Pages project
  in the Cloudflare account. Uses the **read-only** Worker secret `CF_API_TOKEN` and the var `CF_ACCOUNT_ID`; results cached 5 min in `server_cache`. Projects can be hidden/shown from the page itself (saved in `hidden_projects`, migration 008; hidden ones leave the totals). The cards can be sorted from a dropdown on the page (the choice is kept in the browser).
- The Projects page has two views (saved in the browser): **All projects** (default; the folder-by-folder tiles from Brandon's Project Dashboard: filter box with `/`, Esc and Enter, Recent / A to Z, description, logo, last-modified time, the "..." menu with production, dev (and dev login), launch, DashComm Pro, ScopeTask and folder links, and the skills-and-projects consolidation plan tab) and **Cloudflare health** (the original page). The tiles come from `server/data/project-catalog.json` (served to signed-in users by `GET /api/projects/catalog`) and `client/public/project-logos/`, both built from `Brandon's Apps/.dashboard` by `node scripts/build-project-catalog.mjs`. Re-run that script on Brandon's PC after a project is added or renamed or the `.dashboard` text files change, then deploy; the modified times are a snapshot from the last run. The `brandon-proj://` and `dashcomm://` links only work on a PC where those protocols are registered.
- The Overview agent is hidden from the menu (code kept; see the note in `Layout.jsx` to restore it). The app opens on Projects.
  Tests: `scripts/test-projects.cjs`, `scripts/test-projects-route.cjs`, `scripts/render-test-projects.mjs` (add `--live` for the real account).
- The Digits, ClickUp, GHL and Make.com agent pages were removed (2026-10-23); `ghl.js`, `clickup.js` and the status probes remain.
- `scripts/wr.mjs` reads a Cloudflare token from `~/.config/s2-projects/cf-deploy-token.txt` (or `S2_CF_TOKEN_FILE`); mint a short-lived one to deploy, delete it after.

### Railway (deleted 2026-10-23)

- The project **S2 Command Center** was deleted (soft delete; Railway erases it for good on 2026-10-25). Do not recreate it.
- Final backup: `_Private Backups (outside every repo)/railway-final-2026-10-23/s2-command` (all 18 tables as JSON lines plus a
  checksum manifest, taken at the cutover moment). The leftover legacy `/data/tokens.json` on the Railway volume was not backed up
  (unused by the code).
- `server/index.js` and `railway.toml` remain only as the Node reference entry and history.

## Digits integration -- what the app can and cannot write

The app connects to Digits via OAuth with scope `ledger:read source:sync`
([server/routes/digitsOAuth.js](server/routes/digitsOAuth.js)). Know the limits before
promising a write:

- **`ledger:read`** -- read P&L, transactions, categories, parties. All the reporting
  (Cash Flow, Software Subscriptions, Overview analyst) rides on this.
- **`source:sync`** -- write/upsert transactions into a data source **the app owns**
  (the "S2 Command Income Adjustments" source, `ensureS2Source` in
  [server/routes/digits.js](server/routes/digits.js)). It is **NOT** a ledger-write
  scope. It **cannot** edit or recategorize a transaction that belongs to another source
  (e.g. a bank/credit-card feed like Chase Card 8119). There is no in-place edit of
  existing ledger entries.
- **The claude.ai "Digits" MCP connector is read-only** -- query/list/statement tools
  only, no update tool. Do not tell the user it can recategorize; it cannot.

Consequence: to "recategorize" you either (a) edit in the Digits UI (the only real fix
for bank-fed transactions like Google Fi -> Internet & Phone), or (b) use the
replace-and-delete workaround the income feature uses -- write corrected replacements
into our source, then the user bulk-deletes the native originals
([server/routes/digitsRecat.js](server/routes/digitsRecat.js)). (b) is built for Stripe
income only (income labels + Stripe clearing/fees, no expense labels) and must NOT be
used on bank-fed card charges -- recreating + deleting them breaks card reconciliation.

## Graphics, Icons, Logos & Video Generation

For any request to generate icons, logos, graphics, or video clips, use `fal-bridge`
(see the root `Brandon's Apps\CLAUDE.md` -> "Shared External API Resources" for the
service URL, auth, and endpoints) rather than integrating a new image/video generation
API or service directly into this project.

## Notes

- Brand for this app is purple `#5c3ff4` + Inter (overrides the workspace sage kit).
- Uses CSS theme vars (`var(--c-card)`, `var(--c-text-primary)`, `var(--c-muted)`,
  `var(--c-border)`, `var(--c-subtle-5)`) — keep new UI theme-aware (light + dark).
- No em dashes in any output (workspace rule) — use `--` or `:`.
