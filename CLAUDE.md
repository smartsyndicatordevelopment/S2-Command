# CLAUDE.md — S2 Command

Internal command center for Smart Syndicator. Express + Postgres + React (Vite),
deployed on Cloudflare Workers (database on PlanetScale through Hyperdrive).

**Hosting (set at the Cloudflare cutover): this app deploys to Cloudflare. Do not deploy to Railway.
Railway is only an idle fallback until <date set at cutover> and is then removed.**

## Deploy rule (standing directive)

Brandon's standing authorization for S2 Command: deploy finished work to production without asking.

1. Work on `dev` (use a worktree for branch work; the source folder stays on `dev`).
2. Verify it builds (`npm run build`) and, if the schema changed, add a numbered file in `server/migrations/`.
3. Commit with a clear message (end with the `Co-Authored-By` line). Push once per finished piece of work, not after every
   commit (each push can run billed CI).
4. Apply schema changes first: `node scripts/db-prepare.cjs --url-file <owner url file>` (it is safe to rerun). The Worker
   never runs migrations at request time.
5. Deploy: `npm run deploy` (builds the client, then `wrangler deploy`). Wrangler needs a Cloudflare token in the session
   (`CLOUDFLARE_API_TOKEN`). Confirm `/health` answers and the page loads.

## Deploy facts

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
- Health check at `/health`. Migration notes, cost ledger and cutover runbook are in `docs/`.

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
