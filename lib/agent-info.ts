import type { AgentInstance, AgentModel, TradePolicy } from "./api/types";
import { pick } from "./format.ts";

// Plain-language summaries of an agent, built only from the numbers the API returns:
// we don't know each model's strategy, so we never invent one.

type Nums = Pick<AgentModel, "min_capital" | "daily_limit" | "fee_bps" | "rr" | "target_winrate_min" | "target_winrate_max">;

const n = (v: number | string) => Number(v);
const usdt = (v: number | string) => `${n(v).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT`;
export const pct = (bps: number) => `${bps / 100}%`;
/** "2.0000" → "2:1". Display only. */
export const rrText = (v: number | string) => `${+n(v).toFixed(2)}:1`;

/** The shared trade policy, read from the API. null keeps its meaning (auto leverage, dynamic SL, no time exit). */
export type Policy = {
  /** Fixed leverage; null = the agent picks the lowest workable one per trade, up to maxLeverage. */
  leverage: number | null;
  maxLeverage: number | null;
  maxOpen: number;
  /** Margin per entry, bps of the agent's current value; fees on top. */
  budgetBps: number;
  universe: number;
  stopLossBps: number | null;
  maxHoldingMs: number | null;
  minimumRR: string | null;
  riskPerTradeBps: number | null;
  maxPortfolioRiskBps: number | null;
  dailyLossBps: number | null;
};

/** Current values (frontend guide, 2026-10-17); used only for fields an older API doesn't send. */
const FALLBACK = { maxOpen: 5, budgetBps: 500, universe: 50 };

const num = (v: unknown): number | null => {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};

export function readPolicy(p: TradePolicy | null | undefined): Policy {
  return {
    leverage: num(p?.leverage),
    maxLeverage: num(p?.maxLeverage),
    maxOpen: num(p?.maxOpenPositions) ?? FALLBACK.maxOpen,
    budgetBps: num(p?.entryBudgetBps) ?? FALLBACK.budgetBps,
    universe: num(p?.universeSize) ?? FALLBACK.universe,
    stopLossBps: num(p?.stopLossBps),
    maxHoldingMs: num(p?.maxHoldingMs),
    minimumRR: p?.minimumRR != null ? String(p.minimumRR) : null,
    riskPerTradeBps: num(p?.riskPerTradeBps),
    maxPortfolioRiskBps: num(p?.maxPortfolioRiskBps),
    dailyLossBps: num(p?.dailyLossBps),
  };
}

/** "Up to 200×" for auto leverage; the real leverage of a trade is on the position. */
export const leverageText = (p: Policy) => (p.leverage != null ? `${p.leverage}×` : p.maxLeverage != null ? `Up to ${p.maxLeverage}×` : "Auto");
export const stopLossText = (p: Policy) => (p.stopLossBps != null ? `−${pct(p.stopLossBps)}` : "Dynamic");
export const timeLimitText = (p: Policy) => (p.maxHoldingMs != null ? `${Math.round(p.maxHoldingMs / 60_000)} min` : "None");

/** How many trades this agent may hold at once (different coins each). */
export const maxOpenOf = (inst: Pick<AgentInstance, "trade_rules" | "config">) =>
  num(pick(inst.trade_rules, ["maxOpenPositions", "max_open_positions"]) ?? pick(inst.config, ["maxOpenPositions", "max_open_positions"])) ?? FALLBACK.maxOpen;

/** Price target of this agent's next entries (config.rr); open trades keep the target they opened with. */
export const targetRROf = (inst: Pick<AgentInstance, "config">) => num(pick(inst.config, ["rr"]));

export type Diff = { up: boolean; short: string; long: string };

/** How `m` differs from `prev`, in a few words each. Empty when they match. */
export function diffFrom(prev: Nums, m: Nums): Diff[] {
  const out: Diff[] = [];
  const add = (a: number, b: number, more: string, less: string, from: string, to: string) => {
    if (a === b) return;
    const up = b > a;
    out.push({ up, short: up ? more : less, long: `${up ? more : less}: ${to} vs ${from}` });
  };
  add(n(prev.rr), n(m.rr), "higher R/R target", "lower R/R target", rrText(prev.rr), rrText(m.rr));
  add(n(prev.target_winrate_min), n(m.target_winrate_min), "higher target win rate", "lower target win rate", `${prev.target_winrate_min}–${prev.target_winrate_max}%`, `${m.target_winrate_min}–${m.target_winrate_max}%`);
  add(prev.daily_limit, m.daily_limit, "more trades", "fewer trades", `${prev.daily_limit}/day`, `${m.daily_limit}/day`);
  add(n(prev.min_capital), n(m.min_capital), "higher start", "lower start", usdt(prev.min_capital), usdt(m.min_capital));
  add(prev.fee_bps, m.fee_bps, "higher fee", "lower fee", pct(prev.fee_bps), pct(m.fee_bps));
  return out;
}

/** What sets `m` apart from the other agents, in a few words (e.g. "Lowest minimum"). */
export function strengths(m: Nums, all: Nums[]): string {
  const out: string[] = [];
  const best = (f: (x: Nums) => number, dir: 1 | -1, word: string) => {
    const vals = all.map(f);
    const top = dir === 1 ? Math.max(...vals) : Math.min(...vals);
    // a tie across every agent sets nobody apart
    if (vals.some((v) => v !== top) && f(m) === top) out.push(word);
  };
  best((x) => n(x.min_capital), -1, "lowest minimum");
  best((x) => x.daily_limit, 1, "most trades");
  best((x) => x.fee_bps, -1, "lowest fee");
  const s = out.length ? out.join(", ") : all.length > 1 ? "balanced" : "automated trading";
  return s[0].toUpperCase() + s.slice(1);
}
