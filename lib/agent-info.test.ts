// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { setLang } from "./i18n/index.ts";
import { feeExempt, feeText, leverageText, maxOpenOf, readPolicy, rrText, stopLossText, targetRROf, timeLimitText } from "./agent-info.ts";

test("policy is read from the API; nulls keep their meaning", () => {
  const p = readPolicy({ leverage: null, maxLeverage: 200, maxOpenPositions: 3, entryBudgetBps: 500, universeSize: 50, stopLossBps: null, maxHoldingMs: null, minimumRR: "1.2", riskPerTradeBps: 50, maxPortfolioRiskBps: 200, dailyLossBps: 300 });
  assert.equal(leverageText(p), "Up to 200×");
  assert.equal(stopLossText(p), "Dynamic");
  assert.equal(timeLimitText(p), "None");
  assert.equal(p.minimumRR, "1.2");
  assert.equal(p.budgetBps, 500);
  assert.equal(leverageText(readPolicy({ leverage: 3 })), "3×");
  assert.equal(stopLossText(readPolicy({ stopLossBps: 40 })), "−0.4%");
  // an older API without a policy still gets today's shared limits
  const old = readPolicy(null);
  assert.deepEqual([old.maxOpen, old.budgetBps, old.universe, old.riskPerTradeBps], [3, 500, 50, null]);
  assert.equal(leverageText(old), "Auto");
  assert.equal(rrText("2.0000"), "2:1");
  assert.equal(rrText(1.5), "1.5:1");
});

test("instance limits come from its own config", () => {
  assert.equal(maxOpenOf({ trade_rules: { maxOpenPositions: 4 }, config: null }), 4);
  assert.equal(maxOpenOf({ trade_rules: null, config: null }), 3);
  assert.equal(targetRROf({ config: { rr: "2" } }), 2);
  assert.equal(targetRROf({ config: null }), null);
});

test("the fee says what it's a share of, and a Trial account pays none", () => {
  // policy v2: a share of the executed position size (margin × leverage)
  assert.equal(feeText({ feeBpsPerSide: 8, feeBasis: "executed_notional", feePolicy: { version: 2, basis: "executed_notional", rateBps: 8, trialExempt: false } }), "0.08% of position size, each side");
  const trial = { feeBpsPerSide: 0, feeBasis: "executed_notional", feePolicy: { version: 2, basis: "executed_notional", rateBps: 0, trialExempt: true } };
  assert.equal(feeExempt(trial), true);
  assert.equal(feeText(trial), "None on Trial trades");
  // before the policy: a share of the margin
  assert.equal(feeText({ feeBpsPerSide: 30 }), "0.3% of margin, each side");
  assert.equal(feeExempt({ feeBpsPerSide: 30 }), false);
});

test("persian: the fee reads in Persian with the English trade terms", () => {
  setLang("fa");
  try {
    assert.match(feeText({ feeBpsPerSide: 10, feeBasis: "initial_margin" }), /مارجین/);
    assert.match(feeText({ feeBpsPerSide: 10, feeBasis: "executed_notional" }), /پوزیشن/);
  } finally {
    setLang("en");
  }
});

test("the risk limits come from the policy the API sends", () => {
  const p = readPolicy({ leverageMode: "maximum_feasible_exposure", maxLeverage: 200, entryBudgetBps: 500, riskPerTradeBps: 50, maxPortfolioRiskBps: 200, minimumRR: "1.2", dailyLossBps: 1000 });
  assert.deepEqual([p.riskPerTradeBps, p.maxPortfolioRiskBps, p.minimumRR, p.dailyLossBps], [50, 200, "1.2", 1000]);
  assert.equal(leverageText(p), "Up to 200×");
});
