import type { ExecutionOrder, ExecutionPage, LeverageSelected, LeverageSelection, Position } from "./api/types";
import { t, type Key } from "./i18n/index.ts";

// Reads how a trade's leverage was chosen. Display only: every figure is the server's, fixed at entry.

/** A decision that chose a leverage. */
export type SelectedDecision = LeverageSelection & { selected: LeverageSelected };

/**
 * The trade's own stored leverage; never derived from size / margin. The column defaults to 1, so an old spot trade reads 1
 * with no margin: that isn't a leverage. A real 1× trade has a margin.
 */
export function positionLeverage(p: Pick<Position, "leverage" | "margin_amount">): number | null {
  const lev = Number(p.leverage);
  if (!Number.isFinite(lev) || lev < 1) return null;
  return lev > 1 || p.margin_amount ? lev : null;
}

export const entryOrderOf = (items: ExecutionOrder[]) => items.find((o) => o.intent === "entry") ?? null;

/** null for exits, old entries, an older server, an unknown contract version, or nothing chosen. */
export function readDecision(order: ExecutionOrder | null | undefined): SelectedDecision | null {
  const d = order?.leverageSelection;
  if (order?.intent !== "entry" || !d || d.version !== 1 || !d.selected) return null;
  return d as SelectedDecision;
}

/** The entry order, walking later pages only if the first doesn't hold it. A failed page rejects. */
export async function findEntryOrder(first: ExecutionPage, fetchPage: (page: number) => Promise<ExecutionPage>): Promise<ExecutionOrder | null> {
  const found = entryOrderOf(first.items);
  if (found) return found;
  const last = first.limit > 0 ? Math.ceil(first.total / first.limit) : first.page;
  for (let page = first.page + 1; page <= last; page++) {
    const next = await fetchPage(page);
    const entry = entryOrderOf(next.items);
    if (entry) return entry;
    if (!next.items.length) break;
  }
  return null;
}

// candidate outcomes, a different vocabulary from entry rejection codes (order_precision_or_minimum, liquidation_buffer)
const OUTCOME: Record<string, Key> = {
  order_precision_or_limits: "Order size or precision limit",
  price_levels_or_liquidation: "Price level or liquidation distance limit",
  market_depth: "Not enough market depth",
  insufficient_cash: "Not enough free cash",
  position_risk: "Over the per-trade risk limit",
  portfolio_risk: "Over the total risk limit",
  net_rr: "Net R/R or net reward too low",
  eligible_equivalent_exposure: "No larger position after rounding",
};

const MAX_RANGES = 3;

/** Why higher leverages weren't chosen, one line per reason; the contract allows up to 200 ranges, so each line stays short. */
export function higherLeverageReasons(d: LeverageSelection): { ranges: string; more: number; reason: string }[] {
  const groups = new Map<Key, string[]>();
  for (const r of d.higherLeverages ?? []) {
    const key = OUTCOME[r.outcome] ?? "Didn't pass the entry checks";
    groups.set(key, [...(groups.get(key) ?? []), r.from === r.to ? `${r.from}×` : `${r.from}–${r.to}×`]);
  }
  return [...groups].map(([key, ranges]) => ({
    ranges: ranges.slice(0, MAX_RANGES).join(", "),
    more: Math.max(0, ranges.length - MAX_RANGES),
    reason: t(key),
  }));
}

/** Nothing higher existed: the chosen leverage is already the top of this trade's range, so empty reasons aren't missing data. */
export const atLeverageCap = (d: SelectedDecision) => !d.higherLeverages?.length && d.selected.leverage >= d.candidateRange.max;
