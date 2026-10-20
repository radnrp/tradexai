import type { CommunityItem, OnboardingStepKey, Trader, WithdrawalBlockedReason } from "./api/types";
import type { Tone } from "./labels";
import { fmt } from "./money.ts";

// What the permanent agent (the XENO model; shown to users as "Agent") is doing, decided only from GET /trader.
// "active" is not a promise of profit, an open trade or an entry right now.

/** How the Home status orb moves: sweeping while it looks for entries, pulsing while trades are open, still otherwise. */
export type OrbMode = "scanning" | "managing" | "waiting" | "paused" | "alert";

export type TraderState = {
  key: string;
  tone: Tone;
  mode: OrbMode;
  title: string;
  body?: string;
  /** minimum_capital: the fix is a deposit, never a new agent. */
  cta?: "deposit";
  /** Quota used up: when the first entry slot frees up (not a promise of an entry then). */
  nextSlotAt?: string | null;
};

type S = Pick<Trader, "status" | "pauseReason" | "migrationState" | "minimumCapital" | "engine" | "valuation" | "quota">;

/** The single status line for the account, in the contract's priority order. */
export function traderState(t: S): TraderState {
  const reasons = t.valuation.reasons ?? [];
  const open = t.quota.openPositions;
  const max = t.quota.maxOpenPositions;

  if (t.migrationState !== "ready")
    return { key: "migrating", tone: "pending", mode: "waiting", title: "Settling your previous trades", body: "Withdrawals are off until it finishes." };
  if (t.pauseReason === "risk_drawdown") return { key: "risk", tone: "bad", mode: "alert", title: "Protective risk pause", body: "Under review. Open trades are still managed." };
  if (t.pauseReason === "minimum_capital")
    return { key: "minimum", tone: "pending", mode: "paused", title: `Needs at least ${fmt(t.minimumCapital, 0)} USDT to trade`, body: "Open trades are still managed.", cta: "deposit" };
  if (t.pauseReason) return { key: "paused", tone: "pending", mode: "paused", title: "New trades paused", body: t.pauseReason.replace(/_/g, " ") };
  if (!t.engine.entriesEnabled) return { key: "entries_off", tone: "pending", mode: "paused", title: "New trades are temporarily off" };
  if (reasons.includes("funding_pending"))
    return { key: "funding", tone: "pending", mode: open ? "managing" : "waiting", title: "Funding settlement in progress", body: "Results aren't final yet." };
  if (reasons.includes("market_prices_unavailable"))
    return { key: "prices", tone: "pending", mode: open ? "managing" : "waiting", title: "Some prices are unavailable", body: "Open P&L may be out of date." };
  if (open >= max) return { key: "max_open", tone: "ok", mode: "managing", title: `Managing ${open} open trades`, body: "The maximum; new entries wait." };
  if (t.quota.remainingEntries <= 0)
    return { key: "quota", tone: "pending", mode: open ? "managing" : "waiting", title: "Hourly entry limit reached", nextSlotAt: t.quota.nextEntrySlotAt };
  if (t.status === "active")
    return open
      ? { key: "managing", tone: "ok", mode: "managing", title: "Agent is managing your trades", body: `${open} of ${max} open` }
      : { key: "scanning", tone: "ok", mode: "scanning", title: "Agent is scanning the market" };
  if (t.status === "awaiting_engine") return { key: "starting", tone: "info", mode: "waiting", title: "Setting up your agent" };
  return { key: String(t.status), tone: "idle", mode: "paused", title: String(t.status).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) };
}

const BLOCKED: Record<string, string> = {
  migration_pending: "Withdrawals open once your previous trades finish settling.",
  funding_pending: "Funding is being settled. Withdrawals open again once it clears.",
  valuation_unavailable: "Fresh prices aren't available, so the withdrawable amount can't be confirmed yet.",
};

/** Why a withdrawal can't be asked for right now, or null. The server still checks again on POST. */
export function withdrawalBlock(t: Pick<Trader, "migrationState" | "withdrawalBlockedReason" | "withdrawalAvailable">): string | null {
  const reason: WithdrawalBlockedReason | null = t.migrationState !== "ready" ? "migration_pending" : t.withdrawalBlockedReason;
  if (reason) return BLOCKED[reason] ?? `Withdrawals are unavailable: ${reason.replace(/_/g, " ")}.`;
  return t.withdrawalAvailable ? null : "Withdrawals are unavailable right now.";
}

/** The server's withdrawal message, in plain words where we know it (no error codes exist for these yet). */
export function withdrawalErrorText(message: string): string {
  if (/trial principal/i.test(message)) return "Not enough withdrawable balance. The Trial fund itself can't be withdrawn.";
  if (/fresh prices unavailable/i.test(message)) return "Fresh prices aren't available, so nothing was reserved. Try again in a moment.";
  if (/funding/i.test(message)) return "Funding is being settled. Try again once it clears.";
  if (/migrat/i.test(message)) return "Your previous trades are still settling. Try again once that finishes.";
  return message;
}

const STEPS: Record<string, { title: string; body: string }> = {
  account_created: { title: "Account created", body: "" },
  tutorial_watched: { title: "Watch the tutorial", body: "1 minute" },
  fund_account: { title: "Make a deposit", body: "Trial fund doesn't count" },
  trader_ready: { title: "Agent ready", body: "" },
};
export const onboardingStep = (key: OnboardingStepKey) => STEPS[key] ?? { title: key.replace(/_/g, " "), body: "" };

/** Older than this, a feed item isn't news any more and stays out of the live bar. */
export const FEED_MAX_AGE_MS = 24 * 3_600_000;
/** Within this, the line may say "just". */
const JUST_MS = 2 * 60_000;

export type TickerLine = { name: string; out: boolean; verb: string; amount: string; coin: string | null; when: string | null };

/**
 * One line of the live bar for another user's settled profit or confirmed withdrawal: "Sar*** just withdrew 99.50 USDT",
 * "Par*** earned +2.34 USDT on ETH · 5m ago". "just" only when it really is recent; null when too old or unknown.
 * Names arrive masked from the server.
 */
export function tickerLine(i: Pick<CommunityItem, "type" | "name" | "amount" | "asset" | "symbol" | "occurredAt">, now: number): TickerLine | null {
  const ago = now - Date.parse(i.occurredAt);
  if (!(ago <= FEED_MAX_AGE_MS)) return null;
  const just = ago <= JUST_MS;
  const when = just ? null : ago < 3_600_000 ? `${Math.max(1, Math.floor(ago / 60_000))}m ago` : `${Math.floor(ago / 3_600_000)}h ago`;
  if (i.type === "withdrawal") return { name: i.name, out: true, verb: just ? "just withdrew" : "withdrew", amount: `${fmt(i.amount)} ${i.asset}`, coin: null, when };
  if (i.type === "trade_profit")
    return { name: i.name, out: false, verb: just ? "just earned" : "earned", amount: `+${fmt(i.amount)} ${i.asset}`, coin: i.symbol?.replace(/USDT$/, "") ?? null, when };
  return null;
}
