"use client";
import { useMemo, useState } from "react";
import { Award01Icon, ChartDownIcon, ChartUpIcon, ThumbsDownIcon } from "@hugeicons/core-free-icons";
import type { Range, Statement } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { actualNet } from "@/lib/personal-pnl";
import { useTrader } from "@/lib/queries";
import { statementFigure } from "@/lib/trader";
import { tradeStats } from "@/lib/trade-stats";
import { valuationNotes } from "@/lib/valuation";
import { t, type Key } from "@/lib/i18n";
import { EquityChart } from "@/components/trading/equity-chart";
import { PnlAmount } from "@/components/trading/pnl";
import { Segmented } from "@/components/ui/controls";
import { Amount, Card, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { DailyPnlChart } from "./daily-chart";
import { dailyNet, equityValues, useClosedTrades } from "./data";
import { Tile } from "./tile";

const RANGE_LABEL: Record<Range, Key> = { "7d": "Last 7 days", "30d": "Last 30 days", "6m": "Last 6 months", all: "All time" };
type Chart = "value" | "daily";
const CHARTS: { value: Chart; label: Key }[] = [
  { value: "value", label: "Account value" },
  { value: "daily", label: "Daily profit" },
];

/**
 * Profit is personal: losses the Trial grant covered are left out. The account
 * value chart and the trade stats (win rate, averages, best/worst) stay actual.
 */
export function Overview({ s, range, agent }: { s: Statement; range: Range; agent?: string }) {
  const { q, trades, total, loadingMore } = useClosedTrades(range, agent);
  const trader = useTrader();
  const figure = trader.data ? statementFigure(trader.data) : null;
  const stats = useMemo(() => tradeStats(trades), [trades]);
  const days = useMemo(() => dailyNet(s.daily, trades), [s.daily, trades]);
  const eq = useMemo(() => equityValues(s.equityHistory), [s.equityHistory]);
  const [chart, setChart] = useState<Chart>("value");
  const r = s.realized;
  // return vs. the value at the start of the period; display only
  const roi = eq.length && eq[0] > 0 ? (Number(r.realized_net) / eq[0]) * 100 : null;
  const winrate = s.observedWinrate != null ? Number(s.observedWinrate) : stats.count ? (stats.wins / stats.count) * 100 : null;

  return (
    <>
      <Card hero className="mt-4 p-5">
        <div className="text-label text-white/70">{t("Profit · {range}", { range: t(RANGE_LABEL[range]) })}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Amount value={r.realized_net} signed colored className="text-display" />
          <span className="text-body-sm text-white/70">{s.asset}</span>
          {roi != null && (
            <span dir="ltr" className={`rounded-full px-2 py-0.5 text-label font-semibold tabular-nums ${roi >= 0 ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
              {roi >= 0 ? "+" : "−"}
              {Math.abs(roi).toFixed(2)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-caption text-white/60">{t("Trades closed in this period, after fees and funding")}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div>
            {figure && (
              <>
                <div className="text-caption text-white/60">{t(figure.label)}</div>
                <Amount value={figure.value} unit={s.asset} signed={figure.profit} colored={figure.profit} className="mt-0.5 block text-body font-semibold" />
              </>
            )}
          </div>
          <div>
            <div className="text-caption text-white/60">{t("Open trades now")}</div>
            <PnlAmount value={s.unrealizedNetEstimate} unit={s.asset} muted="text-white/60" className="mt-0.5 block text-body font-semibold" />
          </div>
        </div>
      </Card>
      {valuationNotes(s).messages.map((m) => (
        <p key={m} className="mt-2 px-1 text-label text-warning">
          {m}
        </p>
      ))}

      <Card className="mt-3 p-4">
        <Segmented layoutId="overview-chart" value={chart} onChange={setChart} options={CHARTS.map((c) => ({ ...c, label: t(c.label) }))} />
        <div className="mt-4">
          {chart === "value" ? (
            s.history.coverage === "no_data" ? (
              <p className="py-8 text-center text-body-sm text-muted-foreground">{t("No data for this period yet.")}</p>
            ) : (
              // the actual account, so a loss the Trial grant covered still shows here; never derive Profit from it
              <EquityChart rows={s.equityHistory} unit={s.asset} />
            )
          ) : q.isPending && !s.daily.length ? (
            <Skeleton className="h-40 rounded-md" />
          ) : (
            <DailyPnlChart days={days} />
          )}
        </div>
      </Card>

      <SectionTitle>{t("Your trades")}</SectionTitle>
      {q.isPending ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-label text-muted-foreground">{t("Win rate")}</div>
                <div className="text-h2 tabular-nums">{winrate == null ? "—" : `${winrate.toFixed(1)}%`}</div>
              </div>
              <div className="text-end text-label text-muted-foreground tabular-nums">
                {t(r.closed_trades === 1 ? "{n} closed trade" : "{n} closed trades", { n: r.closed_trades })}
              </div>
            </div>
            {r.closed_trades > 0 && <WinBar wins={r.wins} losses={r.losses} even={r.breakeven} />}
          </Card>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Tile icon={ChartUpIcon} tint="green" label={t("Average win")}>
              {stats.avgWin ? <Amount value={stats.avgWin} unit={s.asset} signed colored /> : "—"}
            </Tile>
            <Tile icon={ChartDownIcon} tint="red" label={t("Average loss")}>
              {stats.avgLoss ? <span dir="ltr" className="text-destructive">−<Amount value={stats.avgLoss} unit={s.asset} /></span> : "—"}
            </Tile>
            <Tile icon={Award01Icon} tint="amber" label={t("Best trade")} hint={stats.best && coin(stats.best.symbol)}>
              {stats.best ? <Amount value={actualNet(stats.best)} unit={s.asset} signed colored /> : "—"}
            </Tile>
            <Tile icon={ThumbsDownIcon} tint="blue" label={t("Worst trade")} hint={stats.worst && coin(stats.worst.symbol)}>
              {stats.worst ? <Amount value={actualNet(stats.worst)} unit={s.asset} signed colored /> : "—"}
            </Tile>
          </div>
          {(loadingMore || stats.count < total) && (
            <p className="mt-2 px-1 text-caption text-muted-foreground">
              {loadingMore ? t("Loading more trades…") : t("Based on your latest {count} of {total} trades.", { count: stats.count, total })}
            </p>
          )}
        </>
      )}
      <p className="mt-4 px-1 text-caption text-subtle">{t("Updated {ago}", { ago: fmtDateTime(s.asOf) })}</p>
    </>
  );
}

const coin = (symbol: string) => symbol.replace("USDT", "");

function WinBar({ wins, losses, even }: { wins: number; losses: number; even: number }) {
  const total = wins + losses + even;
  return (
    <div className="mt-3">
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-raised">
        <div className="rounded-full bg-primary" style={{ width: `${(wins / total) * 100}%` }} />
        <div className="rounded-full bg-muted-foreground/50" style={{ width: `${(even / total) * 100}%` }} />
        <div className="rounded-full bg-destructive" style={{ width: `${(losses / total) * 100}%` }} />
      </div>
      <div className="mt-1.5 flex justify-between text-caption text-muted-foreground tabular-nums">
        <span className="text-primary">{t("{n} won", { n: wins })}</span>
        <span>{t("{n} even", { n: even })}</span>
        <span className="text-destructive">{t("{n} lost", { n: losses })}</span>
      </div>
    </div>
  );
}
