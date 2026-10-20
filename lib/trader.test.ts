// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { onboardingStep, tickerLine, traderState, withdrawalBlock, withdrawalErrorText } from "./trader.ts";

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
});

test("server messages become plain words; unknown ones pass through", () => {
  assert.match(withdrawalErrorText("Insufficient free withdrawable balance; trial principal is not withdrawable"), /Trial fund/);
  assert.match(withdrawalErrorText("Fresh prices unavailable; withdrawal was not reserved"), /nothing was reserved/);
  assert.equal(withdrawalErrorText("Invalid address"), "Invalid address");
});

test("live bar lines say 'just' only when recent, and drop stale items", () => {
  const now = Date.parse("2026-10-20T10:10:00.000Z");
  const w = { type: "withdrawal", name: "Sar***", amount: "99.50000000", asset: "USDT", symbol: null, occurredAt: "2026-10-20T10:09:30.000Z" };
  assert.deepEqual(tickerLine(w, now), { name: "Sar***", out: true, verb: "just withdrew", amount: "99.50 USDT", coin: null, when: null });
  const p = { type: "trade_profit", name: "Par***", amount: "2.34000000", asset: "USDT", symbol: "ETHUSDT", occurredAt: "2026-10-20T10:05:00.000Z" };
  assert.deepEqual(tickerLine(p, now), { name: "Par***", out: false, verb: "earned", amount: "+2.34 USDT", coin: "ETH", when: "5m ago" });
  assert.equal(tickerLine({ ...p, occurredAt: "2026-10-20T07:00:00.000Z" }, now)?.when, "3h ago");
  assert.equal(tickerLine({ ...p, occurredAt: "2026-10-18T09:00:00.000Z" }, now), null);
  assert.equal(tickerLine({ ...w, type: "something_else" }, now), null);
  assert.equal(tickerLine({ ...w, occurredAt: "not a date" }, now), null);
});

test("onboarding labels", () => {
  assert.equal(onboardingStep("fund_account").title, "Make a deposit");
  assert.equal(onboardingStep("something_new").title, "something new");
});
