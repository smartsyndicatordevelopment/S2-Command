# S2 Command: Railway to Cloudflare cost ledger

Estimates are frozen once approved (approved 2026-10-23) and never edited. Actuals go in the spend log beside them.

## 1. Baseline (Railway, read from `railway usage projects`, 2026-10-23)

| Item | Amount |
|---|---|
| S2 Command Center, previous cycle (Sep 13 to Oct 13) | $1.80 |
| S2 Command Center, current cycle so far (Oct 13 to now) | $0.60 |
| Workspace total, previous cycle | $32.76 |

## 2. Target estimate (frozen)

| Line | Monthly | Shared? | Source |
|---|---|---|---|
| Workers Paid plan | $0.00 extra | Yes, $5 per account, already paid | Workers pricing page, read by earlier migrations |
| Worker requests and CPU at S2's traffic (one internal user) | about $0.00 | n/a | Included allowance of the paid plan |
| R2 storage | $0.00 | n/a | S2 stores no uploaded files |
| Hyperdrive | $0.00 | n/a | Included |
| PlanetScale database `s2command` on the shared server | $0.00 extra | Yes, $5 node already paid | Reused server, per skill |
| Cron Trigger (every 15 minutes) | $0.00 | n/a | Included |
| **Total added** | **about $0.00** | | |

Expected saving once Railway is removed: about $1.80 a month. One-time cost: none expected beyond Claude usage.

## 3. Spend log (actuals)

| Date | Item | Amount | Approved by | Recurring? | Estimate line |
|---|---|---|---|---|---|
| 2026-10-23 | Hyperdrive config, PlanetScale database `s2command`, Worker, cron | $0.00 | n/a (shared plan and server) | none | all lines of the frozen estimate |

## 4. Parallel-run overlap

First Cloudflare deploy 2026-10-23. Railway keeps its stopped service and Postgres until removal on or after 2026-10-30; fill in the real figure from `railway usage` after removal.

## 5. Effort

Session 1 (2026-10-23): inventory, fit check, code rework, local comparison.

## 6. Result

Railway removed the same day as the cutover (2026-10-23), so there was no week-long overlap: the Railway project is deleted and its
final invoice still has to be checked against the ledger after the billing period closes (current cycle ends Nov 13).
Steady state: Cloudflare about $0.00 added (shared Workers plan and shared PlanetScale server), Railway $0, against a Railway baseline of
about $1.80 a month, so the saving is about $1.80 a month. One-time cost: none. Verify with `railway usage` and the Cloudflare invoice next cycle.
