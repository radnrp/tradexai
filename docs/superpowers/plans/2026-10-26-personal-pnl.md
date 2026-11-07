# Personal P&L after Trial fund loss cover: implementation plan

**Goal:** Show the user's personal P&L (trade losses that the Trial fund principal really covered are left out) as the main number everywhere it is a "your result" figure. The covered amount gets its own line, the trade's actual result stays visible in the details, and strategy figures, equity, the ledger and balances stay actual.

**Spec:** `/www/api.tradexai/docs/FRONTEND-PERSONAL-PNL-2026-10-26.md` (the same document the user attached). Backend commit `9e254ab`: `src/statements/personal-pnl.ts`, `statements.service.ts`, `trader/insights.ts`, `trader.service.ts`.

**Architecture:** Each decision about what to show is a pure function in `lib/personal-pnl.ts`, tested with `node --test`. A small UI file (`components/trading/pnl.tsx`) holds the two pieces every screen uses: the amount that shows "Pending" for null, and the Trial-cover line. Screens only pick fields and render.

## Global constraints

- The server's personal fields are the numbers to use. The client never computes P&L, cover, balances or withdrawable from equity or from each other. One exception: the closed-trades fallback in `dailyNet` sums the trades' own personal `net_pnl`, which is the same thing the server's daily rows already hold.
- `null` P&L means pending (prices or funding), so it shows **Pending**, never `0` and never `—`. A `pending_funding` closed trade keeps its number, labelled as pending.
- Win/loss counts, win rate, average win/loss and best/worst trade use the **actual** result (`account_net_pnl`). A covered loss is still a loss.
- Equity, `equityHistory`, Wallet, withdrawable, the Activity ledger, the leaderboard and the community feed stay actual and are not touched.
- Trial cover is never called a deposit, refund, credit or cash.
- Every new response field is optional in the types: a missing field means "no cover", so older responses look the same as today.
- Never run `next build` in `/www/tradeXai` (it is production on :3056). Typecheck with `tsc --noEmit --incremental false` so the root user doesn't rewrite `tsconfig.tsbuildinfo`. The dev server :3054 was not listening at the start (checked with `ss`). Every change adds code and no export is renamed, so hot reload can't break.
- No commits unless the user asks.

## Task groups

| # | Group | What changes |
|---|---|---|
| A | Contract types | `Trader.pnl`, `Performance`, `Statement` (top-level open, `realized`, `financial`, `history.basis`), `Position` (closed and open), Activity page meta |
| B | Pure logic | `lib/personal-pnl.ts`: `actualNet`, `coverOf`, `positionPnl`, `pnlNote`, `coverText`; `tradeStats` moves to actual results |
| C | Shared UI | `components/trading/pnl.tsx`: `PnlAmount` (Pending for null), `TrialCover` (gift line) |
| D | Home | Realized PnL stays personal; a cover line; Open PnL shows Pending |
| E | Agent | Total, Closed and Open PnL personal; Pending; a cover line |
| F | Statement › Overview | Hero cover row with the actual result; Open trades shows Pending and the estimated cover; "Account value" naming; daily bars personal with each day's cover; win-rate stats actual |
| G | Statement › Trades | Summary row personal and Pending, with a cover caption; PositionCard: headline personal, note line, two detail rows, pending states |
| H | Statement › Funding | "From trading" uses `personalTradingNetAfterFunding`; a "Trial fund used on losses" tile; timing note |
| — | Unchanged | Leaderboard, community feed, profit bubbles (personal > 0 only when actual > 0), Wallet, Activity, calculator, legacy `agents/[id]` |

## UI map

Copy is English like the rest of the app. `X` = cover, `A` = actual result.

**Home › AgentSummary** (`app/page.tsx`)
```
Agent value (USDT)          Realized PnL (USDT)  [calc]
1,234.56                    0.00                 <- performance.netPnl (personal)
                            0.00% ROI            <- performance.roiPercent (personal)
──────────────────────────────────────────────────
Withdrawable │ Open PnL  │ Win rate (12)
   12.00     │ Pending   │ 58%                   <- pnl.unrealizedNetEstimate; null = Pending
──────────────────────────────────────────────────
🎁 Trial fund covered X USDT of losses; they're left out of your PnL.   (only when X > 0)
Includes 48.00 USDT Trial fund: it trades, but can't be withdrawn.
```
The cover is `performance.trialLossCovered`, the same range as the netPnl above it.

**Agent › AgentCard** (`components/trader/agent-card.tsx`): Total = realized + open (both personal; open null → Total Pending), Closed and Open cells use `PnlAmount`, and the same cover line sits under the grid (`pnl.trialLossCovered`).

**Statement › Overview hero** (`components/statement/overview.tsx`)
```
Profit · Last 30 days
+0.00 USDT [0.00%]                               <- realized.realized_net (personal)
Trades closed in this period, after fees and funding
┌──────────────────────────────────────────────┐
│ 🎁 Trial fund covered X USDT of losses        │  (only when realized.trial_loss_covered > 0)
│    Actual trade result: A USDT                │  <- realized.account_realized_net
└──────────────────────────────────────────────┘
Account value  1,234.56 │ Open trades now  Pending
                        │ Trial fund covers ~X        <- trialLossCoveredEstimate > 0
```
- Chart tab "Total value" becomes **Account value**, with the caption "Account value, Trial fund included." When there's a cover, add "Losses it covered still lower this line."
- Daily tab: bars from `daily.realized_net` (personal). The selected day shows "X USDT covered by Trial fund" under its amount when that day has a cover.
- Your trades: win rate and the won/even/lost bar come from the server (actual). Avg win/loss and best/worst come from `account_net_pnl`. When there's a cover, the hint reads "Actual trade results: covered losses still count as lost."

**Statement › Trades** (`components/statement/trades.tsx`, `components/trading/position-card.tsx`)
```
Closed result                       0.00 USDT    <- realized.realized_net
🎁 Trial fund covered X USDT of losses

BTCUSDT  Short 5×  Isolated              Stop loss
Realized PnL (USDT)                      ROI
0.00                                     0.00%   <- net_pnl (personal); ROI on that same number
Trade −2.00 · Trial fund covered 2.00            <- pnlNote
▾ Fees, funding and order steps
   …
   Trade result (USDT)        −2.00             <- account_net_pnl
   Trial fund cover (USDT)    +2.00             <- trial_loss_covered
```
Open trades: `Trade −1.20 · Trial fund covers ~0.80`, and "Being checked" when `pnlStatus = coverage_unavailable`. With no price at all the headline reads "Pending" and the existing "No live price" pill stays.

**Statement › Funding** (`components/statement/funding.tsx`)
```
Balance change  −2.00 USDT                       <- bookedChange (actual)
Deposited │ Withdrawn
From trading (personalTradingNetAfterFunding) │ From invited friends
Trial fund granted │ Trial fund used on losses X  "Not cash; lowered the Trial fund"
Booked when it hit your balance, and Trial fund cover when it settled, so it can differ slightly from Overview.
```
The tiles still add up to the balance change: personal trading − cover = the actual trading result.

## Files

- Create `lib/personal-pnl.ts`, `lib/personal-pnl.test.ts`, `components/trading/pnl.tsx`
- Modify `lib/api/types.ts`, `lib/trade-stats.ts`, `lib/trade-stats.test.ts`, `components/statement/{data.ts,daily-chart.tsx,overview.tsx,trades.tsx,funding.tsx}`, `components/trading/position-card.tsx`, `components/trader/agent-card.tsx`, `app/page.tsx`

## Tasks

1. **Types (A).** Add the optional fields. Comments say which ones are personal and which actual.
2. **Logic (B), tests first.** `lib/personal-pnl.test.ts` pins:
   - closed covered → value `0`, actual `-2`, cover `2`, note `Trade −2.00 · Trial fund covered 2.00`
   - partial cover → value `-1.5`
   - closed `pending_funding` → state `funding_pending`, value kept (not 0)
   - open estimate with cover → `~` note; `coverage_unavailable` → value null, state `cover_pending`, note "being checked"
   - open, no price → `no_price`
   - an old response without the new fields → actual = value, no note

   `trade-stats.test.ts` pins: a covered loss (`net_pnl 0`, `account_net_pnl -2`) counts as a loss and is the worst trade.
3. **Shared UI (C).** `PnlAmount` and `TrialCover`.
4. **Screens (D–H)**, in the order Home, Agent, Overview with the daily chart, Trades with PositionCard, Funding.
5. **Verify.** `npm test`, `tsc --noEmit --incremental false`, `eslint` on the changed files, and a production build in a scratchpad copy (never in place).
