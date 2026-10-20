// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Position } from "./api/types";
import { divInt, fmtDuration, maxDrawdown, priceRR, tradeStats } from "./trade-stats.ts";

const t = (net: string, i: number, symbol = "BTCUSDT", agent = "Evo"): Position =>
  ({
    net_pnl: net,
    entry_fee: "0.1",
    exit_fee: "0.1",
    entry_notional: "100",
    symbol,
    agent_name: agent,
    opened_at: new Date(Date.UTC(2026, 0, i, 0)).toISOString(),
    closed_at: new Date(Date.UTC(2026, 0, i, 2)).toISOString(),
  }) as Position;

test("trade stats: totals, averages, streaks, buckets", () => {
  const s = tradeStats([t("4", 1), t("2", 2), t("-3", 3, "ETHUSDT"), t("0", 4), t("6", 5, "ETHUSDT", "Lumo")]);
  assert.equal(s.count, 5);
  assert.deepEqual([s.wins, s.losses, s.even], [3, 1, 1]);
  assert.equal(s.net, "9.00000000");
  assert.equal(s.grossProfit, "12.00000000");
  assert.equal(s.grossLoss, "3.00000000");
  assert.equal(s.profitFactor, 4);
  assert.equal(s.avgWin, "4.00000000");
  assert.equal(s.avgLoss, "3.00000000");
  assert.equal(s.best?.net_pnl, "6");
  assert.equal(s.worst?.net_pnl, "-3");
  assert.equal(s.winStreak, 2);
  assert.equal(s.lossStreak, 1);
  assert.equal(s.fees, "1.00000000");
  assert.equal(s.volume, "500.00000000");
  assert.equal(s.avgHoldMs, 2 * 3_600_000);
  assert.deepEqual(
    s.bySymbol.map((b) => [b.key, b.count, b.wins, b.net]),
    [
      ["BTCUSDT", 3, 2, "6.00000000"],
      ["ETHUSDT", 2, 1, "3.00000000"],
    ],
  );
});

test("no losses: no profit factor, no worst trade", () => {
  const s = tradeStats([t("1", 1)]);
  assert.equal(s.profitFactor, null);
  assert.equal(s.worst, null);
  assert.equal(tradeStats([]).avgWin, null);
});

test("helpers", () => {
  assert.equal(divInt("10", 3), "3.33333333");
  assert.equal(maxDrawdown([100, 120, 90, 130]), 0.25);
  assert.equal(maxDrawdown([100]), null);
  assert.equal(fmtDuration(45 * 60_000), "45m");
  assert.equal(fmtDuration(135 * 60_000), "2h 15m");
  assert.equal(fmtDuration(26 * 3_600_000), "1d 2h");
});

test("price R/R comes from the trade's own prices", () => {
  const p = (side: "long" | "short", entry: string, tp: string | null, sl: string | null) => ({ side, entry_price: entry, take_profit: tp, stop_loss: sl });
  assert.equal(priceRR(p("long", "100", "104", "98")), "2.00");
  assert.equal(priceRR(p("short", "100", "94", "102")), "3.00");
  // tick rounding: not exactly 2
  assert.equal(priceRR(p("long", "0.012345", "0.012591", "0.012222")), "2.00");
  assert.equal(priceRR(p("long", "64000.1", "64250.3", "63875.2")), "2.00");
  assert.equal(priceRR(p("long", "100", "103.9", "98")), "1.95");
  // missing price, stop on the wrong side or zero distance: unknown, not zero
  assert.equal(priceRR(p("long", "100", null, "98")), null);
  assert.equal(priceRR(p("long", "100", "104", "100")), null);
  assert.equal(priceRR(p("short", "100", "94", "98")), null);
  assert.equal(priceRR(p("long", "100", "96", "98")), null);
});
