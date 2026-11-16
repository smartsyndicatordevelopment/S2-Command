# Change Record: S2 Command

One entry per batch of changes: what changed, what was tested and the result, who approved it, when it went live, and how to undo it.

## 2026-11-15: Projects page v2 and passkey as the second sign-in step

**Level:** local only (branch `feat/projects-utilization`, not pushed, not deployed).

**What changed**
- Sign-in: a passkey can be the second step after the password, with one-time backup codes. New better-auth plugin
  `server/lib/passkeySecondStep.js`; Settings and the sign-in screen updated. Fixed a bug where the second-step screen was thrown
  away the moment the password was accepted (the app replaced the sign-in screen with a spinner during a session re-check).
- Projects page: Cloudflare Health is the first and default tab; favorites; grouping by type with apps first; project logos on the
  Cloudflare cards; a traffic and usage box when the mouse rests on a card; the same on Brandon's Projects; a new Utilization tab.
- Removed the Skills And Projects Consolidation section (owner request).
- Database: migration `009_project_favorites.sql` (one new table, nothing existing is changed).

**Tested (all on this PC, 2026-11-15)**
- `node scripts/test-passkey-second-step.mjs`: 13 of 13 passed (real better-auth handler, local Postgres, software passkey device).
- `node scripts/test-projects-v2.cjs`: 18 of 18 passed. `node scripts/test-projects.cjs`: passed. `node scripts/render-test-projects.mjs`: 29 of 29 passed.
- Client build passed. Worker bundle dry run (`wrangler deploy -c wrangler.dev.jsonc --dry-run`) passed and contains the new code.
- Browser, local server: sign-in with the passkey step, backup-code error, Settings turn-on with backup codes, refusal to remove the
  only passkey, all three tabs at 1280, 390 and 1080x1920 wide with no sideways scroll, hover box opens and closes without moving the page.
- Every Cloudflare analytics query was run against the real account through the Cloudflare connector and returned data.
- Security review of the passkey code by a separate reviewer: no way found to sign in without both steps. Fixed from its list:
  backup codes, device-check requirement for passkey-only sign-in, quieter logging, declared dependencies, retry after a failed start.
- Not run: `scripts/test-projects-route.cjs` and `--live` (they read the token file and call Cloudflare in one command, which the
  security guard blocks in an agent session). Not checked: the browser's own passkey prompt (the control browser window was covered,
  so a stand-in device answered), a screen reader pass, and the light theme by eye.

**Approved by / went live:** not yet.

**Before a deploy:** run `node scripts/db-prepare.cjs --url-file <owner url file>` (dev copy: `node scripts/seed-dev.cjs`) so the
favorites table exists. Until then the page still works, without stars.

**How to undo:** deploy the previous commit (`4e9a0e0`). The new table can stay; nothing reads it in the old build. Anyone who turned
two-step sign-in on keeps the flag: with the old build the second-step screen does not appear, so turn it off in Settings first, or
clear it with `UPDATE "user" SET "twoFactorEnabled" = false WHERE email = '<address>'`.
