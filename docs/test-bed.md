# Test bed (built 2026-10-24)

A hosted copy to click through before anything reaches production. Demo data only, no real keys, so it cannot message, charge or read anything real.

- **Address:** https://s2-command-dev.smartsyndicator.workers.dev (a red TEST COPY bar shows on top of every page)
- **Sign in:** `demo@test.local` / `Test-pass-12345!`
- **What it is:** a separate Worker `s2-command-dev` (`wrangler.dev.jsonc`), its own Postgres database `s2command_dev` (a separate database inside the existing PlanetScale cluster, with its own limited login, no rights on the real `s2command` data, no extra cost), its own Hyperdrive configuration `s2-command-dev` (caching off), no routes on real domains, no cron triggers, and three throwaway secrets (`BETTER_AUTH_SECRET`, `SESSION_SECRET`, `ENCRYPTION_KEY`). Only `demo@test.local` may sign up.
- **Not testable here, by design:** GoHighLevel, Stripe, Digits, ClickUp, Meta ads, Make.com, Anthropic chat and the Cloudflare Projects page all have no keys, so those pages show empty or error states. Passkeys and Google sign-in are tied to the real address and are not set up.

## How to use it

- Deploy a batch to it: build the client (`cd client && npm run build`), then `npx wrangler deploy -c wrangler.dev.jsonc`. Never run `wrangler deploy` without `-c` for this purpose (that is production). It needs no approval.
- Apply new database changes and reload demo data: `node scripts/seed-dev.cjs` (safe to repeat; refuses to run unless the database is `s2command_dev`).
- Check it is healthy: `node scripts/check-dev.mjs`.
- Private files on the owner's PC (never in git): `~/.config/dev-copies/s2command/ps-dev-url.txt` (the test database login) and `~/.config/dev-copies/s2command/dev-secrets.json` (the test Worker's secrets). Re-upload secrets with `node scripts/make-dev-secrets.mjs`.
- If the test database login is replaced, point the Hyperdrive configuration at it: `node scripts/make-dev-hyperdrive.mjs <hyperdrive id>` (id is in `wrangler.dev.jsonc`).
- The TEST bar comes from the variable `TEST_BAR=1` (set only in `wrangler.dev.jsonc`; the code is in `worker/index.js` and does nothing in production).
- Remove it: delete the Worker `s2-command-dev` and the Hyperdrive configuration `s2-command-dev` in Cloudflare (`npx wrangler delete -c wrangler.dev.jsonc`, `npx wrangler hyperdrive delete 6e179825fd894157b3e04d444d2ed91b`), then drop database and role `s2command_dev` in PlanetScale (needs an admin login).
- Known gap: the address answers to anyone who has it. It holds only demo data and no keys; Cloudflare Access can lock it to one person if wanted.
