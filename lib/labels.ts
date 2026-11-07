import { ApiError } from "./api/session";
import type { EntryRejection } from "./api/types";
import { API_BASE } from "./env";
import { t, type Key } from "./i18n/index.ts";
import { serverText } from "./i18n/server-text.ts";
import { fmt, sign } from "./money";

export type Tone = "ok" | "pending" | "bad" | "idle" | "info";
type Label = { label: string; tone: Tone; hint?: string };
const raw = (s: string): Label => ({ label: s.replace(/_/g, " "), tone: "idle" });
// the tables hold keys: at import the language isn't known yet
type LabelKey = { label: Key; tone: Tone; hint?: Key };
const shown = (l: LabelKey): Label => ({ label: t(l.label), tone: l.tone, ...(l.hint ? { hint: t(l.hint) } : {}) });

const INSTANCE: Record<string, LabelKey> = {
  awaiting_engine: { label: "Not started", tone: "info" },
  active: { label: "Active", tone: "ok" },
  paused: { label: "Paused", tone: "pending", hint: "No new trades. Open trades still close." },
  stopping: { label: "Stopping", tone: "pending", hint: "Closing trades. Funds return to your balance." },
  stopped: { label: "Stopped", tone: "idle" },
  expired: { label: "Expired", tone: "idle" },
};

const EXECUTION: Record<string, Key> = {
  scheduled: "Scheduled",
  waiting_for_signal: "Scanning markets",
  position_open: "In a trade",
  funding_pending: "Settling funding",
  reconciling: "Reconciling",
  paused: "Paused",
  entries_disabled: "New trades paused",
  awaiting_activation: "Awaiting activation",
  engine_unavailable: "Engine unavailable",
  insufficient_capital: "Not enough free cash",
  daily_limit: "Daily limit reached",
  risk_limit: "Entry held back by risk rules",
  engine_error: "Engine error",
  stopping: "Closing trades",
  expiring: "Plan ending, closing trades",
  stopped: "Stopped",
  expired: "Expired",
};

const DEPOSIT: Record<string, LabelKey> = {
  creating: { label: "Preparing", tone: "pending" },
  waiting: { label: "Waiting for payment", tone: "pending" },
  confirming: { label: "Payment received", tone: "pending", hint: "Usually a few minutes." },
  confirmed: { label: "Almost there", tone: "pending", hint: "Arriving shortly." },
  sending: { label: "Almost there", tone: "pending", hint: "Arriving shortly." },
  partially_paid: { label: "Paid too little", tone: "bad", hint: "Underpaid, not credited. Contact support." },
  credited: { label: "Added", tone: "ok" },
  creation_unknown: { label: "Checking", tone: "pending", hint: "Don't start a new deposit yet." },
  rejected: { label: "Not accepted", tone: "bad", hint: "Try another token or amount." },
  review: { label: "Under review", tone: "info" },
  failed: { label: "Failed", tone: "bad" },
  expired: { label: "Expired", tone: "bad", hint: "Don't send to this address." },
  cancelled: { label: "Cancelled", tone: "idle", hint: "Don't send to this address." },
  refunded: { label: "Refunded", tone: "idle" },
};
// stops fast polling only; a late payment can still move expired/cancelled on, and a reopen refetches it
export const DEPOSIT_FINAL = new Set(["credited", "rejected", "failed", "expired", "cancelled", "refunded"]);

const WITHDRAWAL: Record<string, LabelKey> = {
  awaiting_otp: { label: "Waiting for code", tone: "pending" },
  queued: { label: "In line", tone: "pending", hint: "Approved. Sending soon." },
  signed: { label: "Sending", tone: "pending" },
  broadcast: { label: "On its way", tone: "pending", hint: "Usually arrives in a few minutes." },
  confirmed: { label: "Completed", tone: "ok" },
  expired: { label: "Expired", tone: "idle", hint: "Code expired. Funds returned to your account." },
  cancelled: { label: "Cancelled", tone: "idle", hint: "Too many wrong codes. Funds returned to your account." },
  failed: { label: "Failed", tone: "bad" },
  review: { label: "Under review", tone: "info" },
};
export const WITHDRAWAL_FINAL = new Set(["confirmed", "expired", "cancelled", "failed"]);
export const INSTANCE_FINAL = new Set(["stopped", "expired"]);

const JOURNAL: Record<string, Key> = {
  deposit: "Deposit",
  trial_grant: "Trial grant",
  allocation: "Allocated to agent",
  capital_release: "Returned from agent",
  trade_reserve: "Trade margin",
  trade_release: "Margin released",
  trade_entry: "Trade opened",
  trade_exit: "Trade closed",
  trade_fee: "Fee",
  referral_bounty: "Referral reward",
  funding: "Funding",
  subscription_purchase: "Plan purchase",
  withdrawal_reserve: "Held for withdrawal",
  withdrawal_release: "Withdrawal reversed",
  withdrawal_reverted: "Withdrawal reversed",
  withdrawal: "Withdrawal",
};

const CLOSE_REASON: Record<string, Key> = {
  stop_loss: "Stop loss",
  take_profit: "Take profit",
  // older trades only: the time exit is gone, trades now close on TP/SL, liquidation or protection
  time_exit: "Time exit",
  user_stop: "Agent stopped",
  stop: "Agent stopped",
  stopping: "Agent stopped",
  drawdown: "Risk stop (−80%)",
  liquidation: "Liquidated",
  expiry: "Agent expired",
  expired: "Agent expired",
};

// why the last entry check didn't open a trade; never a reason to recreate the agent or enter by hand
const ENTRY_REJECTION: Record<string, Key> = {
  // a neutral state, not a fault: never suggest more leverage or a way around the limits
  net_rr: "XENO is waiting for a setup within its risk limits",
  gross_rr: "Price target below the minimum R/R",
  position_risk: "XENO is waiting for a setup within its risk limits",
  portfolio_risk: "Total risk capacity is full",
  market_depth: "Not enough market depth for the size",
  market_data: "No fresh, valid market data",
  order_precision_or_minimum: "Size doesn't fit the market's minimum or step",
  liquidation_buffer: "Too little room before liquidation",
  insufficient_cash: "Not enough cash for margin and both fees",
};

export const instanceStatus = (s: string) => (INSTANCE[s] ? shown(INSTANCE[s]) : raw(s));
export const executionState = (s: string) => (EXECUTION[s] ? t(EXECUTION[s]) : s.replace(/_/g, " "));
export const depositStatus = (s: string) => (DEPOSIT[s] ? shown(DEPOSIT[s]) : raw(s));
export const withdrawalStatus = (s: string) => (WITHDRAWAL[s] ? shown(WITHDRAWAL[s]) : raw(s));
/** A fee journal that pays this account is its share of an invited friend's fee, not a fee it paid. */
export const journalKind = (k: string, net?: string) =>
  k === "trade_fee" && sign(net) > 0 ? t("Referral commission") : JOURNAL[k] ? t(JOURNAL[k]) : k.replace(/_/g, " ");
export const closeReason = (r: string | null) => (r ? (CLOSE_REASON[r] ? t(CLOSE_REASON[r]) : r.replace(/_/g, " ")) : "—");
// unknown and legacy codes (risk_or_rr) get the general line
export const entryRejectionText = (code: string) => t(ENTRY_REJECTION[code] ?? "Didn't pass the entry checks");

/** The numbers behind a rejection, as short parts ("SOLUSDT", "net R/R 1.08, needs 1.2"). Every key is optional. */
export function entryRejectionFacts(r: EntryRejection): string[] {
  const d = r.details ?? {};
  const rr = (v: unknown) => (v == null ? null : fmt(String(v), 2));
  const best = rr(d.bestNetRRWithinRisk);
  const min = rr(d.minimumNetRR);
  const out = [typeof d.symbol === "string" ? d.symbol : null];
  if (best && min) out.push(t("net R/R {best}, needs {min}", { best, min }));
  else if (best) out.push(t("best net R/R {best}", { best }));
  else if (min) out.push(t("needs net R/R {min}", { min }));
  if (r.code === "gross_rr" && d.grossTargetRR != null) out.push(t("target R/R {rr}", { rr: rr(d.grossTargetRR) ?? "" }));
  if (typeof d.bestLeverageWithinRisk === "number") out.push(t("at {n}×", { n: d.bestLeverageWithinRisk }));
  return out.filter((x): x is string => !!x);
}

/** Toast-ready text for any thrown error. */
export function describeError(e: unknown): { title: string; detail?: string } {
  if (!(e instanceof ApiError))
    return { title: t("That didn't work"), detail: e instanceof Error && e.message ? e.message : t("Please try again.") };
  switch (true) {
    case e.status === 0:
      // fetch can't tell offline, server down and CORS-blocked apart
      return {
        title: t("Can't reach TradeXai"),
        detail:
          process.env.NODE_ENV === "development"
            ? `No response from ${API_BASE}. Is the backend running, reachable from this device, and allowing this origin in CORS?`
            : t("Check your connection."),
      };
    case e.status === 400:
      return { title: t("Check the details"), detail: serverText(e.message) };
    case e.status === 401:
      return { title: t("Session expired"), detail: t("Reopen the app from Telegram.") };
    case e.status === 403:
      return { title: t("Not allowed"), detail: serverText(e.message) };
    case e.status === 404:
      return { title: t("Not found"), detail: t("It may have been removed.") };
    case e.status === 409:
      return { title: t("Already in progress"), detail: serverText(e.message) };
    case e.status === 429:
      return { title: t("Too many requests"), detail: t("Wait {s}s and try again.", { s: e.retryAfter ?? 60 }) };
    default:
      return { title: t("Server unavailable"), detail: e.requestId ? t("Reference {id}", { id: e.requestId }) : t("Try again in a moment.") };
  }
}

export function accountLabel(id: string, names: Record<string, string>): string {
  const [owner, ref, kind] = id.split(":");
  if (owner === "user") return kind === "available" ? t("Available balance") : t("Balance ({kind})", { kind: kind?.replace(/_/g, " ") ?? "" });
  if (owner === "agent") return t("{name} ({kind})", { name: names[ref] ?? t("Agent"), kind: kind ?? t("account") });
  return id;
}
