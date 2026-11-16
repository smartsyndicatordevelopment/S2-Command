# HANDOFF: Projects page v2 and passkey two-step sign-in

STATUS: BUILT AND TESTED LOCALLY as of 2026-11-15. Committed on the branch, not pushed, not deployed. Waiting on the owner for push, dev copy and production. Branch `feat/projects-utilization`, worktree `.claude/worktrees/projects-v2` (source folder stays on `dev`).

Owner asked for: passkey 2FA; Cloudflare Health as the main (first, default) Projects tab; favorites; group by type with Apps first;
company logos on cards; mouseover traffic and usage dashboard (both tabs); a third Utilization tab (storage, plan usage, vital
infrastructure stats). Mid-task the owner also said to remove "Skills and projects consolidation" (done).

## Checklist

- [x] Remove the Skills and projects consolidation tab (AllProjects.jsx, catalog JSON, build script)
- [x] Probe the Cloudflare GraphQL datasets through the Cloudflare connector (all worked, see Facts)
- [x] Migration 009: `project_favorites` table
- [x] Server: favorites route, per-project usage route (24h hourly + 14d daily), utilization route
- [x] Passkey as second sign-in step (server plugin, Login stage, Settings enroll/turn off)
- [x] Client: shared project helpers (type, logo match), card parts (favorite star, logo, usage popover)
- [x] Client: Cloudflare Health tab rebuilt (favorites, group by type, logos, hover usage), made first/default
- [x] Client: Brandon's Projects tab (same features)
- [x] Client: Utilization tab
- [x] Tests (server unit tests with mocked fetch), build, browser check at 1280 and 390 widths
- [x] Opus review of the passkey code, fix findings
- [x] CLAUDE.md and docs updated, commit locally
- [ ] Push the branch and open a pull request (needs the owner's word)
- [ ] Dev copy: `node scripts/seed-dev.cjs` (adds the favorites table), build, `npx wrangler deploy -c wrangler.dev.jsonc`. Needs a short-lived Cloudflare deploy token (see CLAUDE.md, `scripts/wr.mjs`). The dev copy has no Cloudflare read token, so use the Demo switch to see the tabs there.
- [ ] On the real account, confirm the Utilization tab shows no "could not be read" warning for R2, KV, D1 and Queues (the read-only token may lack those permissions; add read access if it does)
- [ ] Owner: add a real passkey in Settings and turn two-step sign-in on (save the backup codes)
- [ ] Production: NOT deployed. Needs owner's "deploy to production". Needs `node scripts/db-prepare.cjs --url-file <owner url file>` first (migration 009 plus any Better Auth table change).

## Facts learned

- All source files in this repo are CRLF. Edit with a CRLF-aware script, or write new files as LF.
- Cloudflare GraphQL datasets that work with the read token (checked 2026-11-15): `workersInvocationsAdaptive` (sum requests, errors,
  subrequests, cpuTimeUs, wallTime in microseconds; quantiles cpuTimeP50, cpuTimeP99, wallTimeP50 in microseconds; dimension
  datetimeHour returns only hours that had traffic), `kvStorageAdaptiveGroups`, `r2StorageAdaptiveGroups` (payloadSize, objectCount),
  `d1StorageAdaptiveGroups` (databaseSizeBytes). Use GraphQL variables, never string interpolation of names.
- `/accounts/{id}/subscriptions` is 403 for the read token (no billing permission), so the plan name cannot be read. The page shows
  the plan as "not readable" unless the `CF_PLAN_NAME` variable is set.
- A shell command that reads the token file and calls the network is blocked by the security guard. Use the Cloudflare connector
  (mcp execute) for live probing instead.
- Worktree `node_modules` are junctions to the main folder (created with PowerShell `New-Item -ItemType Junction`; Git Bash mklink mangles the path).
- Not a workspaces repo, so the shared-code bundling trap in the deploy rules does not apply.
- The second-step screen never appeared before this work: App.jsx swapped the sign-in screen for a spinner during the session re-check that follows the password. Fixed with a "checked once" flag. Any rollback to the old client brings that bug back for accounts with two-step on.
- Chrome will not run a passkey prompt (real or CDP virtual authenticator) in a tab whose window is covered or minimized (document.visibilityState is "hidden"); the request just waits. For browser tests, stub navigator.credentials.get with a software key, or bring the window to the front. Timers are also slowed to about 1 s in a hidden tab, so wait 2 s or more for hover boxes.
- Real numbers seen 2026-11-15 through the connector: about 1.08M requests and about 31.7M ms of processor time month to date. Workers Paid includes 30M ms, so processor time is already past the included amount for November. Worth a look once the tab is live.
- Review items left open on purpose: two delete-passkey calls at the same instant could remove the last two passkeys (owner-only, low); Google sign-in would skip the second step (keys are not set).
