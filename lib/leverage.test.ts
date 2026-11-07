import assert from "node:assert/strict";
import { test } from "node:test";
import type { ExecutionOrder, ExecutionPage, LeverageSelection } from "./api/types";
import { atLeverageCap, entryOrderOf, findEntryOrder, higherLeverageReasons, positionLeverage, readDecision } from "./leverage.ts";

/** The synthetic decision published in the contract, section 9. */
const decision = (over: Partial<LeverageSelection> = {}): LeverageSelection => ({
  version: 1,
  policy: "maximum_feasible_exposure",
  objective: "maximum_feasible_notional",
  evaluatedAt: "2026-11-04T12:17:22.448Z",
  quoteAsOf: "2026-11-04T12:17:22.448Z",
  bookAsOf: "2026-11-04T12:17:22.448Z",
  candidateRange: { min: 1, max: 200 },
  evaluatedCandidates: 200,
  eligibleCandidates: 12,
  rejectedCandidates: { price_levels_or_liquidation: 124, position_risk: 64 },
  reason: "largest_admissible_notional",
  failureCode: null,
  selected: {
    leverage: 12,
    quantity: "0.6000000000000000",
    notional: "60.00000000",
    margin: "5.00000000",
    requiredCash: "5.09657600",
    estimatedGrossReward: "0.72000000",
    estimatedNetReward: "0.61622400",
    estimatedRisk: "0.46291200",
    estimatedRiskPercent: "0.46291200",
    estimatedNetRewardPercent: "0.61622400",
    estimatedLossCosts: "0.10291200",
    estimatedRewardCosts: "0.10377600",
    estimatedNetRR: "1.33119038",
  },
  riskBudget: {
    equity: "100.00000000",
    perTradeLimit: "0.50000000",
    portfolioLimit: "2.00000000",
    openRisk: "0.00000000",
    perTradeUsedPercent: "92.58240000",
    portfolioRiskAfterEntry: "0.46291200",
    portfolioUsedPercent: "23.14560000",
    remainingPortfolioRisk: "1.53708800",
  },
  higherLeverages: [
    { from: 13, to: 76, outcome: "position_risk" },
    { from: 77, to: 200, outcome: "price_levels_or_liquidation" },
  ],
  ...over,
});

const order = (intent: string, leverageSelection?: LeverageSelection | null): ExecutionOrder => ({ id: intent, intent, leverageSelection, events: [] });
const page = (items: ExecutionOrder[], p = 1, total = items.length, limit = 20): ExecutionPage => ({ positionId: "x", items, page: p, limit, total });

test("a trade's leverage is its own stored value", () => {
  assert.equal(positionLeverage({ leverage: 12, margin_amount: "5" }), 12);
  assert.equal(positionLeverage({ leverage: "12", margin_amount: "5" }), 12);
});

test("a new 1× trade shows 1×, an old spot trade (default 1, no margin) shows nothing", () => {
  assert.equal(positionLeverage({ leverage: 1, margin_amount: "5" }), 1);
  assert.equal(positionLeverage({ leverage: 1, margin_amount: null }), null);
  assert.equal(positionLeverage({ leverage: 1 }), null);
});

test("missing or broken leverage is never guessed", () => {
  assert.equal(positionLeverage({ leverage: null, margin_amount: "5" }), null);
  assert.equal(positionLeverage({ margin_amount: "5" }), null);
  assert.equal(positionLeverage({ leverage: "abc", margin_amount: "5" }), null);
  assert.equal(positionLeverage({ leverage: 0, margin_amount: "5" }), null);
});

test("only an entry with a chosen leverage in a known version has a decision", () => {
  assert.equal(readDecision(order("entry", decision()))?.selected.leverage, 12);
  assert.equal(readDecision(order("exit", decision())), null);
  assert.equal(readDecision(order("entry", null)), null);
  assert.equal(readDecision(order("entry")), null);
  assert.equal(readDecision(order("entry", decision({ version: 2 }))), null);
  assert.equal(readDecision(order("entry", decision({ selected: null }))), null);
  assert.equal(readDecision(null), null);
  assert.equal(readDecision(undefined), null);
});

test("the entry is found without fetching when it's on the first page", async () => {
  const first = page([order("exit"), order("entry", decision())], 1);
  assert.equal(entryOrderOf(first.items)?.intent, "entry");
  const found = await findEntryOrder(first, async () => assert.fail("no fetch needed"));
  assert.equal(found?.intent, "entry");
});

test("later pages are walked in order, stopping at the entry", async () => {
  const asked: number[] = [];
  const first = page([order("exit")], 1, 60);
  const found = await findEntryOrder(first, async (p) => {
    asked.push(p);
    return page(p === 2 ? [order("exit")] : [order("entry", decision())], p, 60);
  });
  assert.equal(found?.intent, "entry");
  assert.deepEqual(asked, [2, 3]);
});

test("no entry anywhere is null, and an empty page ends the walk", async () => {
  assert.equal(await findEntryOrder(page([order("exit")]), async () => assert.fail("one page only")), null);
  const asked: number[] = [];
  const none = await findEntryOrder(page([order("exit")], 1, 100), async (p) => {
    asked.push(p);
    return page([], p, 100);
  });
  assert.equal(none, null);
  assert.deepEqual(asked, [2]);
});

test("a failed page rejects, so the caller shows no section", async () => {
  await assert.rejects(findEntryOrder(page([order("exit")], 1, 60), async () => Promise.reject(new Error("down"))));
});

test("each higher range gets its real reason, not one fixed sentence", () => {
  assert.deepEqual(higherLeverageReasons(decision()), [
    { ranges: "13–76×", more: 0, reason: "Over the per-trade risk limit" },
    { ranges: "77–200×", more: 0, reason: "Price level or liquidation distance limit" },
  ]);
});

test("every published outcome has its own text", () => {
  const codes = ["order_precision_or_limits", "price_levels_or_liquidation", "market_depth", "insufficient_cash", "position_risk", "portfolio_risk", "net_rr", "eligible_equivalent_exposure"];
  const reasons = codes.map((outcome, i) => higherLeverageReasons(decision({ higherLeverages: [{ from: i + 2, to: i + 2, outcome }] }))[0].reason);
  assert.equal(new Set(reasons).size, codes.length);
  assert.ok(!reasons.includes("Didn't pass the entry checks"));
});

test("a single leverage reads as one value, and unknown codes share the general text", () => {
  assert.deepEqual(higherLeverageReasons(decision({ higherLeverages: [{ from: 13, to: 13, outcome: "from_the_future" }, { from: 14, to: 14, outcome: "also_new" }] })), [
    { ranges: "13×, 14×", more: 0, reason: "Didn't pass the entry checks" },
  ]);
});

test("200 alternating ranges stay a short list", () => {
  const higherLeverages = Array.from({ length: 200 }, (_, i) => ({ from: i + 1, to: i + 1, outcome: i % 2 ? "net_rr" : "position_risk" }));
  const out = higherLeverageReasons(decision({ higherLeverages }));
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { ranges: "1×, 3×, 5×", more: 97, reason: "Over the per-trade risk limit" });
});

test("nothing higher exists only when no ranges remain and the cap is reached", () => {
  const selected = decision().selected!;
  const capped = readDecision(order("entry", decision({ higherLeverages: [], candidateRange: { min: 1, max: 12 } })))!;
  assert.equal(atLeverageCap(capped), true);
  assert.deepEqual(higherLeverageReasons(capped), []);
  assert.equal(atLeverageCap(readDecision(order("entry", decision()))!), false);
  // an incomplete answer isn't dressed up as a cap
  assert.equal(atLeverageCap(readDecision(order("entry", decision({ higherLeverages: [], selected: { ...selected, leverage: 5 }, candidateRange: { min: 1, max: 12 } })))!), false);
});

test("a decision without the ranges field doesn't crash", () => {
  const partial = { ...decision() } as Partial<LeverageSelection>;
  delete partial.higherLeverages;
  assert.deepEqual(higherLeverageReasons(partial as LeverageSelection), []);
});
