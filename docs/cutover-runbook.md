# S2 Command cutover runbook (DRAFT: timings are filled in from rehearsals)

Goal: `command.smartsyndicator.com` moves from Railway to the Worker in seconds, nobody is signed out, and the way back is
one change. Only with Brandon's explicit yes. Railway stays live and untouched until this has held for a week.

S2 is a single-user internal tool, so unlike a multi-user app it does not need a long hold. It does need two things switched
at the same moment: the Digits token (Digits may rotate the refresh token, so only one host may refresh) and the 15-minute
sync job (so two hosts never sync at once).

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

| Step | Estimate | Measured |
|---|---|---|
| Final dump and load | under 1 minute | |
| Proxy flip to first Worker answer (staging) | about 1 minute | |
| Rollback to first Railway answer (staging) | up to 5 minutes | |
