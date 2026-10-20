// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { leverageText, maxOpenOf, readPolicy, rrText, stopLossText, targetRROf, timeLimitText } from "./agent-info.ts";

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
