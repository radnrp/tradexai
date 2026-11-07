# Trial quota, campaign tracking and processing withdrawals: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Telegram mini app up to the 2026-10-25 contract: the 50-trade trial and its real-funds CTA, the deposit form's suggested amounts and support line, processing withdrawals in the live bar and Community, and campaign visit and click tracking.

**Architecture:** All new decisions are pure functions in `lib/` (trial copy, feed de-duplication, campaign parsing, retry), tested with `node --test`. Components only render what those functions return. Analytics is fire-and-forget: it never blocks sign-in or a deposit.

**Tech Stack:** Next.js 16.4.3 (client-only mini app), React 19, TanStack Query 5, Tailwind 4, Node 24 `node --test` with type stripping (tests import `./x.ts`).

**Spec:** `/www/api.tradexai/docs/FRONTEND-TRIAL-CAMPAIGNS-2026-10-25.md` (the same document the user attached). The backend for it is live (commit `08f7d17`): `src/trader/trial.ts`, `src/trader/trader.service.ts:44-46,77-83`, `src/analytics/*`.

## Global Constraints

- Money values are decimal strings. Use `lib/money.ts` (`cmp`, `sub`, `fmt`, `trimZeros`) and never `Number` for money. Integer counters (`used`, `limit`, …) may use plain numbers.
- The API is the source of truth for quota, trial status, balances and deposits. The client never counts trades and never invents profit or withdrawal data.
- No timers or countdowns for the trial ("not a five-hour timer").
- `trial.userId` is never rendered, logged or sent anywhere.
- Analytics payloads never carry initData, a JWT, the Telegram id or a wallet address. Analytics errors are swallowed silently: no `console.*`.
- Analytics never blocks sign-in or a deposit. Retries reuse the same UUID.
- Exact copy: `50 trades remaining`, `XENO is trading your trial fund`, `Finishing your trial trades`, `XENO Paused`, `Continue with real funds — 50 USDT`, `12 of 50 trades used`, `38 trades remaining`, the `Recommended` tag on 250, and never `Popular`. Processing withdrawals read `is withdrawing`, never "sent" or "successful".
- Feed lines keep the app's existing time format (`12m ago`) and amount format (`84.00 USDT`).
- The dev server (`next dev -p 3054`, dev.tradexai.pro) may be live. Check `ss -ltnp | grep 3054` first, and when renaming an export add the new one and update its importers before removing the old one.
- Never run `next build` in `/www/tradeXai`: `.next` there is production (:3056). Builds go in a scratchpad copy. Deploying is the user's decision.
- No commits unless the user asks (harness rule). The plan's "commit" points are checkpoints only.

## Review Focus

1. **`trial` missing or `null`** (an older API, or `trialSummary` returning null): Home, Agent and the deposit form look exactly as they do today. Pinned by the `trialCard(null)`, `traderState` without trial, and `realFundingNote(…, null)` tests.
2. **Migrated user with `used > 50`**: shows "All 50 trial trades used", the bar stays at 100%, nothing negative. Pinned in the Task 1 test `trialCard: used above the limit`.
3. **Both versions of one withdrawal id** (processing and confirmed): only one line, the confirmed one. Pinned by the `dedupeFeed` test in Task 5.
4. **`/analytics/visits` down or slow:** sign-in waits at most 1.5 s, retries keep the same `visitId`, nothing is logged. Pinned by the `quietly` tests in Task 2, plus a manual check in Task 6.
5. **A deposit or withdrawal in progress during `completed`:** the server sends `continue_deposit` / `track_withdrawal`, and the trial card must not offer a new payment. Pinned by the Task 1 test `trialCard: a payment in progress wins`.

---

### Task 1: Trial state logic and types

**Files:**
- Modify: `lib/api/types.ts` (Trader, PauseReason, CtaCode; new Trial and DepositUi)
- Modify: `lib/money.ts`, `lib/money.test.ts` (`ceilTo`)
- Modify: `lib/trader.ts`, `lib/trader.test.ts`

**Interfaces:**
- Produces (types):
  ```ts
  export type TrialStatus = "ready" | "active" | "draining" | "completed" | "converted";
  export interface Trial {
    limit: number; used: number; remaining: number; reserved: number; unsettled: number;
    status: TrialStatus | (string & {});
    endReason: "quota" | "deposit" | (string & {}) | null;
    endedAt: string | null;
    confirmedDeposits: Dec; minimumRealDeposit: Dec; realFundingReady: boolean;
    hourlyEntryLimit: number; maxOpenPositions: number;
    /** The user's own id; never shown, logged or sent. */
    userId?: string;
  }
  export interface DepositUi { quickAmounts: Dec[]; recommendedAmount: Dec | null; minimumRealFunding: Dec; supportUrl: string | null; helpText: string | null }
  // Trader gains: trial?: Trial | null; depositUi?: DepositUi | null;
  // PauseReason gains "trial_limit" | "real_funding_required"; CtaCode gains "continue_with_real_funds"
  ```
- Produces (functions):
  - `ceilTo(v: string, dp: number): string` (money.ts): rounds up to `dp` decimals.
  - `realFundingNeed(t: Pick<Trial, "confirmedDeposits" | "minimumRealDeposit">): string`: max(0, minimum − confirmed), rounded up to the cent and trimmed ("40", "39.5", "0").
  - `trialUsage(t: Pick<Trial, "used" | "limit" | "remaining">): string`
  - `type TrialView = { status: string; title: string; line: string; pct: number; note: string | null; cta: string | null }`
  - `trialCard(trial: Trial | null | undefined, cta: Pick<RecommendedCta, "code" | "reason">): TrialView | null`
  - `traderState` input `S` gains `trial?: Pick<Trial, "status" | "confirmedDeposits" | "minimumRealDeposit"> | null`. New keys: `trial_draining`, `trial_done`, `real_funding`.
  - `ctaCopy("continue_with_real_funds")` returns `{ kind: "fund", title: "Continue with real funds — 50 USDT", text: "Your trial is complete. Keep XENO trading with your own funds.", button: "Continue with real funds — 50 USDT", short: "Continue" }`, the fallback copy for the bottom banner.

`trialCard` copy (`N`=limit, `U`=used, `R`=remaining):

| status | title | line | note | cta (only when `cta.code === "continue_with_real_funds"`) |
|---|---|---|---|---|
| ready | `Trial ready` | `N trades remaining` | null | null |
| active | `trialUsage` → `U of N trades used` | `R trades remaining` | reserved>0: `1 entry being placed` / `2 entries being placed` | null |
| draining | `Finishing your trial trades` | `trialUsage` | unsettled>0: `2 trades still open or settling. No new trades start.`, else `No new trades start.` | `Continue with real funds — 50 USDT` |
| completed | `XENO Paused` | `Your N trial trades are done` | null | `Continue with real funds — 50 USDT` |
| converted, !realFundingReady | `XENO Paused` | `Deposited 10 of 50 USDT` | `Add 40 USDT more to start real trading.` | `Add 40 USDT` |
| converted, realFundingReady | → `null` (real-funds mode, no card) | | | |
| anything else | → `null` | | | |

`trialUsage` returns `All N trial trades used` when `remaining <= 0`, otherwise `U of N trades used`. `pct = min(100, round(U/N*100))`, and 0 when N is 0. The 50 in the CTA comes from `fmt(minimumRealDeposit, 0)`, not a hardcoded value. Active's title is the usage figure because the orb right above already says "XENO is trading your trial fund" (`tradingSource`, sourceMode `trial`).

`traderState`: insert after the `minimum_capital` branch and before the generic `if (t.pauseReason)`:
- `trial_limit` with `trial.status === "draining"`, or without trial info while trades are open → `{ key: "trial_draining", tone: "pending", mode: open ? "managing" : "waiting", title: "Finishing your trial trades", body: "No new trades. Open ones are still managed." }`
- `trial_limit` otherwise → `{ key: "trial_done", tone: "idle", mode: "paused", title: "XENO Paused", body: "Your trial is complete." }`
- `real_funding_required` → `{ key: "real_funding", tone: "pending", mode: "paused", title: "XENO Paused", body: "Add 40 USDT to start real trading" }` (from `realFundingNeed`; without trial info: `Add funds to start real trading`). No `cta: "deposit"`: the trial card owns that button.

- [ ] **Step 1: Write the failing tests**

```ts
// money.test.ts
test("ceilTo rounds up to the cent", () => {
  assert.equal(ceilTo("39.495", 2), "39.50");
  assert.equal(ceilTo("40.00000000", 2), "40.00");
  assert.equal(ceilTo("0", 2), "0.00");
});
// trader.test.ts
const trial = { limit: 50, used: 12, remaining: 38, reserved: 0, unsettled: 0, status: "active", endReason: null, endedAt: null,
  confirmedDeposits: "0.00000000", minimumRealDeposit: "50.00000000", realFundingReady: false, hourlyEntryLimit: 10, maxOpenPositions: 3 };
const fund = { code: "continue_with_real_funds", reason: "trial_limit" };
const other = { code: "fund_trial", reason: "trial_without_credited_deposit" };
test("real funding need: what's left of 50, rounded up, never negative", () => {
  assert.equal(realFundingNeed({ confirmedDeposits: "10.00000000", minimumRealDeposit: "50.00000000" }), "40");
  assert.equal(realFundingNeed({ confirmedDeposits: "10.505", minimumRealDeposit: "50" }), "39.5");
  assert.equal(realFundingNeed({ confirmedDeposits: "60.00000000", minimumRealDeposit: "50.00000000" }), "0");
});
test("trialCard per status", () => {
  assert.equal(trialCard(null, other), null);
  assert.equal(trialCard(undefined, other), null);
  assert.deepEqual(trialCard({ ...trial, used: 0, remaining: 50, status: "ready" }, other), { status: "ready", title: "Trial ready", line: "50 trades remaining", pct: 0, note: null, cta: null });
  assert.deepEqual(trialCard(trial, other), { status: "active", title: "12 of 50 trades used", line: "38 trades remaining", pct: 24, note: null, cta: null });
  assert.equal(trialCard({ ...trial, reserved: 1 }, other)?.note, "1 entry being placed");
  const drain = trialCard({ ...trial, used: 50, remaining: 0, unsettled: 2, status: "draining" }, fund)!;
  assert.equal(drain.title, "Finishing your trial trades");
  assert.equal(drain.note, "2 trades still open or settling. No new trades start.");
  assert.equal(drain.cta, "Continue with real funds — 50 USDT");
  const done = trialCard({ ...trial, used: 50, remaining: 0, status: "completed" }, fund)!;
  assert.equal(done.title, "XENO Paused");
  assert.equal(done.line, "Your 50 trial trades are done");
  assert.equal(trialCard({ ...trial, status: "converted", confirmedDeposits: "60.00000000", realFundingReady: true }, other), null);
  assert.equal(trialCard({ ...trial, status: "something_new" }, other), null);
});
test("trialCard: used above the limit", () => {
  const v = trialCard({ ...trial, used: 52, remaining: 0, unsettled: 1, status: "draining" }, fund)!;
  assert.equal(v.line, "All 50 trial trades used");
  assert.equal(v.pct, 100);
});
test("trialCard: a payment in progress wins", () => {
  assert.equal(trialCard({ ...trial, used: 50, remaining: 0, status: "completed" }, { code: "continue_deposit", reason: "unpaid_deposit" })?.cta, null);
});
test("trialCard: a small deposit needs topping up to 50", () => {
  const v = trialCard({ ...trial, status: "converted", confirmedDeposits: "10.00000000" }, { code: "continue_with_real_funds", reason: "real_funding_required" })!;
  assert.deepEqual(v, { status: "converted", title: "XENO Paused", line: "Deposited 10 of 50 USDT", pct: 24, note: "Add 40 USDT more to start real trading.", cta: "Add 40 USDT" });
});
test("trial pauses: draining vs done, from trial.status", () => {
  const p = { ...base, status: "paused", pauseReason: "trial_limit" };
  assert.equal(traderState({ ...p, trial: { status: "draining", confirmedDeposits: "0", minimumRealDeposit: "50" } }).title, "Finishing your trial trades");
  assert.equal(traderState({ ...p, trial: { status: "draining", confirmedDeposits: "0", minimumRealDeposit: "50" }, quota: { ...base.quota, openPositions: 2 } }).mode, "managing");
  const done = traderState({ ...p, trial: { status: "completed", confirmedDeposits: "0", minimumRealDeposit: "50" } });
  assert.equal(done.key, "trial_done");
  assert.equal(done.title, "XENO Paused");
  assert.equal(traderState({ ...p, migrationState: "draining" }).key, "migrating");
  const rf = traderState({ ...base, status: "paused", pauseReason: "real_funding_required", trial: { status: "converted", confirmedDeposits: "10.00000000", minimumRealDeposit: "50.00000000" } });
  assert.equal(rf.key, "real_funding");
  assert.equal(rf.body, "Add 40 USDT to start real trading");
  assert.equal(rf.cta, undefined);
  assert.equal(tradingSource({ ...base, status: "paused", pauseReason: "real_funding_required", balances: { sourceMode: "mixed" } }), "XENO Paused");
});
```
In the existing CTA test, add `continue_with_real_funds` to the `codes` list. The short-pill length check (≤ 9) then covers it too.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm test`. Expected: FAIL (`ceilTo`, `realFundingNeed`, `trialCard` not exported).

- [ ] **Step 3: Add the types, then `ceilTo`, `realFundingNeed`, `trialUsage`, `trialCard`, the traderState branches and the CTA entry**

`ceilTo` works in 8-dp units: truncate to `dp`, add one step when anything was cut off (inputs here are non-negative).

- [ ] **Step 4: Run tests, typecheck**

Run: `npm test && npx tsc --noEmit`. Expected: all tests pass, no type errors.

- [ ] **Step 5: Checkpoint** (commit only if the user asked)

---

### Task 2: Campaign visit and click tracking

**Files:**
- Create: `lib/analytics.ts`, `lib/analytics.test.ts`
- Modify: `lib/telegram.ts` (`initDataUnsafe` gains `auth_date?: number`)
- Modify: `lib/api/session.ts` (visit plus `visitId` on login)
- Modify: `lib/api/client.ts` (`analyticsEvent`)
- Modify: `components/deposit/deposit-sheet.tsx` (`useFundXeno`)
- Modify (call sites, per the user's choice of click scope): `components/trader/next-step.tsx`, `components/trader/agent-orb.tsx`, `components/trader/agent-card.tsx` (option B also touches `app/page.tsx` QuickActions, `app/wallet/page.tsx` and `components/trader/account-cards.tsx`)

**Interfaces:**
- Produces (pure, `lib/analytics.ts`, no imports from `@/`):
  - `campaignCode(startParam: string | null | undefined): string | undefined`: drops the `cmp_` prefix and returns the code if it matches `/^[A-Za-z0-9_-]{1,40}$/`, otherwise undefined. A referral code returns undefined. An invalid code is left out rather than sent, because the server answers 400 and the open would be lost.
  - `uuid4(c?: { randomUUID?: () => string; getRandomValues: Crypto["getRandomValues"] }): string`: uses `crypto.randomUUID` when available, otherwise builds a v4 UUID from `getRandomValues` (older WebViews).
  - `quietly(send: () => Promise<unknown>, o: { tries: number; delayMs: number; retryable: (e: unknown) => boolean }): Promise<boolean>`: never rejects. Resolves true on success, false after the last failure. Retries only `retryable` errors and doubles the delay each time.
- Produces (`lib/api/client.ts`): `analyticsEvent: (body: { eventId: string; event: "fund_xeno_clicked" }) => api<{ accepted: true }>("/analytics/events", { method: "POST", body })`
- Produces (`deposit-sheet.tsx`): `useFundXeno(): () => void`. It sends one `fund_xeno_clicked` with a fresh `uuid4()` (fire-and-forget through `quietly`, 3 tries, 1 s, retryable = `ApiError.uncertain`) and then calls `openDeposit()` immediately.
- Session behaviour (`session.ts`):
  - `openVisit(app)` runs once per module life. The id is stored in sessionStorage `txai.visit` as `{ key: "<auth_date>:<start_param>", id }`. The same key (a reload of the same open) reuses the id, so the server's idempotent insert counts it once. A new key means a new open and a new `uuid4()`.
  - It POSTs `/analytics/visits` publicly (`send(…, null)`, no token) with `{ visitId, campaignCode }`. `campaignCode` is omitted when undefined. The call goes through `quietly` (3 tries, 1 s).
  - `doBoot` calls `openVisit` before either sign-in path. The initData path waits `Promise.race([visitSent, 1500 ms])` before `POST /auth/telegram`, so the visit exists when the server links it, then sends `{ initData, visitId }`. A failed or slow visit never blocks or fails the login.
  - No new `app_opened` via `/analytics/events`, ever.

- [ ] **Step 1: Write the failing tests** (`lib/analytics.test.ts`)

```ts
test("campaign code comes only from cmp_ start params", () => {
  assert.equal(campaignCode("cmp_launch_20261025"), "launch_20261025");
  assert.equal(campaignCode("cmp_a-b_C9"), "a-b_C9");
  assert.equal(campaignCode("ABCD1234"), undefined); // a referral code
  assert.equal(campaignCode("cmp_"), undefined);
  assert.equal(campaignCode("cmp_bad code"), undefined);
  assert.equal(campaignCode("cmp_" + "a".repeat(41)), undefined);
  assert.equal(campaignCode(undefined), undefined);
});
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
test("uuid4 is a v4 UUID, with or without randomUUID", () => {
  assert.match(uuid4(), V4);
  assert.match(uuid4({ getRandomValues: (a) => crypto.getRandomValues(a) }), V4);
});
test("quietly retries only retryable errors and never throws", async () => {
  let n = 0;
  assert.equal(await quietly(async () => { if (++n < 3) throw new Error("net"); }, { tries: 3, delayMs: 0, retryable: () => true }), true);
  assert.equal(n, 3);
  n = 0;
  assert.equal(await quietly(async () => { n++; throw new Error("400"); }, { tries: 3, delayMs: 0, retryable: () => false }), false);
  assert.equal(n, 1);
  n = 0;
  assert.equal(await quietly(async () => { n++; throw new Error("net"); }, { tries: 3, delayMs: 0, retryable: () => true }), false);
  assert.equal(n, 3);
});
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npm test`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `lib/analytics.ts`, then wire the session, client, `useFundXeno` and the call sites.** In `next-step.tsx`, `run()` uses `fundXeno()` when `cta.action === "open_deposit_create"` and `act()` otherwise.
- [ ] **Step 4: Run** `npm test && npx tsc --noEmit && npx eslint lib components app`. Expected: all pass, no errors.
- [ ] **Step 5: Checkpoint**

---

### Task 3: Home trial card and the big real-funds CTA

**Files:**
- Create: `components/trader/trial-card.tsx`
- Modify: `app/page.tsx`, `components/trader/next-step.tsx` (LOOK entry), `components/trader/agent-card.tsx`, `components/trader/welcome-dialog.tsx`, `components/trader/agent-tour.tsx`

**Interfaces:**
- Consumes: `trialCard`, `trialUsage` (Task 1); `useFundXeno` (Task 2).
- Produces: `TrialCard({ t, view }: { t: Trader; view: TrialView })`.

Behaviour (assumes the user picks the in-page placement; with the other option the CTA lives in a bigger bottom banner instead):
- `app/page.tsx`: `const trial = trialCard(t.trial, t.engagement.recommendedCta)`. Render `<TrialCard>` between `<AgentOrb>` and `<AgentSummary>` when it isn't null. Render `<NextStepCard>` only when `!trial?.cta`, because `trial.cta` is set only for `continue_with_real_funds`, so the same button is never shown twice. Add `${t.trial?.status ?? ""}` to the `useLedgerSync` signature.
- The card follows `OnboardingCard`'s look: eyebrow `Trial`, the title, a `role="progressbar"` bar at `pct`, the line, the note, and in ready/active the caption `Up to {hourlyEntryLimit} new trades an hour · {maxOpenPositions} open at once`. When `view.cta` is set it shows a full-width `Button size="lg"` with that label → `useFundXeno()`. No timer.
- `next-step.tsx`: `LOOK.continue_with_real_funds = { colors: VIOLET }`, so the banner fallback renders when the card is hidden.
- `agent-card.tsx`: under the hourly-quota line, `Trial: {trialUsage(t.trial)}` while `t.trial` exists and its status isn't `converted`.
- `welcome-dialog.tsx`: append ` for your first {limit} trades` to the Trial-fund sentence when the trial is ready or active. `agent-tour.tsx`: slide 2's first point becomes `Trial fund covers your first {limit} trades; it can't be withdrawn` when `t.trial` exists (`Facts` gains `"trial"`).

- [ ] **Step 1:** Implement the card and wiring (logic is already tested in Task 1).
- [ ] **Step 2:** Run `npx tsc --noEmit && npx eslint lib components app && npm test`. Expected: clean.
- [ ] **Step 3:** Mock check: point a scratchpad copy at a stubbed `/trader` (see Task 6), or check on dev.tradexai.pro with the user. Each status should render the table row from Task 1 at 360 px width without clipping.
- [ ] **Step 4: Checkpoint**

---

### Task 4: Deposit form: suggested amounts, the real-funding note and the support line

**Files:**
- Modify: `components/money/flow-ui.tsx` (quick items gain `tag?: string`)
- Modify: `components/deposit/deposit-sheet.tsx`
- Modify: `lib/env.ts`, `.env.example` (`NEXT_PUBLIC_SUPPORT_URL`)
- Modify: `lib/trader.ts`, `lib/trader.test.ts`

**Interfaces:**
- Produces:
  - `supportHref(server: string | null | undefined, fallback: string): string | null`: the first value that parses as an `https:` URL, otherwise null. `#`, `javascript:`, `http:` and empty strings are never links.
  - `realFundingNote(amount: string, trial: Trial | null | undefined): string | null`: null unless the trial exists, `!realFundingReady`, the amount is valid (`isAmount(amount, 10, 2)`) and `cmp(amount, need) < 0`. Before any credited deposit: `A credited deposit ends your trial. XENO trades again once your deposits total 50 USDT.` After a small one (converted): `XENO trades again once your deposits total 50 USDT: 40 USDT to go.`
  - `SUPPORT_URL` in `lib/env.ts`: `process.env.NEXT_PUBLIC_SUPPORT_URL ?? ""`.

Form changes (`DepositForm`):
- Quick picks come from `useTrader().data?.depositUi`: `quickAmounts` if non-empty, otherwise today's `["25","50","100","250","500"]`. Each pick is `{ label: "$" + trimZeros(v), value: trimZeros(v), tag: "Recommended" }` for the pick equal (`cmp`) to `recommendedAmount`. No other tag, and never `Popular`. A custom amount still works as today.
- In `AmountDial`, a tagged pill shows a small `Recommended` badge on its top edge. The scroll row gets enough top padding that the badge isn't clipped (overflow-x clips vertically too).
- Below the amount step, `realFundingNote` appears as a `Notice tone="info"`. It only informs: it never disables the button and never replaces the coin's `minUsd` check. `minimumRealFunding` is never used as a validation minimum.
- Under `Get deposit address`, when `supportHref(depositUi?.supportUrl, SUPPORT_URL)` gives a link: one centred caption button showing `depositUi.helpText` (fallback `Need help with your deposit? Contact support`) → `openExternal(href)`. Without a link, render nothing (this follows the user's answer about the support link).

- [ ] **Step 1: Write the failing tests**

```ts
test("support link: https only, server first, never a dead link", () => {
  assert.equal(supportHref("https://t.me/tradexai_support", ""), "https://t.me/tradexai_support");
  assert.equal(supportHref(null, "https://t.me/help"), "https://t.me/help");
  assert.equal(supportHref("#", ""), null);
  assert.equal(supportHref("javascript:alert(1)", ""), null);
  assert.equal(supportHref("http://example.com", ""), null);
  assert.equal(supportHref(null, ""), null);
});
test("real funding note only while the deposit falls short of 50 in total", () => {
  assert.equal(realFundingNote("25", trial), "A credited deposit ends your trial. XENO trades again once your deposits total 50 USDT.");
  assert.equal(realFundingNote("50", trial), null);
  assert.equal(realFundingNote("", trial), null);
  assert.equal(realFundingNote("20", { ...trial, status: "converted", confirmedDeposits: "10.00000000" }), "XENO trades again once your deposits total 50 USDT: 40 USDT to go.");
  assert.equal(realFundingNote("40", { ...trial, status: "converted", confirmedDeposits: "10.00000000" }), null);
  assert.equal(realFundingNote("5", { ...trial, realFundingReady: true }), null);
  assert.equal(realFundingNote("5", null), null);
});
```
- [ ] **Step 2:** `npm test`. Expected: FAIL (not exported).
- [ ] **Step 3:** Implement the helpers, the `tag` support in `AmountDial` and the form changes.
- [ ] **Step 4:** `npm test && npx tsc --noEmit && npx eslint lib components app`. Expected: clean.
- [ ] **Step 5: Checkpoint**

---

### Task 5: Processing withdrawals in the live bar and Community

**Files:**
- Modify: `lib/api/types.ts` (CommunityItem), `lib/api/client.ts` (doc comments only)
- Modify: `lib/trader.ts`, `lib/trader.test.ts`
- Modify: `components/shell/live-ticker.tsx`, `app/leaderboard/page.tsx`

**Interfaces:**
- Produces (types): `CommunityItem.type` gains `"withdrawal_processing"`, plus `status?: string` and `processing?: boolean`.
- Produces (functions):
  - `withdrawalState(i: Pick<CommunityItem, "type" | "status">): "confirmed" | "processing" | null`: `withdrawal` with `status` missing or `confirmed` → confirmed. `withdrawal_processing` with status in `queued | signed | broadcast` → processing. Everything else (`awaiting_otp`, `expired`, `cancelled`, `failed`, `review`, trades) → null.
  - `feedKey(i: Pick<CommunityItem, "type" | "id">): string`: `withdrawal:<id>` for both withdrawal types, otherwise `<type>:<id>`.
  - `dedupeFeed<T extends Pick<CommunityItem, "type" | "id">>(items: T[]): T[]`: one item per `feedKey`, at the position it first appears. The confirmed version replaces a processing one.
  - `TickerLine` gains `pending: boolean`. `tickerLine` for processing returns `{ out: true, pending: true, verb: "is withdrawing", value: "84.00 USDT", coin: null, when }`, with no "just" wording. Confirmed lines keep `withdrew` / `just withdrew` and `pending: false`. Profit lines are unchanged (ROI only, no amount) with `pending: false`. The 24 h age filter applies to every type.

- [ ] **Step 1: Write the failing tests.** Update the existing `tickerLine` deepEquals with `pending: false` and add:

```ts
test("processing withdrawals read as in progress; hidden states stay out", () => {
  const now = Date.parse("2026-10-25T10:12:00.000Z");
  const p = { id: "w1", type: "withdrawal_processing", status: "broadcast", name: "Ali***", amount: "84.00000000", asset: "USDT", symbol: null, occurredAt: "2026-10-25T10:00:00.000Z" };
  assert.deepEqual(tickerLine(p, now), { name: "Ali***", out: true, pending: true, verb: "is withdrawing", value: "84.00 USDT", coin: null, when: "12m ago" });
  for (const status of ["awaiting_otp", "expired", "cancelled", "failed", "review"]) assert.equal(tickerLine({ ...p, status }, now), null, status);
  assert.equal(withdrawalState({ type: "withdrawal", status: "confirmed" }), "confirmed");
  assert.equal(withdrawalState({ type: "withdrawal" }), "confirmed");
  assert.equal(withdrawalState({ type: "withdrawal_processing", status: "queued" }), "processing");
  assert.equal(withdrawalState({ type: "trade_profit" }), null);
});
test("one line per withdrawal id, the confirmed one wins", () => {
  const p = { id: "w1", type: "withdrawal_processing" }, c = { id: "w1", type: "withdrawal" }, t = { id: "w1", type: "trade_profit" };
  assert.deepEqual(dedupeFeed([p, c, t]), [c, t]);
  assert.deepEqual(dedupeFeed([c, p]), [c]);
  assert.equal(feedKey(p), feedKey(c));
});
```
- [ ] **Step 2:** `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. In `live-ticker.tsx`, build lines from `dedupeFeed(items)` keyed by `feedKey`. Pending lines use `HourglassIcon` and confirmed ones `ArrowUp02Icon`, both in the info colour. In the `leaderboard/page.tsx` Withdrawals tab, list `dedupeFeed(items).filter(withdrawalState)` keyed by `feedKey`, with sub text `Withdrawing · {ago}` + hourglass for processing and `Withdrew · {ago}` for confirmed. The amount is the server's net amount as is. The Live trades tab is unchanged. The personal profit bubbles (`profit-events.tsx`) stay untouched: they read only `/trader/events`.
- [ ] **Step 4:** `npm test && npx tsc --noEmit && npx eslint lib components app`. Expected: clean.
- [ ] **Step 5: Checkpoint**

---

### Task 6: Verification (no deploy)

- [ ] `npm test`: everything passes (25 existing + new).
- [ ] `npx tsc --noEmit` and `npx eslint lib components app`: no output.
- [ ] Scratchpad production build: `rsync -a --exclude node_modules --exclude .next --exclude .git /www/tradeXai/ <scratch>/app/`, then `cp -a /www/tradeXai/node_modules <scratch>/app/`, then `cd <scratch>/app && npx next build`. Expected: "Compiled successfully" and all routes listed. `/www/tradeXai/.next` is not touched.
- [ ] `grep -rn "console\." lib/analytics.ts lib/api/session.ts components/deposit/deposit-sheet.tsx` → nothing. `grep -rn "userId" components/trader/trial-card.tsx` → nothing.
- [ ] Walk the spec's §9 checklist and note which items the frontend shows (1, 3, 4, 6, 7, 9, 10 through the UI; 2 through server-side counting plus the stable visit id) and which belong to the server (5, 8, 11, 12 logging).
- [ ] Report to the user. Deploying (`sudo -u www npm run build` + restart from aaPanel) is their call.

## Out of scope for the frontend (guardrails only)

- §6 server events: the frontend sends only the anonymous visit (`/analytics/visits`) and `fund_xeno_clicked`. It never sends `registration_completed`, `trial_started`, `trial_completed`, `deposit_address_generated` or `deposit_confirmed`.
- §7 admin campaign API (`/ops/campaigns`): not exposed in the public app, and no admin token in the bundle.
- §8 migration: server-side. The UI only shows what `/trader` returns (`remaining` is already clamped at 0).
- §10 first campaign link: it already exists on the server. Its numbers start once Task 2 is deployed.
- The calculator's win rate, fees and strategy rules are unchanged by this update.
