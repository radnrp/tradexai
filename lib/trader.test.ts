// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { setLang } from "./i18n/index.ts";
import { ctaCopy, dedupeFeed, feedKey, feedRows, onboardingStep, positionRoi, realFundingNeed, realFundingNote, roiText, setupTrack, supportHref, tickerLine, traderState, tradingSource, trialCard, trialGuide, trialProfitFundingText, trialProfitLock, trialProfitText, statementFigure, trialTitle, withdrawActivation, withdrawalBlock, withdrawalErrorText, withdrawalState } from "./trader.ts";

const base = {
  status: "active",
  pauseReason: null,
  migrationState: "ready",
  minimumCapital: "50.00000000",
  engine: { origin: "demo", entriesEnabled: true, blockedReason: null, lastTickAt: null },
  valuation: { status: "complete" as const, missingSymbols: [], reasons: [] as string[] },
  quota: { basis: "rolling_60_minutes", hourlyEntryLimit: 10, entriesLastHour: 2, remainingEntries: 8, nextEntrySlotAt: null, maxOpenPositions: 3, openPositions: 0 },
};

test("status follows the contract's priority order", () => {
  assert.equal(traderState(base).key, "scanning");
  assert.equal(traderState(base).mode, "scanning");
  assert.equal(traderState({ ...base, quota: { ...base.quota, openPositions: 1 } }).key, "managing");
  // migration beats everything, even a risk pause
  assert.equal(traderState({ ...base, migrationState: "draining", pauseReason: "risk_drawdown" }).key, "migrating");
  assert.equal(traderState({ ...base, status: "paused", pauseReason: "risk_drawdown" }).key, "risk");
  const min = traderState({ ...base, status: "paused", pauseReason: "minimum_capital" });
  assert.equal(min.key, "minimum");
  assert.equal(min.cta, "deposit");
  assert.equal(min.title, "Needs at least 50 USDT to trade");
  assert.equal(traderState({ ...base, engine: { ...base.engine, entriesEnabled: false } }).key, "entries_off");
  assert.equal(traderState({ ...base, valuation: { ...base.valuation, reasons: ["funding_pending", "market_prices_unavailable"] } }).key, "funding");
  assert.equal(traderState({ ...base, valuation: { ...base.valuation, reasons: ["market_prices_unavailable"] } }).key, "prices");
});

test("quota: three open trades in total, then the rolling hour", () => {
  const full = traderState({ ...base, quota: { ...base.quota, openPositions: 3, remainingEntries: 0 } });
  assert.equal(full.key, "max_open");
  assert.equal(full.mode, "managing");
  const used = traderState({ ...base, quota: { ...base.quota, openPositions: 1, remainingEntries: 0, nextEntrySlotAt: "2026-10-20T10:30:00.000Z" } });
  assert.equal(used.key, "quota");
  assert.equal(used.nextSlotAt, "2026-10-20T10:30:00.000Z");
});

test("withdrawal block reasons", () => {
  const ok = { migrationState: "ready", withdrawalBlockedReason: null, withdrawalAvailable: true };
  assert.equal(withdrawalBlock(ok), null);
  assert.match(withdrawalBlock({ ...ok, migrationState: "draining" })!, /previous trades/);
  assert.match(withdrawalBlock({ ...ok, withdrawalBlockedReason: "funding_pending", withdrawalAvailable: false })!, /Funding/);
  assert.match(withdrawalBlock({ ...ok, withdrawalBlockedReason: "valuation_unavailable", withdrawalAvailable: false })!, /prices/);
  assert.match(withdrawalBlock({ ...ok, withdrawalAvailable: false })!, /unavailable/);
  // the trial-profit lock says what's missing, from the server's numbers
  const locked = { ...ok, withdrawalBlockedReason: "trial_profit_locked", withdrawalAvailable: false };
  assert.equal(withdrawalBlock({ ...locked, trialProfitProtection: protection }), "Just 30 USDT more unlocks your trial profit, then it's yours to withdraw.");
  assert.match(withdrawalBlock(locked)!, /trial profit/);
});

const protection = {
  enabled: true,
  policyVersion: 1,
  asset: "USDT",
  minimumDeposit: "50.00000000",
  confirmedDeposits: "20.00000000",
  depositRemaining: "30.00000000",
  fundingConditionMet: false,
  lockedProfit: "12.00000000",
  withdrawalConditionMet: false,
  trialPrincipalWithdrawable: false as const,
  appliesTo: "all_users",
  basis: "settled_trial_entry_net_after_grant_loss_coverage_and_prior_outflows",
  activatedAt: "2026-10-30T11:59:04.260Z",
};

test("trial profit lock only while the rule is on, unmet and holding profit", () => {
  assert.deepEqual(trialProfitLock(protection), { locked: "12.00000000", remaining: "30.00000000", minimum: "50.00000000", amount: "30" });
  assert.equal(trialProfitLock({ ...protection, depositRemaining: "29.50000001" })?.amount, "29.51");
  assert.equal(trialProfitLock({ ...protection, enabled: false }), null);
  assert.equal(trialProfitLock({ ...protection, fundingConditionMet: true, lockedProfit: "0.00000000" }), null);
  assert.equal(trialProfitLock({ ...protection, lockedProfit: "0.00000000" }), null);
  assert.equal(trialProfitLock(null), null);
  assert.equal(trialProfitLock(undefined), null);
  // an invitation: the full amount before any deposit, what's left after one
  assert.equal(trialProfitText(trialProfitLock(protection)), "Just 30 USDT more unlocks your trial profit, then it's yours to withdraw.");
  assert.equal(
    trialProfitText(trialProfitLock({ ...protection, depositRemaining: "50.00000000" })),
    "Unlock your trial profit with a 50 USDT deposit, then it's yours to withdraw.",
  );
  assert.equal(trialProfitText(null), null);
});

test("server messages become plain words; unknown ones pass through", () => {
  assert.match(withdrawalErrorText("Insufficient free withdrawable balance; trial principal is not withdrawable"), /Trial grant/);
  assert.match(withdrawalErrorText("Fresh prices unavailable; withdrawal was not reserved"), /nothing was reserved/);
  assert.equal(withdrawalErrorText("Invalid address"), "Invalid address");
});

test("live bar lines say 'just' only when recent, and drop stale items", () => {
  const now = Date.parse("2026-10-20T10:10:00.000Z");
  const w = { type: "withdrawal", name: "Sar***", amount: "99.50000000", asset: "USDT", symbol: null, occurredAt: "2026-10-20T10:09:30.000Z" };
  assert.deepEqual(tickerLine(w, now), { kind: "withdrawal", name: "Sar***", out: true, pending: false, verb: "just withdrew", value: "99.50 USDT", coin: null, when: null });
  const p = { type: "trade_profit", name: "Par***", amount: "2.34000000", asset: "USDT", roiPercent: "2.40000000", symbol: "ETHUSDT", occurredAt: "2026-10-20T10:05:00.000Z" };
  // a profit reads as its ROI, never the amount; without an ROI it stays out of the bar
  assert.deepEqual(tickerLine(p, now), { kind: "profit", name: "Par***", out: false, pending: false, verb: "earned", value: "+2.40%", coin: "ETH", when: "5m ago" });
  assert.equal(tickerLine({ ...p, roiPercent: null }, now), null);
  assert.equal(tickerLine({ ...p, roiPercent: undefined }, now), null);
  assert.equal(tickerLine({ ...p, occurredAt: "2026-10-20T07:00:00.000Z" }, now)?.when, "3h ago");
  assert.equal(tickerLine({ ...p, occurredAt: "2026-10-18T09:00:00.000Z" }, now), null);
  assert.equal(tickerLine({ ...w, type: "something_else" }, now), null);
  assert.equal(tickerLine({ ...w, occurredAt: "not a date" }, now), null);
  // a credited deposit reads as money in, never as a profit
  const d = { type: "deposit", status: "credited", name: "Ali***", amount: "49.39000000", asset: "USDT", symbol: null, occurredAt: "2026-10-20T10:07:00.000Z" };
  assert.deepEqual(tickerLine(d, now), { kind: "deposit", name: "Ali***", out: false, pending: false, verb: "deposited", value: "49.39 USDT", coin: null, when: "3m ago" });
  assert.equal(tickerLine({ ...d, occurredAt: "2026-10-20T10:09:30.000Z" }, now)?.verb, "just deposited");
  assert.equal(tickerLine({ ...d, amount: null }, now), null);
  // an approved review shows its rating; a low one stays in like any other
  const f = { type: "feedback", status: "approved", name: "Sar***", text: "My approved experience...", rating: 2, amount: null, asset: null, symbol: null, occurredAt: "2026-10-20T10:00:00.000Z" };
  assert.deepEqual(tickerLine(f, now), { kind: "feedback", name: "Sar***", out: false, pending: false, verb: "rated XENO", value: "2/5", coin: null, when: "10m ago" });
  assert.equal(tickerLine({ ...f, rating: undefined }, now), null);
});

test("onboarding labels", () => {
  assert.equal(onboardingStep("fund_account").title, "Make a deposit");
  assert.equal(onboardingStep("something_new").title, "something new");
  assert.equal(onboardingStep("tutorial_watched").short, "Tutorial");
  assert.equal(onboardingStep("something_new").short, "something new");
});

test("setup track: done steps first, then the open ones, with the share done", () => {
  const steps = [
    { key: "account_created", complete: true },
    { key: "tutorial_watched", complete: false },
    { key: "fund_account", complete: false },
    { key: "trader_ready", complete: true },
  ];
  const t = setupTrack(steps);
  assert.deepEqual(t.ordered.map((s) => s.key), ["account_created", "trader_ready", "tutorial_watched", "fund_account"]);
  assert.equal(t.pct, 50);
  assert.equal(t.next, "tutorial_watched");
  assert.equal(setupTrack(steps.map((s) => ({ ...s, complete: false }))).pct, 0);
  const all = setupTrack(steps.map((s) => ({ ...s, complete: true })));
  assert.equal(all.pct, 100);
  assert.equal(all.next, null);
});

test("ROI reads as a signed percentage, never rescaled; unknown stays a dash", () => {
  assert.equal(roiText("2.40000000"), "+2.40%");
  assert.equal(roiText("-1.25000000"), "−1.25%");
  assert.equal(roiText("0.00000000"), "0.00%");
  assert.equal(roiText(null), "—");
  assert.equal(roiText(undefined), "—");
});

test("what XENO trades: the agent's real state first, then where its capital comes from", () => {
  const src = (sourceMode: Parameters<typeof tradingSource>[0]["balances"]["sourceMode"], over = {}) => tradingSource({ ...base, ...over, balances: { sourceMode } });
  assert.equal(src("trial"), "XENO is trading on your free trial");
  assert.equal(src("trial_with_profits"), "XENO is trading on your free trial");
  assert.equal(src("mixed"), "XENO is trading your funds");
  assert.equal(src("real"), "XENO is trading your real funds");
  assert.equal(src("empty"), "Add funds to continue trading");
  assert.equal(src("unavailable"), "Updating your trading balance");
  // never "is trading" while it can't
  assert.equal(src("real", { status: "paused", pauseReason: "minimum_capital" }), "Needs at least 50 USDT to trade");
  assert.equal(src("trial", { engine: { ...base.engine, entriesEnabled: false } }), "New trades are temporarily off");
  assert.equal(src("mixed", { migrationState: "draining" }), "Settling your previous trades");
  // the grant can run out before the trial does: what's left is still no deposit, so never "real funds"
  const on = (status: string) => ({ trial: { status, confirmedDeposits: "0.00000000", minimumRealDeposit: "50.00000000" } });
  assert.equal(src("real", on("active")), "XENO is trading on your free trial");
  assert.equal(src("real", on("converted")), "XENO is trading your real funds");
  // ready: no entry yet, so no claim that trading has started
  assert.equal(src("trial", on("ready")), "XENO is looking for its first trade");
});

test("next-step copy per server code; an unknown code shows nothing", () => {
  assert.deepEqual(ctaCopy("fund_trial"), { kind: "fund", title: "Like what you see?", text: "Start real trading with your own funds.", button: "Fund XENO", short: "Fund XENO" });
  // the banner never names a minimum: 50 USDT is the agent's capital rule, not every deposit's minimum
  for (const code of ["fund_trial", "fund_profitable_trial", "fund_after_trial", "add_after_withdrawal", "add_to_profitable_account", "add_capital"])
    assert.doesNotMatch(`${ctaCopy(code)?.title} ${ctaCopy(code)?.text}`, /\d+\s*USDT/);
  assert.equal(ctaCopy("track_withdrawal")?.kind, "info");
  assert.equal(ctaCopy("track_withdrawal")?.button, "Track withdrawal");
  assert.equal(ctaCopy("continue_deposit")?.kind, "pending");
  assert.equal(ctaCopy("something_new"), null);
  assert.equal(ctaCopy("fund_to_unlock_trial_profit")?.kind, "fund");
  assert.equal(ctaCopy("fund_to_unlock_trial_profit")?.button, "Fund XENO");
  // the fixed banner gives every code a title, a line and a button
  const codes = ["continue_deposit", "deposit_processing", "track_withdrawal", "view_trader_status", "restore_capital", "review_performance", "retry_deposit",
    "fund_after_trial", "fund_profitable_trial", "fund_trial", "add_after_withdrawal", "add_to_profitable_account", "add_capital", "continue_with_real_funds"];
  for (const code of codes) {
    const c = ctaCopy(code);
    assert.ok(c?.title && c.text && c.button, code);
    // the slim banner's pill: short, so the title keeps its room
    assert.ok(c.short && c.short.length <= 9, code);
  }
  assert.equal(ctaCopy("deposit_processing")?.title, "Deposit in progress");
});

test("a closed trade's ROI is on its initial margin, or the entry notional for old trades, like the server's", () => {
  assert.equal(positionRoi({ net_pnl: "0.12000000", margin_amount: "5.00000000", entry_notional: "100.00000000" }), "2.40000000");
  assert.equal(positionRoi({ net_pnl: "0.12000000", margin_amount: null, entry_notional: "100.00000000" }), "0.12000000");
  assert.equal(positionRoi({ net_pnl: "-0.50000000", margin_amount: "10.00000000", entry_notional: "200.00000000" }), "-5.00000000");
  assert.equal(positionRoi({ net_pnl: "0.12000000", margin_amount: "0.00000000", entry_notional: "100.00000000" }), null);
  assert.equal(positionRoi({ net_pnl: null, margin_amount: "5.00000000", entry_notional: "100.00000000" }), null);
});

const trial = {
  limit: 50,
  used: 12,
  remaining: 38,
  reserved: 0,
  unsettled: 0,
  status: "active",
  endReason: null,
  endedAt: null,
  confirmedDeposits: "0.00000000",
  minimumRealDeposit: "50.00000000",
  realFundingReady: false,
  hourlyEntryLimit: 10,
  maxOpenPositions: 3,
};
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
  const used = (value: string) => ({ value, label: "trial trades used" });
  // ready never claims trading has started
  assert.deepEqual(trialCard({ ...trial, used: 0, remaining: 50, status: "ready" }, other), {
    status: "ready", title: "Your XENO trial is ready", counter: used("0 / 50"), pct: 0, note: "Your free trial includes 50 trade entries.", cta: null,
  });
  assert.deepEqual(trialCard({ ...trial, used: 5, remaining: 45 }, other), {
    status: "active", title: "XENO Trial is running", counter: used("5 / 50"), pct: 10, note: "Your free trial includes 50 trade entries.", cta: null,
  });
  // the limit is the server's, never a fixed 50
  assert.equal(trialCard({ ...trial, limit: 20, used: 5, remaining: 15 }, other)?.note, "Your free trial includes 20 trade entries.");
  assert.equal(trialCard({ ...trial, limit: 20, used: 5, remaining: 15 }, other)?.counter.value, "5 / 20");
  // an order being placed isn't an entry yet: the one line says so and the counter doesn't move
  assert.equal(trialCard({ ...trial, reserved: 1 }, other)?.note, "1 entry being placed");
  assert.equal(trialCard({ ...trial, reserved: 1 }, other)?.counter.value, "12 / 50");
  assert.equal(trialCard({ ...trial, reserved: 2 }, other)?.note, "2 entries being placed");
  assert.deepEqual(trialCard({ ...trial, used: 50, remaining: 0, unsettled: 2, status: "draining" }, fund), {
    status: "draining",
    title: "Trial entries completed",
    counter: used("50 / 50"),
    pct: 100,
    note: "Finishing open trades and final settlements.",
    cta: { button: "Continue with real funds", amount: "50" },
  });
  assert.deepEqual(trialCard({ ...trial, used: 50, remaining: 0, status: "completed" }, fund), {
    status: "completed",
    title: "Your XENO trial is complete",
    counter: used("50 / 50"),
    pct: 100,
    // the amount is said before the button, which stays one line on any phone
    note: "Deposit 50 USDT to keep XENO trading.",
    cta: { button: "Continue with real funds", amount: "50" },
  });
  assert.equal(trialCard({ ...trial, status: "converted", confirmedDeposits: "60.00000000", realFundingReady: true }, other), null);
  assert.equal(trialCard({ ...trial, status: "something_new" }, other), null);
});

test("trialCard: used above the limit stays a plain count, and the bar stops at 100%", () => {
  const v = trialCard({ ...trial, used: 63, remaining: 0, status: "completed" }, fund)!;
  assert.equal(v.counter.value, "50 / 50");
  assert.equal(v.pct, 100);
  assert.equal(trialCard({ ...trial, used: -1 }, other)?.pct, 0);
  assert.equal(trialCard({ ...trial, limit: 0, used: 0 }, other)?.pct, 0);
});

test("trialCard: a payment in progress wins", () => {
  const v = trialCard({ ...trial, used: 50, remaining: 0, status: "completed" }, { code: "continue_deposit", reason: "unpaid_deposit" })!;
  assert.equal(v.cta, null);
  // still says why XENO stands still
  assert.equal(v.note, "XENO is paused until you add funds.");
});

test("the trial says running only while the agent really works, like the orb's green", () => {
  const active = trialCard(trial, other)!;
  assert.equal(trialTitle(active, "scanning"), "XENO Trial is running");
  assert.equal(trialTitle(active, "managing"), "XENO Trial is running");
  assert.equal(trialTitle(active, "waiting"), "XENO Trial");
  assert.equal(trialTitle(active, "paused"), "XENO Trial");
  assert.equal(trialTitle(active, "alert"), "XENO Trial");
  // the other states already say what's true, whatever the agent is doing
  const done = trialCard({ ...trial, used: 50, remaining: 0, status: "completed" }, other)!;
  assert.equal(trialTitle(done, "paused"), "Your XENO trial is complete");
});

test("trialCard: a small deposit needs topping up to 50", () => {
  const v = trialCard({ ...trial, status: "converted", confirmedDeposits: "10.00000000" }, { code: "continue_with_real_funds", reason: "real_funding_required" });
  // after a deposit the bar is the deposit total against 50, not the trades
  assert.deepEqual(v, {
    status: "converted",
    title: "Almost ready for real trading",
    counter: { value: "10 / 50", label: "USDT deposited" },
    pct: 20,
    note: "XENO waits until your deposits reach 50 USDT.",
    cta: { button: "Deposit 40 USDT", amount: "40" },
  });
});

test("a new withdrawal asks for activation until real deposits reach the minimum, whatever else the account holds", () => {
  const fresh = { ...protection, confirmedDeposits: "0.00000000", depositRemaining: "50.00000000", lockedProfit: "0.00000000" };
  // the amounts are the server's
  assert.deepEqual(withdrawActivation({ trialProfitProtection: fresh }), { amount: "50", step: "To activate, you need to deposit at least 50 USDT." });
  assert.equal(withdrawActivation({ trialProfitProtection: { ...fresh, minimumDeposit: "75.00000000", depositRemaining: "75.00000000" } })?.amount, "75");
  // part of the way there says what's left
  assert.deepEqual(withdrawActivation({ trialProfitProtection: protection }), { amount: "30", step: "To activate, you need to deposit at least 30 USDT more." });
  // reached, the rule is off, or the server doesn't say: the normal form
  assert.equal(withdrawActivation({ trialProfitProtection: { ...fresh, fundingConditionMet: true } }), null);
  assert.equal(withdrawActivation({ trialProfitProtection: { ...fresh, enabled: false } }), null);
  assert.equal(withdrawActivation({ trialProfitProtection: null }), null);
  assert.equal(withdrawActivation({}), null);
});

test("Statement's figure: trial profit while it's held back, then the balance, never the value with the grant in it", () => {
  const balances = { nonTrialEquity: "12.50000000" };
  // the same number as Home and Wallet; zero is a real zero while the trial runs
  assert.deepEqual(statementFigure({ balances, trialProfitProtection: protection }), { label: "Trial profit", value: "12.00000000", profit: true });
  assert.deepEqual(statementFigure({ balances, trialProfitProtection: { ...protection, lockedProfit: "0.00000000" } }), { label: "Trial profit", value: "0.00000000", profit: true });
  // activated: the server reports 0 here though profit was made, so a 0 would be false
  const balance = { label: "Account balance", value: "12.50000000", profit: false };
  assert.deepEqual(statementFigure({ balances, trialProfitProtection: { ...protection, fundingConditionMet: true, lockedProfit: "0.00000000" } }), balance);
  assert.deepEqual(statementFigure({ balances, trialProfitProtection: { ...protection, enabled: false } }), balance);
  assert.deepEqual(statementFigure({ balances, trialProfitProtection: null }), balance);
  // unknown stays unknown, never 0
  assert.equal(statementFigure({ balances: { nonTrialEquity: null } }).value, null);
});

test("trial profit in Wallet: names what's still to deposit, added to nothing", () => {
  const lock = trialProfitLock({ enabled: true, fundingConditionMet: false, lockedProfit: "2.10000000", depositRemaining: "50.00000000", minimumDeposit: "50.00000000" });
  assert.equal(trialProfitFundingText(lock), "Continue with real funds: deposit 50 USDT to meet the withdrawal requirement.");
  const part = trialProfitLock({ enabled: true, fundingConditionMet: false, lockedProfit: "2.10000000", depositRemaining: "30.00000000", minimumDeposit: "50.00000000" });
  assert.equal(trialProfitFundingText(part), "Continue with real funds: deposit 30 USDT more to meet the withdrawal requirement.");
  assert.equal(trialProfitFundingText(null), null);
});

test("trial guide: the server's numbers, none made up without them, and always clear it isn't money", () => {
  const g = trialGuide({ trial, trialProfitProtection: { ...protection, minimumDeposit: "75.00000000" } });
  assert.equal(g.headline, "50 free trades, not free money");
  assert.equal(g.steps[0].title, "XENO makes up to 50 trades");
  assert.match(g.steps[0].text, /Up to 10 new trades an hour, 3 open at once/);
  assert.match(g.steps[2].text, /deposits reach 50 USDT/);
  assert.match(g.faqs.map((f) => f.a).join(" "), /real deposits reach 75 USDT/);
  assert.equal(trialGuide({ trial: { ...trial, limit: 20 } }).headline, "20 free trades, not free money");

  const none = trialGuide(null);
  assert.equal(none.headline, "Free trades, not free money");
  assert.doesNotMatch(JSON.stringify(none).replaceAll("0.00", ""), /\d/);
  for (const v of [g, none]) assert.match(v.faqs[0].a, /isn't your money and can't be withdrawn/);

  // the rule is off: no condition is promised
  const off = trialGuide({ trial, trialProfitProtection: { ...protection, enabled: false } });
  assert.doesNotMatch(off.faqs.map((f) => f.a).join(" "), /real deposits reach/);
});

test("trial pauses: draining vs done, from trial.status", () => {
  const p = { ...base, status: "paused", pauseReason: "trial_limit" };
  const t = (status: string) => ({ status, confirmedDeposits: "0.00000000", minimumRealDeposit: "50.00000000" });
  assert.equal(traderState({ ...p, trial: t("draining") }).title, "Finishing your trial trades");
  assert.equal(traderState({ ...p, trial: t("draining") }).mode, "waiting");
  assert.equal(traderState({ ...p, trial: t("draining"), quota: { ...base.quota, openPositions: 2 } }).mode, "managing");
  const done = traderState({ ...p, trial: t("completed") });
  assert.equal(done.key, "trial_done");
  assert.equal(done.title, "XENO Paused");
  assert.equal(done.mode, "paused");
  // no trial info: open trades mean it's still finishing them
  assert.equal(traderState({ ...p, quota: { ...base.quota, openPositions: 1 } }).key, "trial_draining");
  assert.equal(traderState(p).key, "trial_done");
  assert.equal(traderState({ ...p, migrationState: "draining" }).key, "migrating");
  const rf = traderState({ ...base, status: "paused", pauseReason: "real_funding_required", trial: { status: "converted", confirmedDeposits: "10.00000000", minimumRealDeposit: "50.00000000" } });
  assert.equal(rf.key, "real_funding");
  assert.equal(rf.title, "XENO Paused");
  assert.equal(rf.body, "Add 40 USDT to start real trading");
  assert.equal(rf.cta, undefined);
  assert.equal(traderState({ ...base, status: "paused", pauseReason: "real_funding_required" }).body, "Add funds to start real trading");
  assert.equal(tradingSource({ ...base, status: "paused", pauseReason: "real_funding_required", balances: { sourceMode: "mixed" } }), "XENO Paused");
});

test("support link: https only, server first, never a dead link", () => {
  assert.equal(supportHref("https://t.me/tradexai_support", ""), "https://t.me/tradexai_support");
  assert.equal(supportHref("https://t.me/tradexai_support", "https://t.me/help"), "https://t.me/tradexai_support");
  assert.equal(supportHref(null, "https://t.me/help"), "https://t.me/help");
  assert.equal(supportHref("#", "https://t.me/help"), "https://t.me/help");
  assert.equal(supportHref("#", ""), null);
  assert.equal(supportHref("javascript:alert(1)", ""), null);
  assert.equal(supportHref("http://example.com", ""), null);
  assert.equal(supportHref(null, ""), null);
  assert.equal(supportHref(undefined, "not a url"), null);
});

test("real funding note only while the deposit falls short of 50 in total", () => {
  assert.equal(realFundingNote("25", trial), "A credited deposit ends your trial. XENO trades again once your deposits total 50 USDT.");
  assert.equal(realFundingNote("49.99", { ...trial, status: "completed" }), "A credited deposit ends your trial. XENO trades again once your deposits total 50 USDT.");
  assert.equal(realFundingNote("50", trial), null);
  assert.equal(realFundingNote("", trial), null);
  assert.equal(realFundingNote("abc", trial), null);
  const small = { ...trial, status: "converted", confirmedDeposits: "10.00000000" };
  assert.equal(realFundingNote("20", small), "XENO trades again once your deposits total 50 USDT: 40 USDT to go.");
  assert.equal(realFundingNote("40", small), null);
  assert.equal(realFundingNote("5", { ...trial, realFundingReady: true }), null);
  assert.equal(realFundingNote("5", null), null);
});

test("processing withdrawals read as in progress; hidden states stay out", () => {
  const now = Date.parse("2026-10-25T10:12:00.000Z");
  const p = { id: "w1", type: "withdrawal_processing", status: "broadcast", processing: true, name: "Ali***", amount: "84.00000000", asset: "USDT", symbol: null, occurredAt: "2026-10-25T10:00:00.000Z" };
  assert.deepEqual(tickerLine(p, now), { kind: "withdrawal", name: "Ali***", out: true, pending: true, verb: "is withdrawing", value: "84.00 USDT", coin: null, when: "12m ago" });
  // never "just withdrew" while it's still on its way
  assert.equal(tickerLine({ ...p, occurredAt: "2026-10-25T10:11:30.000Z" }, now)?.verb, "is withdrawing");
  for (const status of ["queued", "signed"]) assert.equal(tickerLine({ ...p, status }, now)?.pending, true, status);
  for (const status of ["awaiting_otp", "expired", "cancelled", "failed", "review", undefined]) assert.equal(tickerLine({ ...p, status }, now), null, String(status));
  // the live bar's 24-hour limit applies here too
  assert.equal(tickerLine({ ...p, occurredAt: "2026-10-23T10:00:00.000Z" }, now), null);
  const c = { ...p, type: "withdrawal", status: "confirmed", processing: false };
  assert.equal(tickerLine(c, now)?.verb, "withdrew");
  assert.equal(tickerLine({ ...c, status: "failed" }, now), null);
  assert.equal(withdrawalState({ type: "withdrawal", status: "confirmed" }), "confirmed");
  // older responses carry no status on a confirmed withdrawal
  assert.equal(withdrawalState({ type: "withdrawal" }), "confirmed");
  assert.equal(withdrawalState({ type: "withdrawal_processing", status: "queued" }), "processing");
  assert.equal(withdrawalState({ type: "trade_profit" }), null);
});

test("one line per withdrawal id, the confirmed one wins", () => {
  const p = { id: "w1", type: "withdrawal_processing" };
  const c = { id: "w1", type: "withdrawal" };
  const t = { id: "w1", type: "trade_profit" };
  const o = { id: "w2", type: "withdrawal_processing" };
  assert.deepEqual(dedupeFeed([p, o, c, t]), [c, o, t]);
  assert.deepEqual(dedupeFeed([c, p]), [c]);
  assert.equal(feedKey(p), feedKey(c));
  assert.notEqual(feedKey(t), feedKey(c));
  // the server's eventKey wins when it's there
  assert.equal(feedKey({ id: "d1", type: "deposit", eventKey: "deposit:d1" }), "deposit:d1");
  const ep = { id: "x", type: "withdrawal_processing", eventKey: "withdrawal:w9" };
  const ec = { id: "y", type: "withdrawal", eventKey: "withdrawal:w9" };
  assert.deepEqual(dedupeFeed([ep, ec]), [ec]);
});

test("feedRows: a tab keeps its own type, and a fresh first page merges on top by eventKey", () => {
  const at = "2026-10-31T09:00:00.000Z";
  const item = (id: string, type: string, extra: object = {}) => ({ id, eventKey: `${type.startsWith("withdrawal") ? "withdrawal" : type}:${id}`, type, name: "Ali***", amount: "50.00000000", asset: "USDT", symbol: null, occurredAt: at, ...extra });
  const trade = item("t1", "trade_profit", { roiPercent: "2.4", symbol: "ETHUSDT" });
  const dep = item("d1", "deposit");
  const rev = item("f1", "feedback", { amount: null, asset: null, text: "Good", rating: 2 });
  const wp = item("w1", "withdrawal_processing", { status: "broadcast" });
  const wc = item("w1", "withdrawal", { status: "confirmed" });
  const ids = (rows: { type: string; id: string }[]) => rows.map((r) => `${r.type}:${r.id}`);

  // Live (no type): everything this build can draw
  assert.deepEqual(ids(feedRows(undefined, undefined, [{ items: [trade, dep, rev, wp] }])), ["trade_profit:t1", "deposit:d1", "feedback:f1", "withdrawal_processing:w1"]);
  // a filtered tab never shows another type, even if a server ignored the filter
  assert.deepEqual(ids(feedRows("deposit", undefined, [{ items: [trade, dep, rev] }])), ["deposit:d1"]);
  assert.deepEqual(ids(feedRows("feedback", undefined, [{ items: [trade, dep, rev] }])), ["feedback:f1"]);
  // withdrawal covers processing and confirmed; a hidden status stays out
  const other = item("w2", "withdrawal_processing", { status: "awaiting_otp" });
  const done = item("w3", "withdrawal", { status: "confirmed" });
  assert.deepEqual(ids(feedRows("withdrawal", undefined, [{ items: [wp, other, done, dep] }])), ["withdrawal_processing:w1", "withdrawal:w3"]);
  // what a row needs: a deposit's or withdrawal's amount, a review's rating; unknown types are left out
  assert.deepEqual(feedRows(undefined, undefined, [{ items: [{ ...dep, amount: null }, { ...rev, rating: undefined }, { ...wp, amount: null }, item("x1", "airdrop")] }]), []);

  // the fresh first page goes on top, overlaps once, across pages too
  const dep2 = item("d2", "deposit");
  const dep3 = item("d3", "deposit");
  assert.deepEqual(ids(feedRows("deposit", [dep3, dep2], [{ items: [dep2, dep] }, { items: [dep, item("d0", "deposit")] }])), ["deposit:d3", "deposit:d2", "deposit:d1", "deposit:d0"]);
  // a withdrawal that confirmed since: one row, confirmed, whichever list holds which version
  assert.deepEqual(ids(feedRows("withdrawal", [wc], [{ items: [wp, done] }])), ["withdrawal:w1", "withdrawal:w3"]);
  assert.deepEqual(ids(feedRows("withdrawal", [wp], [{ items: [wc, done] }])), ["withdrawal:w1", "withdrawal:w3"]);
  assert.deepEqual(feedRows("deposit", undefined, undefined), []);
});

test("trialCard: an odd credit just under 50 never reads as reached", () => {
  // USDT credits are what actually arrived, truncated to 8 decimals
  const v = trialCard({ ...trial, status: "converted", confirmedDeposits: "49.99638471" }, { code: "continue_with_real_funds", reason: "real_funding_required" })!;
  assert.equal(v.counter.value, "49.99 / 50");
  assert.equal(v.pct, 99);
  assert.equal(v.cta?.button, "Deposit 0.01 USDT");
  assert.equal(v.cta?.amount, "0.01");
  const ten = trialCard({ ...trial, status: "converted", confirmedDeposits: "9.99637000" }, { code: "continue_with_real_funds", reason: "real_funding_required" })!;
  assert.equal(ten.counter.value, "9.99 / 50");
  assert.equal(ten.cta?.button, "Deposit 40.01 USDT");
});

test("persian: the trial guide never reads as money received, and withdrawal errors name the grant", () => {
  setLang("fa");
  try {
    assert.doesNotMatch(trialGuide(undefined).headline, /[A-Za-z]{3}/);
    assert.match(trialGuide(undefined).headline, /تریدهای رایگان/);
    assert.match(withdrawalErrorText("Insufficient free withdrawable balance; trial principal is not withdrawable"), /گرنت تریال/);
    assert.equal(withdrawalErrorText("Some new server error"), "Some new server error");
  } finally {
    setLang("en");
  }
});
