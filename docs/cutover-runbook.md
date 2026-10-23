# S2 Command cutover runbook (DRAFT: timings are filled in from rehearsals)

Goal: `command.smartsyndicator.com` moves from Railway to the Worker in seconds, nobody is signed out, and the way back is
one change. Only with Brandon's explicit yes. Railway stays live and untouched until this has held for a week.

S2 is a single-user internal tool, so unlike a multi-user app it does not need a long hold. It does need two things switched
at the same moment: the Digits token (Digits may rotate the refresh token, so only one host may refresh) and the 15-minute
sync job (so two hosts never sync at once).

## The scripted version (use this; the manual lists below explain what each stage does)

`node scripts/cutover.mjs <stage>`; every stage that changes something needs `--confirm`, and without it prints its plan (tested
as dry runs on 2026-10-23, nothing changed).

| Stage | What it does | When |
|---|---|---|
| `status` | Read-only: where the record points, who answers the live address, Worker health on workers.dev, whether the real route is in the config | any time |
| `prepare --confirm` | Lowers the real record's TTL 3600 to 60 s (record stays grey-cloud, no behaviour change), adds the real route (inert while grey-cloud), builds and deploys | at least an hour before, ideally the day before |
| `switch --confirm` | Checks Railway and the Worker both answer, final dump WITH the Digits token and verified load, stops Railway, sets `JOBS_ENABLED=1`, turns the proxy on, polls until the Worker answers | only with the owner's yes, at a quiet moment |
| `rollback --confirm` | Proxy off, restarts Railway, removes `JOBS_ENABLED`, polls until Railway answers | if a check after the switch fails |

Expect visitors to see errors for roughly 1 to 2 minutes between stopping Railway and the first Worker answer (single-user tool,
so this is acceptable; do it when nobody is using it). After the switch run the checks below (sign in with an existing session,
Overview, Cash Flow with Digits data, Email Studio, a Stripe-backed page, the chat endpoint) and watch `wrangler tail` for an hour.
The Digits connection check: `Digits` on the status page must show connected after the switch.

## A day ahead

1. Lower the TTL of the `command` record to 60 s (it is a DNS-only CNAME to Railway, so the switch is turning the proxy on).
2. Confirm the Worker route for `command.smartsyndicator.com/*` is deployed (inert while the record is DNS-only).
3. Confirm the Worker answers on its `workers.dev` address and on `command-staging.smartsyndicator.com`.
4. Dry-run `node scripts/worker-set-secrets.mjs --dry-run` and confirm the names match Railway's.

## The switch (about 10 minutes, mostly checking)

1. Quiet check: nobody is using the app; no sync mid-run (`SELECT * FROM sync_registry` last run times on Railway).
2. Final data copy from Railway, read-only: `railway-dump.mjs` (all tables including `digits_tokens`), then `dump-load.mjs`
   into the app database. It refuses to commit unless every table's count and checksum equals Railway's.
3. Pause Railway's timer by stopping the service: `railway down --service S2-Command -y` (reversible with `railway redeploy`).
   Check `https://<railway address>/health` no longer answers before continuing.
4. Set `JOBS_ENABLED=1` on the Worker (`wrangler secret put JOBS_ENABLED`, value `1`) so the cron job runs.
5. Turn the proxy on for the `command` record (one Cloudflare API call; the Worker route is already in place).
6. Poll `/health` every 2 s until the `Server:` header changes to Cloudflare; note the gap.
7. Checks on the real address: sign in (an existing session cookie must still work), Overview loads, Cash Flow loads with
   Digits data, Email Studio history, a Stripe-backed page, the chat endpoint.
8. Watch `wrangler tail` for an hour.

## Rollback (decide the trigger before starting: any failed check in step 7 that is not a data question)

1. Turn the proxy off for the record (DNS-only again). Resolvers that cached the proxied answer keep reaching the Worker for
   up to 5 minutes, so do not promise seconds.
2. `railway redeploy --service S2-Command`, then set `JOBS_ENABLED` to empty on the Worker.
3. Anything written on the Worker since the switch (Email Studio history, sessions, sync cache) is copied back only if it matters.

## After the switch

- Cut Railway's GitHub link so a push cannot redeploy the old copy (`railway service source disconnect`), note the repo and
  branch first so it can be reconnected. Put the "deploys to Cloudflare" notice at the top of CLAUDE.md in the source folder.
- Update CLAUDE.md: deploy rule (push to dev, CI deploys to Cloudflare) replaces the "push straight to main" rule.

## Rehearsal timings (to fill in)

Measured on `command-staging.smartsyndicator.com` on 2026-10-23 with `scripts/switch-rehearsal.mjs` (a brand-new connection
for every probe; a reused connection hides the move):

| Step | Estimate | Measured |
|---|---|---|
| Final dump and load (14 tables, 244 rows, every table's count and checksum identical to Railway) | under 1 minute | **4 s** (dump 2 s, load 2 s), run twice |
| The API call that turns the proxy on | under 1 second | 0.2 to 0.4 s |
| Proxy on to first Worker answer | about 1 minute | **60.6 s** (run 1), **120.7 s** (run 2), no wrong answers in between, only the old cached ones |
| Proxy off to first non-Worker answer | up to 5 minutes | **299.3 s** |

Budget 2 minutes for the switch and 5 minutes for a rollback. People whose resolver cached the proxied answer keep reaching
the Worker until it expires, so a rollback is never "seconds". Staging record id: `cad5aa935f484a1f80006a75bee4d14f`
(left grey-cloud, pointing at Railway). The real record is `39f2548c3b2f793f2025491a427b668f` (grey-cloud, TTL 3600; lower to
60 a day ahead).

## What actually happened (2026-10-23)

- 16:31 UTC `prepare`: real record TTL 3600 to 60 s, real route added, Worker redeployed. Waited well past the old hour.
- 20:45:13 UTC `switch --confirm` (quiet check first: last chat July 16, last sign-in that morning):
  final dump (18 tables, every checksum identical, including `digits_tokens`) and verified load 4 s; Railway stopped 20:45:18;
  `JOBS_ENABLED=1` 20:45:24; proxy on 20:45:27; **first Worker answer on the real address 23.7 s later (20:45:51)**, 37 s from the
  start. No failed polls reported.
- Checks on the real address (a 2-hour test session for the owner in the live database, deleted afterwards): page and static files
  200 with the same headers; session, chat history (12), business plan, sync systems, Email Studio history all 200; integrations
  7 of 8 connected (Digits connected; Make has no key, same as Railway); Digits-backed pages (P&L, cash flow, software
  subscriptions) returned real data.
- Railway disconnected from GitHub (`railway service source disconnect`); its service is stopped, not deleted.

### Rollback caveat (read before using `cutover.mjs rollback`)

Railway was stopped with `railway down` and then disconnected from GitHub. `railway redeploy` may therefore not be able to rebuild
it; if it fails, reconnect first (`railway service source connect --repo smartsyndicatordevelopment/S2-Command --branch main --service S2-Command`).
Whatever was written on the Worker since the switch (sessions, chat, Email Studio history, sync cache) lives only in PlanetScale.
Do not restart Railway while the Worker's `JOBS_ENABLED` is on, or both would run the sync.

## Decommission (done 2026-10-23)

The Railway project was deleted the same day (instead of after a week), on the owner's instruction, after a backup check. The
rollback section above no longer applies: there is nothing to roll back to. To go back to Railway you would have to rebuild a project
from the backup in `_Private Backups (outside every repo)/railway-final-2026-10-23/s2-command`.
