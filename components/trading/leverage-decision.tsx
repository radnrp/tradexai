"use client";
import { useQuery } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import type { ExecutionPage, Position } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { t as tr } from "@/lib/i18n";
import { atLeverageCap, entryOrderOf, findEntryOrder, higherLeverageReasons, positionLeverage, readDecision } from "@/lib/leverage";
import { fmt } from "@/lib/money";
import { Row } from "@/components/ui/primitives";

/**
 * Why this trade took its leverage, as decided at entry. Old trades have no decision and show nothing.
 * The figures are entry-time estimates; the trade's real result stays on the card. riskBudget.equity is left out on purpose:
 * it includes the Trial grant, which never reads as a balance.
 */
export function LeverageDecision({ p, first }: { p: Position; first: ExecutionPage }) {
  const onFirst = entryOrderOf(first.items);
  // the decision never changes once made, so a later page is looked up once and not refetched
  const later = useQuery({
    queryKey: ["executions", p.id, "entry"],
    queryFn: () => findEntryOrder(first, (page) => API.executions(p.id, page)),
    enabled: !onFirst && first.total > first.items.length,
    staleTime: Infinity,
  });
  const d = readDecision(onFirst ?? later.data);
  if (!d) return null;

  const lev = positionLeverage(p);
  const reasons = higherLeverageReasons(d);
  return (
    <section className="mb-4">
      <h3 className="text-label text-muted-foreground">{tr("Why this leverage?")}</h3>
      <p className="mt-1 text-body-sm">{tr("XENO adjusts position size and leverage within its risk limits.")}</p>
      <div className="mt-1 divide-y divide-border">
        {lev != null && <Row label={tr("Leverage")}>{`${lev}×`}</Row>}
        <Row label={tr("Position size · Margin")}>{`${fmt(d.selected.notional)} · ${fmt(d.selected.margin)} USDT`}</Row>
        <Row label={tr("Estimated risk at entry")}>
          {`${fmt(d.selected.estimatedRisk)} USDT`}
          <span className="block text-caption text-muted-foreground">{tr("{pct} of account", { pct: `${fmt(d.selected.estimatedRiskPercent)}%` })}</span>
        </Row>
        <Row label={tr("Estimated net reward at TP")}>{`${fmt(d.selected.estimatedNetReward)} USDT`}</Row>
      </div>
      {reasons.length > 0 ? (
        <div className="mt-3">
          <div className="text-label text-muted-foreground">{tr("Why not higher")}</div>
          <ul className="mt-1 space-y-1.5">
            {reasons.map((r) => (
              <li key={r.reason} className="flex items-baseline justify-between gap-4 text-body-sm">
                <span>{r.reason}</span>
                <span dir="ltr" className="shrink-0 text-end tabular-nums text-muted-foreground">
                  {r.ranges}
                  {r.more > 0 && <span dir="auto"> {tr("+{n} more", { n: r.more })}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-caption text-muted-foreground">{tr("Each leverage is listed under the first check it failed.")}</p>
        </div>
      ) : (
        atLeverageCap(d) && <p className="mt-2 text-body-sm">{tr("{n}× is the highest leverage available for this trade.", { n: d.selected.leverage })}</p>
      )}
      <p className="mt-2 text-caption text-muted-foreground">
        {tr("Estimates from {time}, when this trade was sized. They aren't your actual PnL, a promised profit or a maximum loss, and funding can differ.", { time: fmtDateTime(d.evaluatedAt) })}
      </p>
    </section>
  );
}
