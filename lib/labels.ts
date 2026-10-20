import { ApiError } from "./api/session";
import type { EntryRejection } from "./api/types";
import { API_BASE } from "./env";
import { fmt } from "./money";

export type Tone = "ok" | "pending" | "bad" | "idle" | "info";
type Label = { label: string; tone: Tone; hint?: string };
const raw = (s: string): Label => ({ label: s.replace(/_/g, " "), tone: "idle" });

const INSTANCE: Record<string, Label> = {
  awaiting_engine: { label: "Not started", tone: "info" },
  active: { label: "Active", tone: "ok" },
  paused: { label: "Paused", tone: "pending", hint: "No new trades. Open trades still close." },
  stopping: { label: "Stopping", tone: "pending", hint: "Closing trades. Funds return to your balance." },
  stopped: { label: "Stopped", tone: "idle" },
  expired: { label: "Expired", tone: "idle" },
};

const EXECUTION: Record<string, string> = {
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

const DEPOSIT: Record<string, Label> = {
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

const WITHDRAWAL: Record<string, Label> = {
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

const JOURNAL: Record<string, string> = {
  deposit: "Deposit",
  trial_grant: "Trial fund",
  allocation: "Allocated to agent",
  capital_release: "Returned from agent",
  trade_reserve: "Trade margin",
  trade_release: "Margin released",
  trade_entry: "Trade opened",
  trade_exit: "Trade closed",
  trade_fee: "Fee",
  funding: "Funding",
  subscription_purchase: "Plan purchase",
  withdrawal_reserve: "Held for withdrawal",
  withdrawal_release: "Withdrawal reversed",
  withdrawal_reverted: "Withdrawal reversed",
  withdrawal: "Withdrawal",
};

const CLOSE_REASON: Record<string, string> = {
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
const ENTRY_REJECTION: Record<string, string> = {
  net_rr: "Net reward to risk too low after costs",
  gross_rr: "Price target below the minimum R/R",
  position_risk: "Risk above the per-trade limit",
  portfolio_risk: "Total risk capacity is full",
  market_depth: "Not enough market depth for the size",
  market_data: "No fresh, valid market data",
  order_precision_or_minimum: "Size doesn't fit the market's minimum or step",
  liquidation_buffer: "Too little room before liquidation",
  insufficient_cash: "Not enough cash for margin and both fees",
};

export const instanceStatus = (s: string) => INSTANCE[s] ?? raw(s);
export const executionState = (s: string) => EXECUTION[s] ?? s.replace(/_/g, " ");
export const depositStatus = (s: string) => DEPOSIT[s] ?? raw(s);
export const withdrawalStatus = (s: string) => WITHDRAWAL[s] ?? raw(s);
export const journalKind = (k: string) => JOURNAL[k] ?? k.replace(/_/g, " ");
export const closeReason = (r: string | null) => (r ? CLOSE_REASON[r] ?? r.replace(/_/g, " ") : "—");
// unknown and legacy codes (risk_or_rr) get the general line
export const entryRejectionText = (code: string) => ENTRY_REJECTION[code] ?? "Didn't pass the entry checks";

/** The numbers behind a rejection, as short parts ("SOLUSDT", "net R/R 1.08, needs 1.2"). Every key is optional. */
export function entryRejectionFacts(r: EntryRejection): string[] {
  const d = r.details ?? {};
  const rr = (v: unknown) => (v == null ? null : fmt(String(v), 2));
  const best = rr(d.bestNetRRWithinRisk);
  const min = rr(d.minimumNetRR);
  const out = [typeof d.symbol === "string" ? d.symbol : null];
  if (best && min) out.push(`net R/R ${best}, needs ${min}`);
  else if (best) out.push(`best net R/R ${best}`);
  else if (min) out.push(`needs net R/R ${min}`);
  if (r.code === "gross_rr" && d.grossTargetRR != null) out.push(`target R/R ${rr(d.grossTargetRR)}`);
  if (typeof d.bestLeverageWithinRisk === "number") out.push(`at ${d.bestLeverageWithinRisk}×`);
  return out.filter((x): x is string => !!x);
}

/** Toast-ready text for any thrown error. */
export function describeError(e: unknown): { title: string; detail?: string } {
  if (!(e instanceof ApiError))
    return { title: "That didn't work", detail: e instanceof Error && e.message ? e.message : "Please try again." };
  switch (true) {
    case e.status === 0:
      // fetch can't tell offline, server down and CORS-blocked apart
      return {
        title: "Can't reach TradeXai",
        detail:
          process.env.NODE_ENV === "development"
            ? `No response from ${API_BASE}. Is the backend running, reachable from this device, and allowing this origin in CORS?`
            : "Check your connection.",
      };
    case e.status === 400:
      return { title: "Check the details", detail: e.message };
    case e.status === 401:
      return { title: "Session expired", detail: "Reopen the app from Telegram." };
    case e.status === 403:
      return { title: "Not allowed", detail: e.message };
    case e.status === 404:
      return { title: "Not found", detail: "It may have been removed." };
    case e.status === 409:
      return { title: "Already in progress", detail: e.message };
    case e.status === 429:
      return { title: "Too many requests", detail: `Wait ${e.retryAfter ?? 60}s and try again.` };
    default:
      return { title: "Server unavailable", detail: e.requestId ? `Reference ${e.requestId}` : "Try again in a moment." };
  }
}

export function accountLabel(id: string, names: Record<string, string>): string {
  const [owner, ref, kind] = id.split(":");
  if (owner === "user") return kind === "available" ? "Available balance" : `Balance (${kind?.replace(/_/g, " ")})`;
  if (owner === "agent") return `${names[ref] ?? "Agent"} (${kind ?? "account"})`;
  return id;
}
