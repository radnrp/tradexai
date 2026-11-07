# XENO Leverage Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the new `maximum_feasible_exposure` policy, each trade's stored leverage, and an optional per-trade "Why this leverage?" section.

**Architecture:** The engine change is already live; this is display only. Pure reading of the decision lives in `lib/leverage.ts` with tests; UI reads it on demand from the existing executions endpoint.

**Tech Stack:** Next 16, React 19, TanStack Query, `node --test`.

**Spec:** `/www/api.tradexai/docs/LEVERAGE-UPDATE-FRONTEND-2026-11-04.md` (source of truth for edge cases: `src/trading/capital-policy.ts`, `src/statements/statements.service.ts`).

## Global Constraints

- Display only: no financial math; decimal strings go through `fmt`, never used to authorize anything.
- Never derive leverage from notional / margin. A trade's leverage comes from its own `position.leverage`.
- Decision data is fetched only when a trade's details are opened. No polling.
- Decision labels are exactly: `Why this leverage?`, `Estimated risk at entry`, `Estimated net reward at TP`, `Position size · Margin`.
- Policy line is exactly: `XENO adjusts position size and leverage within its risk limits.`
- Neutral rejection line is exactly: `XENO is waiting for a setup within its risk limits` (for `net_rr`, `position_risk`).
- Never show `riskBudget.equity`: it includes the Trial grant, which must not read as a balance.
- Never show `perTradeUsedPercent` as account risk; account risk is `selected.estimatedRiskPercent`.
- Every new string gets a Persian entry in `lib/i18n/fa.ts`, with transliterated terms (لوریج, پوزیشن, مارجین, ریسک).
- Do not run `next build` in `/www/tradeXai`; build in a scratchpad copy. No deploy and no commit unless asked.

## Findings from checking the spec against the code

1. Two code vocabularies: candidate outcomes (`order_precision_or_limits`, `price_levels_or_liquidation`) differ from entry rejection codes (`order_precision_or_minimum`, `liquidation_buffer`). Keep separate label maps.
2. `leverage` is `NOT NULL DEFAULT 1` in the DB, so old trades return 1 with a null margin. The card hides every `1×`, which now also hides real new 1× trades. Show 1× only when the trade has a margin.
3. `ORDER BY created_at,id` puts the entry first, so page 1 normally holds it; still walk pages as the spec asks.
4. `higherLeverages` can hold up to 200 ranges: group by outcome and cap the ranges shown.
5. The frontend keeps types in `lib/api/types.ts` and doesn't vendor the SDK; the SDK checklist item is met by adding the types there. Outcome codes stay open to `string` for future codes.
6. No persisted query cache, and `/trader` polls every 10s: spec step 8.7 needs no code.
7. Spec's rejection `leverageSelection` is typed but not rendered: the Home line stays short, and `r.code` already carries the reason.
8. `GET /trader`'s `tradePolicy` has no `rr`, so the dialog's Target R/R row never appeared. Read it from the instance's `config.rr` through the existing query.
9. The rules dialog grows past small phones, so it needs a max height and scrolling.

## Review Focus

- Decision with `version` other than 1, or `selected: null`, or field missing from an older server: section hidden, order steps still shown. (Task 1)
- Unknown future outcome code: generic text, never a blank or raw code. (Task 1)
- Alternating outcomes producing many ranges: bounded output, not 200 rows. (Task 1)
- Entry not on page 1, or a later page failing: no crash, section just absent. (Task 1)
- Old 1× trade with null margin, and a malformed leverage string: no `1×`, no `NaN×`. (Task 1)

---

### Patch 1: Contract and pure logic

**Files:**
- Modify: `lib/api/types.ts` (`LeverageSelection`, `ExecutionOrder.leverageSelection`, `TradePolicy.leverageMode`, `EntryRejection.details.leverageSelection`)
- Create: `lib/leverage.ts`, `lib/leverage.test.ts`

**Interfaces:**
- Produces: `positionLeverage(p: Pick<Position,"leverage"|"margin_amount">): number | null`
- Produces: `readDecision(order: ExecutionOrder | null | undefined): SelectedDecision | null`
- Produces: `findEntryOrder(first: ExecutionPage, fetchPage: (page: number) => Promise<ExecutionPage>): Promise<ExecutionOrder | null>`
- Produces: `higherLeverageReasons(d: LeverageSelection): { ranges: string; more: number; reason: string }[]`
- Produces: `atLeverageCap(d: SelectedDecision): boolean`

- [ ] Write failing tests using the spec's section 9 sample: selected 12×, two reason groups `13–76×` and `77–200×`
- [ ] Add tests for every Review Focus line
- [ ] Implement and run `node --test lib/leverage.test.ts`: all pass

### Patch 2: Policy copy

**Files:** `components/trader/agent-info.tsx`, `lib/agent-info.ts`, `lib/agent-info.test.ts`, `lib/labels.ts`, `lib/i18n/fa.ts`

- [ ] Add policy line and rows read from `tradePolicy`: Risk per trade, Total risk limit, Minimum net R/R, Daily loss limit. A row whose value is null is left out.
- [ ] Test: `readPolicy` of the spec's sample yields riskPerTradeBps 50, maxPortfolioRiskBps 200, minimumRR "1.2"
- [ ] Use the neutral rejection line for `net_rr` and `position_risk`
- [ ] Correct the "lowest workable" comment in `lib/agent-info.ts`
- [ ] Dialog must still fit a small phone: verify in Patch 5

### Patch 3: Stored leverage on the trade card

**Files:** `components/trading/position-card.tsx`

- [ ] Replace `Number(p.leverage ?? 1)` with `positionLeverage(p)`; show the pill whenever it isn't null, Isolated when the trade has a margin

### Patch 4: "Why this leverage?"

**Files:** create `components/trading/leverage-decision.tsx`; modify `components/trading/position-card.tsx`, `lib/i18n/fa.ts`

**Interfaces:** Consumes `readDecision`, `findEntryOrder`, `higherLeverageReasons`, `atLeverageCap` from Patch 1.

- [ ] Render inside the details section above Order steps: Leverage (from the position), Position size · Margin, Estimated risk at entry with percent, Estimated net reward at TP
- [ ] Reasons per group; `{n}× is the highest…` when capped; caption saying first failed check only, and that figures are estimates, not results
- [ ] Walk later pages only if page 1 has no entry, in a query with no refetch

### Patch 5: Verification

- [ ] `node --test lib/*.test.ts`, `tsc --noEmit --incremental false`, `eslint` on changed files: clean
- [ ] Scratchpad build with mock API + Playwright: new trade, old trade, capped trade, many ranges, in EN and FA at phone width
- [ ] Walk the spec's section 10 checklist against the result
