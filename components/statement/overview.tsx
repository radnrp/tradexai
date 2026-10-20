"use client";
import { useMemo, useState } from "react";
import { Award01Icon, ChartDownIcon, ChartUpIcon, ThumbsDownIcon } from "@hugeicons/core-free-icons";
import type { Range, Statement } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { sign } from "@/lib/money";
import { tradeStats } from "@/lib/trade-stats";
import { valuationNotes } from "@/lib/valuation";
import { EquityChart } from "@/components/trading/equity-chart";
import { Segmented } from "@/components/ui/controls";
import { Amount, Card, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { DailyPnlChart } from "./daily-chart";
import { dailyNet, equityValues, useClosedTrades } from "./data";
import { Tile } from "./tile";

const RANGE_LABEL: Record<Range, string> = { "7d": "Last 7 days", "30d": "Last 30 days", "6m": "Last 6 months", all: "All time" };
type Chart = "value" | "daily";
const CHARTS: { value: Chart; label: string }[] = [
  { value: "value", label: "Total value" },
  { value: "daily", label: "Daily profit" },
];

export function Overview({ s, range, agent }: { s: Statement; range: Range; agent?: string }) {
  const { q, trades, total, loadingMore } = useClosedTrades(range, agent);
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
        <div className="text-label text-white/70">Profit · {RANGE_LABEL[range]}</div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Amount value={r.realized_net} signed colored className="text-display" />
          <span className="text-body-sm text-white/70">{s.asset}</span>
          {roi != null && (
            <span className={`rounded-full px-2 py-0.5 text-label font-semibold tabular-nums ${roi >= 0 ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
              {roi >= 0 ? "+" : "−"}
              {Math.abs(roi).toFixed(2)}%
            </span>
          )}
        </div>
        <p className="mt-1 text-caption text-white/60">Trades closed in this period, after fees and funding</p>
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
          <div>
            <div className="text-caption text-white/60">Total value</div>
            <Amount value={s.equity} unit={s.asset} className="mt-0.5 block text-body font-semibold" />
          </div>
          <div>
            <div className="text-caption text-white/60">Open trades now</div>
            <Amount value={s.unrealizedNetEstimate} unit={s.asset} signed colored className="mt-0.5 block text-body font-semibold" />
          </div>
        </div>
      </Card>
      {valuationNotes(s).messages.map((m) => (
        <p key={m} className="mt-2 px-1 text-label text-warning">
          {m}
        </p>
      ))}

      <Card className="mt-3 p-4">
        <Segmented layoutId="overview-chart" value={chart} onChange={setChart} options={CHARTS} />
        <div className="mt-4">
          {chart === "value" ? (
            s.history.coverage === "no_data" ? (
              <p className="py-8 text-center text-body-sm text-muted-foreground">No data for this period yet.</p>
            ) : (
              <EquityChart rows={s.equityHistory} unit={s.asset} />
            )
          ) : q.isPending && !s.daily.length ? (
            <Skeleton className="h-40 rounded-md" />
          ) : (
            <DailyPnlChart days={days} />
          )}
        </div>
      </Card>

      <SectionTitle>Your trades</SectionTitle>
      {q.isPending ? (
        <Skeleton className="h-64 rounded-lg" />
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-label text-muted-foreground">Win rate</div>
                <div className="text-h2 tabular-nums">{winrate == null ? "—" : `${winrate.toFixed(1)}%`}</div>
              </div>
              <div className="text-right text-label text-muted-foreground tabular-nums">
                {r.closed_trades} closed trade{r.closed_trades === 1 ? "" : "s"}
              </div>
            </div>
            {r.closed_trades > 0 && <WinBar wins={r.wins} losses={r.losses} even={r.breakeven} />}
          </Card>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Tile icon={ChartUpIcon} tint="green" label="Average win">
              {stats.avgWin ? <Amount value={stats.avgWin} unit={s.asset} signed colored /> : "—"}
            </Tile>
            <Tile icon={ChartDownIcon} tint="red" label="Average loss">
              {stats.avgLoss ? <span className="text-destructive">−<Amount value={stats.avgLoss} unit={s.asset} /></span> : "—"}
            </Tile>
            <Tile icon={Award01Icon} tint="amber" label="Best trade" hint={stats.best && coin(stats.best.symbol)}>
              {stats.best ? <Amount value={stats.best.net_pnl} unit={s.asset} signed colored /> : "—"}
            </Tile>
            <Tile icon={ThumbsDownIcon} tint="blue" label="Worst trade" hint={stats.worst && coin(stats.worst.symbol)}>
              {stats.worst ? <Amount value={stats.worst.net_pnl} unit={s.asset} signed colored /> : "—"}
            </Tile>
          </div>
          {(loadingMore || stats.count < total) && (
            <p className="mt-2 px-1 text-caption text-muted-foreground">
              {loadingMore ? "Loading more trades…" : `Based on your latest ${stats.count} of ${total} trades.`}
            </p>
          )}

          {!agent && stats.byAgent.length > 1 && (
            <>
              <SectionTitle>By agent</SectionTitle>
              <ByAgent rows={stats.byAgent} />
            </>
          )}
        </>
      )}
      <p className="mt-4 px-1 text-caption text-subtle">Updated {fmtDateTime(s.asOf)}</p>
    </>
  );
}

const coin = (symbol: string) => symbol.replace("USDT", "");

/** One row per agent: net result with a bar sized to the biggest one. */
function ByAgent({ rows }: { rows: { key: string; count: number; wins: number; net: string }[] }) {
  const max = Math.max(...rows.map((r) => Math.abs(Number(r.net))), 1e-9);
  return (
    <Card className="divide-y divide-border px-4">
      {rows.map((r) => (
        <div key={r.key} className="py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-body-sm font-semibold">{r.key}</span>
            <Amount value={r.net} unit="USDT" signed colored className="text-body-sm font-semibold" />
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <div className={`h-full rounded-full ${sign(r.net) >= 0 ? "bg-primary" : "bg-destructive"}`} style={{ width: `${(Math.abs(Number(r.net)) / max) * 100}%` }} />
          </div>
          <div className="mt-1 text-caption text-muted-foreground tabular-nums">
            {r.count} trade{r.count > 1 ? "s" : ""} · {Math.round((r.wins / r.count) * 100)}% won
          </div>
        </div>
      ))}
    </Card>
  );
}

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
        <span className="text-primary">{wins} won</span>
        <span>{even} even</span>
        <span className="text-destructive">{losses} lost</span>
      </div>
    </div>
  );
}
