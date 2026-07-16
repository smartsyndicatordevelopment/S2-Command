# CLAUDE.md — S2 Command

Internal command center for Smart Syndicator. Express + Postgres + React (Vite),
deployed on Railway.

## Deploy rule (standing directive)

**Whenever we make ANY change to this project, always push to production — without
asking.** This is Brandon's explicit standing authorization for S2 Command.

Workflow for every change here:
1. Make the change and verify it builds (`cd client && npm run build` for client-side
   changes).
2. `git add` the changed files, commit with a clear message (end with the
   `Co-Authored-By` line), and `git push origin main`.
3. Railway auto-deploys `main` to production. Confirm the deploy reaches SUCCESS.

Do not branch first for this project — push straight to `main`.

## Deploy facts

- Git remote: `origin` → github.com/smartsyndicatordevelopment/S2-Command.git, branch `main`.
- Railway project: **S2 Command Center** (`64a4ce43-e88d-412a-8fa9-7f9728f9cf4e`)
  - Service: **S2-Command** (`601ca28f-d134-499b-8d2f-e189ff8f43f1`)
  - Environment: **production** (`3c2fac31-6dee-4901-bfbe-e77e96d38acf`)
  - Postgres service: `54a8612f-3659-497b-9f76-7ad07cb4b019`
- Build: nixpacks — `npm install && cd client && npm install --include=dev && npm run build`
- Start: `npm start`; health check at `/health`.
- Prod-only DB scripts run via `railway run node server/scripts/<script>.js`.

## Notes

- Brand for this app is purple `#5c3ff4` + Inter (overrides the workspace sage kit).
- Uses CSS theme vars (`var(--c-card)`, `var(--c-text-primary)`, `var(--c-muted)`,
  `var(--c-border)`, `var(--c-subtle-5)`) — keep new UI theme-aware (light + dark).
- No em dashes in any output (workspace rule) — use `--` or `:`.
