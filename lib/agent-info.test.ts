// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { diffFrom, leverageText, maxOpenOf, readPolicy, rrText, stopLossText, strengths, targetRROf, timeLimitText } from "./agent-info.ts";

const base = { min_capital: "100", daily_limit: 5, fee_bps: 10, rr: 2, target_winrate_min: 50, target_winrate_max: 60 };

test("diff lists only what changed, with direction", () => {
  assert.deepEqual(diffFrom(base, base), []);
  const d = diffFrom(base, { ...base, rr: "3", min_capital: "500.00" });
  assert.deepEqual(
    d.map((x) => [x.up, x.short]),
    [
      [true, "higher R/R target"],
      [true, "higher start"],
    ],
  );
  assert.equal(d[0].long, "higher R/R target: 3:1 vs 2:1");
  assert.equal(d[1].long, "higher start: 500 USDT vs 100 USDT");
  assert.equal(diffFrom(base, { ...base, fee_bps: 5 })[0].short, "lower fee");
  // same 2:1 target written two ways is no difference
  assert.deepEqual(diffFrom({ ...base, rr: "2.0000" }, { ...base, rr: 2 }), []);
});

test("policy is read from the API; nulls keep their meaning", () => {
  const p = readPolicy({ leverage: null, maxLeverage: 200, maxOpenPositions: 5, entryBudgetBps: 500, universeSize: 50, stopLossBps: null, maxHoldingMs: null, minimumRR: "1.2", riskPerTradeBps: 50, maxPortfolioRiskBps: 200, dailyLossBps: 300 });
  assert.equal(leverageText(p), "Up to 200×");
  assert.equal(stopLossText(p), "Dynamic");
  assert.equal(timeLimitText(p), "None");
  assert.equal(p.minimumRR, "1.2");
  assert.equal(p.budgetBps, 500);
  assert.equal(leverageText(readPolicy({ leverage: 3 })), "3×");
  assert.equal(stopLossText(readPolicy({ stopLossBps: 40 })), "−0.4%");
  // an older API without a policy still gets today's shared limits
  const old = readPolicy(null);
  assert.deepEqual([old.maxOpen, old.budgetBps, old.universe, old.riskPerTradeBps], [5, 500, 50, null]);
  assert.equal(leverageText(old), "Auto");
  assert.equal(rrText("2.0000"), "2:1");
  assert.equal(rrText(1.5), "1.5:1");
});

test("instance limits come from its own config", () => {
  assert.equal(maxOpenOf({ trade_rules: { maxOpenPositions: 4 }, config: null }), 4);
  assert.equal(maxOpenOf({ trade_rules: null, config: null }), 5);
  assert.equal(targetRROf({ config: { rr: "2" } }), 2);
  assert.equal(targetRROf({ config: null }), null);
});

test("strengths name what sets an agent apart", () => {
  const evo = { ...base, min_capital: "50", daily_limit: 10, fee_bps: 70 };
  const lumo = { ...base, min_capital: "500", daily_limit: 20, fee_bps: 50 };
  const xeno = { ...base, min_capital: "1000", daily_limit: 40, fee_bps: 30 };
  const all = [evo, lumo, xeno];
  assert.equal(strengths(evo, all), "Lowest minimum");
  assert.equal(strengths(lumo, all), "Balanced");
  assert.equal(strengths(xeno, all), "Most trades, lowest fee");
  assert.equal(strengths(evo, [evo, { ...evo }]), "Balanced");
});
