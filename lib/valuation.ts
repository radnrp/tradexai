import type { Statement } from "@/lib/api/types";

export const PRICES_UNAVAILABLE_NOTE = "Fresh prices for some trades are unavailable, so the profit and loss estimate is incomplete.";
export const FUNDING_PENDING_NOTE = "Funding settlement is being checked, so the final amount is not certain yet.";

/** Why a statement's valuation is not complete. Both reasons can apply at once. */
export function valuationNotes(s: Pick<Statement, "valuation" | "fundingPendingPositions">): { prices: boolean; funding: boolean; messages: string[] } {
  const v = s.valuation;
  if (v.status === "complete") return { prices: false, funding: false, messages: [] };
  const prices = v.reasons?.includes("market_prices_unavailable") || v.missingSymbols.length > 0 || v.status === "unavailable";
  const funding = v.reasons?.includes("funding_pending") || (v.fundingPendingPositions ?? s.fundingPendingPositions ?? 0) > 0;
  const messages = [prices && PRICES_UNAVAILABLE_NOTE, funding && FUNDING_PENDING_NOTE].filter((m): m is string => !!m);
  // partial with no stated cause: say only that the figures are not final
  if (!messages.length) messages.push("Valuation is incomplete; figures are not final.");
  return { prices: !!prices, funding: !!funding, messages };
}
