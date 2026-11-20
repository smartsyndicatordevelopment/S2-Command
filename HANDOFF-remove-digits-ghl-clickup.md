# HANDOFF: Remove Digits, GoHighLevel and ClickUp from S2 Command

STATUS: CODE COMPLETE 2026-11-16, awaiting owner review (not pushed, not deployed)
Branch: `feat/remove-digits-ghl-clickup` (cut from `dev`). Nothing pushed, nothing deployed.

Approved by the owner on 2026-11-16 ("Go With Your Recommendations") for this plan:
remove the three integrations and the screens that exist only for Digits books data.
DO NOT drop the `digits_tokens` table, touch existing data, or delete Cloudflare secrets.
Old migration files stay as history. Stripe and the sales tax calculator/MCP tool stay.

## Checklist
- [x] Branch created, MCP and passkey work committed separately (d2fd795)
- [x] Delete server routes digits, digitsOAuth, digitsRecat, ghl, clickup
- [x] Delete server/lib/digitsTokens.js
- [x] Clean server/app.js
- [x] Clean index.js, auth.js, sessions.js, metricsCache.js (businessPlan.js GHL lines are product copy, left alone)
- [x] Clean status.js
- [x] Clean chat.js (also removed get_pnl and get_transactions tools: they were Digits-only)
- [x] Delete client/src/data/ghlEndpoints.js, clickupEndpoints.js
- [x] Remove Digits-only screens (Recategorize Income) and nav entries
- [x] Clean Financials, CashFlow, Customers, Overview, SalesAds, SalesTax, BusinessPlan, Frameworks, Targets, Avatar, demoData.js
- [x] Delete GHL Agent.svg and GoHighLevel Bridge.svg logos; scripts/test-digits-refresh.cjs
- [x] Update CLAUDE.md, docs, scripts, privacy.html, eula.html
- [x] Client build passes; server loads; node scripts/mcp-smoke.cjs passes
- [x] Final grep for leftover references
- [x] Report (no push, no deploy until the owner says so)

## Gotchas
- better-auth/Digits OAuth lives in routes/digitsOAuth.js mounted under /auth; auth login must keep working.
- On Cloudflare the app hydrates Digits tokens per request in app.js; remove both copies (/auth and /api).
- Do not touch the sales tax route or server/lib/salesTaxCalc.js (Stripe only).

## What was removed beyond the first plan
- Financials, Cash Flow and Re-categorize Income screens (Digits-only), their demo data, nav entries and /api routes.
- Customers and Business Plan CAC now show "--" (marketing spend came from Digits via /api/marketing-spend).
- Chat tools get_pnl, get_transactions, get_ghl_*, get_clickup_*, create_clickup_task; agent_api now only reaches make and fb.

## Left on purpose (needs the owner's separate yes)
- `digits_tokens` table and old migrations; Worker secrets DIGITS_*, GHL_*, CLICKUP_*; the Digits developer app registration.
- docs/migration-notes.md and docs/cutover-runbook.md (dated history); scripts/lib/demo-content.cjs still seeds demo sessions tagged ghl/clickup/digits.
- BusinessPlan.jsx and Frameworks.jsx mention GHL as business-strategy copy, not as an integration.
