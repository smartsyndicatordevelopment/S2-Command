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
- Digits, GoHighLevel and ClickUp were removed from the app (2026-11-16). The `digits_tokens` table and the old Worker secrets (`DIGITS_*`, `GHL_*`, `CLICKUP_*`) were left in place on purpose; dropping or deleting them needs the owner's separate yes.
- Test bed (dev copy): see `docs/test-bed.md` (`wrangler.dev.jsonc`, Worker s2-command-dev). Never deploy it without `-c wrangler.dev.jsonc`.
- Health check at `/health`. Migration notes, cost ledger and cutover runbook are in `docs/`.
- Projects page (`client/src/tabs/Projects.jsx`, `server/lib/cloudflareProjects.js`, `GET /api/projects`): health and latest status of every Worker and Pages project
  in the Cloudflare account. Uses the **read-only** Worker secret `CF_API_TOKEN` and the var `CF_ACCOUNT_ID`; results cached 5 min in `server_cache`. Projects can be hidden/shown from the page itself (saved in `hidden_projects`, migration 008; hidden ones leave the totals). The cards can be sorted from a dropdown on the page (the choice is kept in the browser).
- The Projects page has three tabs (the open one is saved in the browser):
  - **Cloudflare Health** (first, and the default): the original health page. Cards carry the project folder's logo, a star (favorites are listed first), a chart button, and are grouped by type with Web Apps on top; the Sort By choice orders cards inside each group and Group By can switch grouping off. Resting the mouse on a card (or pressing its chart button) opens a traffic and usage box: requests and errors for 24 hours by hour and 14 days by day, processor time and outside calls (`GET /api/projects/usage`, `server/lib/cloudflareUsage.js`, cached 5 min).
  - **Brandon's Projects**: the folder-by-folder tiles from Brandon's Project Dashboard (filter box with `/`, Esc and Enter, Recent / A To Z, description, logo, last-modified time, the "..." menu with production, dev (and dev login), launch, DashComm Pro, ScopeTask and folder links), with the same stars and type groups, and the traffic box on tiles that have a live Worker. The tiles come from `server/data/project-catalog.json` (`GET /api/projects/catalog`) and `client/public/project-logos/`, both built from `Brandon's Apps/.dashboard` by `node scripts/build-project-catalog.mjs`. Re-run that script on Brandon's PC after a project is added or renamed or the `.dashboard` text files change, then deploy; the modified times are a snapshot from the last run. The `brandon-proj://` and `dashcomm://` links only work on a PC where those protocols are registered. The skills-and-projects consolidation section was removed 2026-11-15 (the owner moved it to ScopeTask).
  - **Utilization** (`client/src/tabs/Utilization.jsx`, `GET /api/utilization`, cached 10 min): Cloudflare month-to-date requests and processor time, R2/KV/D1 storage, each against what Workers Paid includes, the busiest projects, PlanetScale sizes read from the database itself, and the other services' connection status. The read-only token cannot read billing, so the plan is assumed to be Workers Paid unless the var `CF_PLAN_NAME` is set. Optional: `PLANETSCALE_STORAGE_LIMIT_GB` (shows storage as a share of the plan) and `PLANETSCALE_ORG` + `PLANETSCALE_SERVICE_TOKEN_ID` + `PLANETSCALE_SERVICE_TOKEN` (plan and server size from PlanetScale's API). If the R2, KV, D1 or Queues numbers show a warning, the read-only token lacks read permission for that product.
  - Types and the worker-to-folder match live in `server/lib/projectTypes.js` (lists plus name rules; `.dashboard/types.txt` lines "Name|type" override a folder's type). Stars are saved in `project_favorites` (migration 009; kind is worker, pages or folder).
- Sign-in: email and password through better-auth, with optional two-step sign-in. The second step can be a passkey (`server/lib/passkeySecondStep.js`, a small better-auth plugin: `/api/auth/passkey-2fa/*`), an authenticator-app code, or a one-time backup code. Turning it on with a passkey (Settings, Account & Security) makes backup codes first and shows them once. The last passkey cannot be removed while it is the only second step. "Sign In With A Passkey" (no password) still works, but with two-step on it requires the device's own fingerprint, face or PIN check. Google sign-in would skip the second step: do not set the Google keys without adding a hook for it. Passkeys are tied to the address in `BETTER_AUTH_URL`.
- The Overview agent is hidden from the menu (code kept; see the note in `Layout.jsx` to restore it). The app opens on Projects.
  Tests: `scripts/test-projects.cjs`, `scripts/test-projects-v2.cjs` (types, favorites, usage, utilization; no network), `scripts/test-projects-route.cjs`, `scripts/render-test-projects.mjs` (add `--live` for the real account), and `scripts/test-passkey-second-step.mjs` (needs the local test database, see its first lines), and `scripts/test-spec-progress.cjs`.
- The Digits, ClickUp, GHL and Make.com agent pages were removed (2026-10-23). On 2026-11-16 the Digits, GHL and ClickUp server code, status probes, chat tools and the Financials, Cash Flow and Re-categorize Income screens were removed too. Make.com and Facebook Ads remain.
- MCP endpoint: `POST /mcp` (`server/routes/mcp.js`), tool `calculate_texas_sales_tax`. Off (404) until the Worker secret `MCP_API_KEY` is set (32 characters or longer); one request at a time (batches refused); callers send `Authorization: Bearer <key>`. Smoke test: `node scripts/mcp-smoke.cjs`.
- Spec progress: the `spec-progress` skill (`~/.claude/skills/spec-progress/SKILL.md`) grades each app's spec against its code and writes `server/data/spec-progress.json`; `server/lib/specProgress.js` adds `specProgress` to each Cloudflare project by name (or alias) and every Cloudflare Health card shows the bar. Group By on that tab also offers last deployed (default), health, traffic, error rate, response speed and spec complete (`DATA_GROUPS` in `client/src/components/projects/shared.jsx`).
- `scripts/wr.mjs` reads a Cloudflare token from `~/.config/s2-projects/cf-deploy-token.txt` (or `S2_CF_TOKEN_FILE`); mint a short-lived one to deploy, delete it after.

### Railway (deleted 2026-10-23)

- The project **S2 Command Center** was deleted (soft delete; Railway erases it for good on 2026-10-25). Do not recreate it.
- Final backup: `_Private Backups (outside every repo)/railway-final-2026-10-23/s2-command` (all 18 tables as JSON lines plus a
  checksum manifest, taken at the cutover moment). The leftover legacy `/data/tokens.json` on the Railway volume was not backed up
  (unused by the code).
- `server/index.js` and `railway.toml` remain only as the Node reference entry and history.

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
