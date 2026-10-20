import type { Position } from "./api/types";
import { add, cmp, div, fromUnits, isDecimal, sub, toUnits } from "./money.ts";

// Exchange-style performance numbers built from closed trades. Money sums stay exact decimals;
// only ratios (profit factor, drawdown) are plain numbers, and they're display-only.

type Bucket = { key: string; count: number; wins: number; net: string };

export type TradeStats = {
  count: number;
  wins: number;
  losses: number;
  even: number;
  net: string;
  grossProfit: string;
  grossLoss: string;
  profitFactor: number | null;
  avgWin: string | null;
  avgLoss: string | null;
  best: Position | null;
  worst: Position | null;
  avgHoldMs: number | null;
  fees: string;
  volume: string;
  winStreak: number;
  lossStreak: number;
  bySymbol: Bucket[];
  byAgent: Bucket[];
};

/** Exact decimal ÷ whole number, rounded toward zero at 8 decimals. */
export const divInt = (v: string, n: number) => fromUnits(toUnits(v) / BigInt(n));

export function tradeStats(trades: Position[]): TradeStats {
  const closed = trades.filter((p) => p.net_pnl != null).sort((a, b) => time(a) - time(b));
  let net = "0", grossProfit = "0", grossLoss = "0", fees = "0", volume = "0";
  let wins = 0, losses = 0, even = 0, holdSum = 0, holdN = 0;
  let winStreak = 0, lossStreak = 0, runW = 0, runL = 0;
  let best: Position | null = null, worst: Position | null = null;
  const sym = new Map<string, Bucket>(), agent = new Map<string, Bucket>();

  for (const p of closed) {
    const v = p.net_pnl!;
    const s = cmp(v, "0");
    net = add(net, v);
    fees = add(fees, add(p.entry_fee ?? "0", p.exit_fee ?? "0"));
    volume = add(volume, p.entry_notional ?? "0");
    if (s > 0) {
      wins++;
      grossProfit = add(grossProfit, v);
    } else if (s < 0) {
      losses++;
      grossLoss = sub(grossLoss, v);
    } else even++;
    runW = s > 0 ? runW + 1 : 0;
    runL = s < 0 ? runL + 1 : 0;
    winStreak = Math.max(winStreak, runW);
    lossStreak = Math.max(lossStreak, runL);
    if (!best || cmp(v, best.net_pnl!) > 0) best = p;
    if (!worst || cmp(v, worst.net_pnl!) < 0) worst = p;
    if (p.closed_at) {
      holdSum += new Date(p.closed_at).getTime() - new Date(p.opened_at).getTime();
      holdN++;
    }
    bump(sym, p.symbol, v, s > 0);
    bump(agent, p.agent_name, v, s > 0);
  }

  const gl = Number(grossLoss);
  return {
    count: closed.length,
    wins,
    losses,
    even,
    net,
    grossProfit,
    grossLoss,
    profitFactor: gl > 0 ? Number(grossProfit) / gl : null,
    avgWin: wins ? divInt(grossProfit, wins) : null,
    avgLoss: losses ? divInt(grossLoss, losses) : null,
    best: best && cmp(best.net_pnl!, "0") > 0 ? best : null,
    worst: worst && cmp(worst.net_pnl!, "0") < 0 ? worst : null,
    avgHoldMs: holdN ? holdSum / holdN : null,
    fees,
    volume,
    winStreak,
    lossStreak,
    bySymbol: [...sym.values()].sort((a, b) => cmp(b.net, a.net)),
    byAgent: [...agent.values()].sort((a, b) => cmp(b.net, a.net)),
  };
}

const time = (p: Position) => new Date(p.closed_at ?? p.opened_at).getTime();

function bump(m: Map<string, Bucket>, key: string, v: string, win: boolean) {
  const b = m.get(key) ?? { key, count: 0, wins: 0, net: "0" };
  m.set(key, { key, count: b.count + 1, wins: b.wins + Number(win), net: add(b.net, v) });
}

/** Biggest fall from a peak, as a fraction (0.12 = −12%). Null with fewer than two points. */
export function maxDrawdown(values: number[]): number | null {
  if (values.length < 2) return null;
  let peak = values[0], worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) worst = Math.max(worst, (peak - v) / peak);
  }
  return worst;
}

export function fmtDuration(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${Math.max(1, m)}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/**
 * Price reward : risk of one trade from its own entry, TP and SL, never from today's catalog.
 * Long (TP − entry) / (entry − SL), short (entry − TP) / (SL − entry). Tick rounding means it's rarely exactly the target,
 * and it ignores fees and funding. Null (show "unknown") when a price is missing or a level sits on the wrong side.
 */
export function priceRR(p: Pick<Position, "side" | "entry_price" | "take_profit" | "stop_loss">): string | null {
  const prices = [p.entry_price, p.take_profit, p.stop_loss];
  if (!prices.every((v) => v != null && isDecimal(v))) return null;
  const [entry, tp, sl] = prices.map((v) => toUnits(v!, 18));
  const long = p.side === "long";
  if (!long && p.side !== "short") return null;
  const reward = long ? tp - entry : entry - tp;
  const risk = long ? entry - sl : sl - entry;
  if (risk <= BigInt(0) || reward < BigInt(0)) return null;
  return div(fromUnits(reward, 18), fromUnits(risk, 18), 2);
}
