import type { Position } from "./api/types";
import { t } from "./i18n/index.ts";
import { fmt, sign } from "./money.ts";

// Personal P&L (contract 2026-10-26): a trade loss the Trial grant principal really covered is left out of the user's own P&L.
// The server sends both figures; nothing here computes a cover, it only decides which of them to show and how.

/** The trade's own result before any Trial grant cover; win/loss stats use it. Older responses only have net_pnl, actual then. */
export const actualNet = (p: Pick<Position, "net_pnl" | "account_net_pnl">) => (p.account_net_pnl === undefined ? p.net_pnl : p.account_net_pnl);

/** A cover worth mentioning: positive, otherwise null (missing, zero or unknown). */
export const coverOf = (v: string | null | undefined): string | null => (v != null && sign(v) > 0 ? v : null);

/**
 * settled / funding_pending: closed. estimate: open with a price. cover_pending: open, the trade's estimate is known but its
 * Trial grant cover isn't yet. no_price: open without a price. Only settled is final.
 */
export type PnlState = "settled" | "funding_pending" | "estimate" | "cover_pending" | "no_price";

/** value is personal and null while pending (never zero); actual is the trade's own result. */
export type PositionPnl = { value: string | null; actual: string | null; cover: string | null; state: PnlState };

type P = Pick<Position, "status" | "net_pnl" | "funding_state" | "unrealizedNetEstimate"> &
  Partial<Pick<Position, "account_net_pnl" | "trial_loss_covered" | "pnl_status" | "accountUnrealizedNetEstimate" | "trialLossCoveredEstimate" | "pnlStatus">>;

export function positionPnl(p: P): PositionPnl {
  if (p.status === "open") {
    const value = p.unrealizedNetEstimate;
    const actual = p.accountUnrealizedNetEstimate === undefined ? value : p.accountUnrealizedNetEstimate;
    return { value, actual, cover: coverOf(p.trialLossCoveredEstimate), state: value != null ? "estimate" : actual != null ? "cover_pending" : "no_price" };
  }
  // a closed trade's cover is confirmed only once its funding settles
  const pending = p.pnl_status === "pending_funding" || p.funding_state === "pending";
  return { value: p.net_pnl, actual: actualNet(p), cover: coverOf(p.trial_loss_covered), state: pending ? "funding_pending" : "settled" };
}

/** The line under a trade's PnL while a Trial grant cover is involved: "Trade −2.00 · Trial grant covered 2.00". */
export function pnlNote(v: PositionPnl): string | null {
  const trade = fmt(v.actual, 2, { sign: true });
  if (v.state === "cover_pending") return t("Trade {v} · Trial grant cover being checked", { v: trade });
  if (!v.cover) return null;
  return t(v.state === "estimate" ? "Trade {v} · Trial grant covers ~{c}" : "Trade {v} · Trial grant covered {c}", { v: trade, c: fmt(v.cover) });
}
