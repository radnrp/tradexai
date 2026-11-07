import type { AgentInstance, Trader, TradePolicy } from "./api/types";
import { pick } from "./format.ts";
import { t as tr } from "./i18n/index.ts";

// Plain-language summaries of the trading rules, built only from the numbers the API returns:
// we don't know the model's strategy, so we never invent one.

const n = (v: number | string) => Number(v);
export const pct = (bps: number) => `${bps / 100}%`;
/** "2.0000" → "2:1". Display only. */
export const rrText = (v: number | string) => `${+n(v).toFixed(2)}:1`;

/** The shared trade policy, read from the API. null keeps its meaning (auto leverage, dynamic SL, no time exit). */
export type Policy = {
  /** Fixed leverage; null = chosen per entry up to maxLeverage. Which one is on the position, never derived from this. */
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

/** Current values (single XENO contract, 2026-10-20); used only for fields an older API doesn't send. */
const FALLBACK = { maxOpen: 3, budgetBps: 500, universe: 50 };

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

type Fee = Pick<Trader, "feeBpsPerSide" | "feeBasis" | "feePolicy">;

/** New entries of this account pay nothing (a Trial under policy v2); funding still applies. */
export const feeExempt = (t: Fee) => !!t.feePolicy?.trialExempt && (t.feePolicy.rateBps ?? t.feeBpsPerSide) === 0;

/**
 * The fee on new entries, as GET /trader states it for this account. Open trades keep the fee they opened with, and a trade's
 * real fees are on the position, never recomputed from this.
 */
export function feeText(t: Fee): string {
  if (feeExempt(t)) return tr("None on Trial trades");
  const bps = t.feePolicy?.rateBps ?? t.feeBpsPerSide;
  const basis = t.feePolicy?.basis ?? t.feeBasis;
  return tr(basis === "executed_notional" ? "{pct} of position size, each side" : "{pct} of margin, each side", { pct: pct(bps) });
}

/** "Up to 200×" for auto leverage; the real leverage of a trade is on the position. */
export const leverageText = (p: Policy) => (p.leverage != null ? `${p.leverage}×` : p.maxLeverage != null ? tr("Up to {n}×", { n: p.maxLeverage }) : tr("Auto"));
export const stopLossText = (p: Policy) => (p.stopLossBps != null ? `−${pct(p.stopLossBps)}` : tr("Dynamic"));
export const timeLimitText = (p: Policy) => (p.maxHoldingMs != null ? tr("{n} min", { n: Math.round(p.maxHoldingMs / 60_000) }) : tr("None"));

/** How many trades this agent may hold at once, long and short together (different coins each). */
export const maxOpenOf = (inst: Pick<AgentInstance, "trade_rules" | "config">) =>
  num(pick(inst.trade_rules, ["maxOpenPositions", "max_open_positions"]) ?? pick(inst.config, ["maxOpenPositions", "max_open_positions"])) ?? FALLBACK.maxOpen;

/** Price target of this agent's next entries (config.rr); open trades keep the target they opened with. */
export const targetRROf = (inst: Pick<AgentInstance, "config">) => num(pick(inst.config, ["rr"]));
