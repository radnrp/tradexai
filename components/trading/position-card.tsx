"use client";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown01Icon, ChartCandlestickIcon, Timer02Icon } from "@hugeicons/core-free-icons";
import { rrText } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import type { ExecutionEvent, Position } from "@/lib/api/types";
import { fmtDateTime, pick } from "@/lib/format";
import { closeReason } from "@/lib/labels";
import { add, fmt, fmtPrice, ratio, sign } from "@/lib/money";
import { fmtDuration, priceRR } from "@/lib/trade-stats";
import { Icon } from "@/components/ui/icon";
import { Pill, Row, Skeleton } from "@/components/ui/primitives";
import { CandleChart } from "./candle-chart";

const VALUATION = {
  fresh: { label: "Live", tone: "ok" },
  stale: { label: "Delayed", tone: "pending" },
  unavailable: { label: "No price", tone: "bad" },
  realized: { label: "Closed", tone: "idle" },
} as const;

const toneCls = (v: string | null | undefined) => (sign(v) > 0 ? "text-primary" : sign(v) < 0 ? "text-destructive" : "");
const time = (v: string | null) => (v ? new Date(v).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—");

/** A position the way a futures exchange shows it: PnL and ROI up top, then size, margin and prices with their units. */
export function PositionCard({ p, showAgent = true }: { p: Position; showAgent?: boolean }) {
  const [open, setOpen] = useState(false);
  const [chart, setChart] = useState(false);
  const isOpen = p.status === "open";
  const pnl = isOpen ? p.unrealizedNetEstimate : p.net_pnl;
  const v = VALUATION[p.valuationStatus] ?? VALUATION.unavailable;
  const short = p.side === "short";
  // old trades carry no leverage and count as 1×
  const lev = Number(p.leverage ?? 1);
  const fundingPending = !isOpen && p.funding_state === "pending";
  // ROI as exchanges show it: the net result over the trade's own money (margin). Display only.
  const roi = pnl != null && p.margin_amount && sign(p.margin_amount) > 0 ? ratio(pnl, p.margin_amount) * 100 : null;
  const coin = p.symbol.replace(/USDT$/, "");
  // R/R from this trade's own prices, and the target it opened with: an old 3:1 trade stays 3:1 next to new 2:1 ones
  const rr = priceRR(p);
  const target = pick<number | string>(p.config_snapshot, ["rr"]) ?? pick<number | string>(p.rules_snapshot, ["rr", "targetRR"]);
  // markers only change when the trade closes; a fresh object every 10s poll would rebuild the chart and lose its zoom
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const marks = useMemo(() => [p], [p.id, p.closed_at]);

  return (
    <div className="rounded-lg bg-surface">
      {/* tapping the summary shows this coin's chart; the chart sits outside it so dragging the chart doesn't close it */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={chart}
        aria-label={`${p.symbol} ${short ? "short" : "long"}. ${chart ? "Hide" : "Show"} chart`}
        onClick={() => setChart((c) => !c)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setChart((c) => !c);
          }
        }}
        className="cursor-pointer rounded-t-lg p-4 focus-visible:outline-2 focus-visible:outline-primary"
      >
        <div className="flex items-center gap-2">
          <span className="text-body font-semibold">{p.symbol}</span>
          <Icon icon={ChartCandlestickIcon} size={15} className={chart ? "text-primary" : "text-muted-foreground"} />
          <span className={`rounded px-1.5 py-0.5 text-caption font-semibold ${short ? "bg-destructive/12 text-destructive" : "bg-primary/12 text-primary"}`}>
            {short ? "Short" : "Long"}
            {lev > 1 ? ` ${lev}×` : ""}
          </span>
          {lev > 1 && <span className="rounded bg-surface-raised px-1.5 py-0.5 text-caption text-muted-foreground">Isolated</span>}
          <span className="ml-auto min-w-0 truncate text-caption text-muted-foreground">{isOpen ? <Elapsed since={p.opened_at} /> : closeReason(p.close_reason)}</span>
        </div>
        {showAgent && <div className="mt-0.5 text-caption text-muted-foreground">{p.agent_name}</div>}

        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-caption text-muted-foreground">{isOpen ? "Unrealized PnL (USDT)" : fundingPending ? "Realized PnL (USDT), funding pending" : "Realized PnL (USDT)"}</div>
            <div className={`text-h1 tabular-nums ${toneCls(pnl)}`}>{fmt(pnl, 2, { sign: true })}</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-caption text-muted-foreground">ROI</div>
            <div className={`text-h2 tabular-nums ${toneCls(pnl)}`}>{roi == null ? "—" : `${roi > 0 ? "+" : roi < 0 ? "−" : ""}${Math.abs(roi).toFixed(2)}%`}</div>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
          <Cell label="Size (USDT)">{fmt(p.entry_notional)}</Cell>
          <Cell label="Margin (USDT)">{fmt(p.margin_amount)}</Cell>
          {isOpen ? <Cell label="Liq. price (USDT)">{fmtPrice(p.liquidation_price)}</Cell> : <Cell label="Held for">{duration(p.opened_at, p.closed_at)}</Cell>}
          <Cell label="Entry price (USDT)">{fmtPrice(p.entry_price)}</Cell>
          {isOpen ? (
            <Cell label="Mark price (USDT)">
              <span className="inline-flex items-center gap-1">
                {fmtPrice(p.markPrice)}
                {v.tone !== "ok" && <span className={`size-1.5 rounded-full ${v.tone === "bad" ? "bg-destructive" : "bg-warning"}`} title={v.label} />}
              </span>
            </Cell>
          ) : (
            <Cell label="Exit price (USDT)">{fmtPrice(p.exit_price)}</Cell>
          )}
          <Cell label={isOpen ? "Opened" : "Closed"}>{time(isOpen ? p.opened_at : p.closed_at)}</Cell>
        </dl>
        {isOpen && v.tone !== "ok" && (
          <div className="mt-2">
            <Pill tone={v.tone}>{v.tone === "bad" ? "No live price" : "Price delayed"}</Pill>
          </div>
        )}

        {isOpen && <RangeBar p={p} />}
      </div>

      <AnimatePresence initial={false}>
        {chart && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-3 pb-3">
              <CandleChart symbol={p.symbol} positions={marks} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 w-full items-center justify-between border-t border-border px-4 text-label text-muted-foreground active:text-foreground"
      >
        Fees, funding and order steps
        <Icon icon={ArrowDown01Icon} size={16} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <div className="px-4 pb-4">
              <div className="divide-y divide-border">
                <Row label="PnL before fees (USDT)">
                  <span className={`tabular-nums ${toneCls(isOpen ? p.unrealizedGross : p.gross_pnl)}`}>{fmt(isOpen ? p.unrealizedGross : p.gross_pnl, 2, { sign: true })}</span>
                </Row>
                <Row label="Entry fee (USDT)">{fmt(p.entry_fee)}</Row>
                <Row label={isOpen ? "Exit fee, estimated (USDT)" : "Exit fee (USDT)"}>{fmt(isOpen ? p.estimatedExitFee : p.exit_fee)}</Row>
                {!isOpen && p.exit_fee && <Row label="Total fees (USDT)">{fmt(add(p.entry_fee, p.exit_fee))}</Row>}
                {/* funding is its own line, never part of the trade fee; null means not known yet, not zero */}
                <Row label={fundingPending ? "Funding, pending (USDT)" : "Funding (USDT)"}>
                  <span className={`tabular-nums ${toneCls(p.funding_net)}`}>{p.funding_net == null ? "—" : fmt(p.funding_net, 2, { sign: true })}</span>
                </Row>
                <Row label="Take profit (USDT)">{fmtPrice(p.take_profit)}</Row>
                <Row label="Stop loss (USDT)">{fmtPrice(p.stop_loss)}</Row>
                <Row label="Reward : risk (price)">
                  {rr ? `${rr} : 1` : "Unknown"}
                  {target != null && <span className="text-muted-foreground"> · target {rrText(target)}</span>}
                </Row>
                <Row label={`Quantity (${coin})`}>{fmt(p.quantity, 6)}</Row>
                <Row label="Opened">{fmtDateTime(p.opened_at)}</Row>
                {!isOpen && <Row label="Closed">{fmtDateTime(p.closed_at)}</Row>}
              </div>
              <p className="mt-2 text-caption text-muted-foreground">
                {isOpen
                  ? "Estimate, net of fees and funding."
                  : fundingPending
                    ? "Funding pending. Result may change slightly."
                    : "Net of fees and funding."}{" "}
                R/R is the TP vs SL price distance, before costs; it isn&apos;t a profit promise.
              </p>
              <Executions positionId={p.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-body-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/**
 * Where the price sits between the stop loss (left, loss) and the take profit (right, profit).
 * Works for both sides: for a short the stop is above entry, but it's still drawn on the left.
 */
function RangeBar({ p }: { p: Position }) {
  if (!p.stop_loss || !p.take_profit || !p.markPrice) return null;
  // display only: positions on a 0..1 track
  const sl = Number(p.stop_loss);
  const span = Number(p.take_profit) - sl;
  if (!span) return null;
  const at = (x: string) => Math.min(1, Math.max(0, (Number(x) - sl) / span));
  const entry = at(p.entry_price);
  const mark = at(p.markPrice);
  const up = mark >= entry;
  return (
    <div className="mt-4" role="img" aria-label={`Price is ${up ? "on the profit side" : "on the loss side"} between stop loss ${fmtPrice(p.stop_loss)} and take profit ${fmtPrice(p.take_profit)} USDT`}>
      <div className="relative h-1.5 rounded-full">
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-destructive/25" style={{ width: `${entry * 100}%` }} />
        <span className="absolute inset-y-0 right-0 rounded-r-full bg-primary/25" style={{ width: `${(1 - entry) * 100}%` }} />
        <span className="absolute -top-1 h-3.5 w-px bg-foreground/50" style={{ left: `${entry * 100}%` }} />
        <motion.span
          className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${up ? "bg-primary" : "bg-destructive"}`}
          animate={{ left: `${mark * 100}%` }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-caption tabular-nums">
        <span className="text-destructive">SL {fmtPrice(p.stop_loss)} USDT</span>
        <span className="text-muted-foreground">Entry</span>
        <span className="text-primary">TP {fmtPrice(p.take_profit)} USDT</span>
      </div>
    </div>
  );
}

/** How long the trade has been open. There's no time exit: it closes on TP/SL, liquidation, protection or a stop. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-1">
      <Icon icon={Timer02Icon} size={13} />
      Open {fmtDuration(Math.max(0, now - new Date(since).getTime()))}
    </span>
  );
}

function duration(from: string, to: string | null) {
  if (!to) return "—";
  const s = Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000));
  return s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

const EVENT_LABEL: Record<string, string> = { accepted: "Accepted", fill: "Filled", rejected: "Rejected", cancelled: "Cancelled", unknown: "Being resolved" };

function Executions({ positionId }: { positionId: string }) {
  const q = useQuery({ queryKey: ["executions", positionId], queryFn: () => API.executions(positionId) });
  if (q.isPending) return <Skeleton className="mt-3 h-16" />;
  if (q.isError || !q.data.items.length) return null;
  return (
    <div className="mt-4">
      <div className="mb-2 text-label text-muted-foreground">Order steps</div>
      <ol className="relative ml-1.5 border-l">
        {q.data.items.flatMap((o) =>
          o.events.map((e: ExecutionEvent) => (
            <li key={e.eventId} className="relative pb-3 pl-4 last:pb-0">
              <span className={`absolute -left-[4.5px] top-1.5 size-2 rounded-full ${e.type === "fill" ? "bg-primary" : e.type === "unknown" ? "bg-warning" : e.type === "rejected" ? "bg-destructive" : "bg-muted-foreground"}`} />
              <div className="flex items-center justify-between gap-2 text-body-sm">
                <span className="first-letter:uppercase">
                  {[o.intent ?? o.purpose, o.side].filter(Boolean).join(" ")} {EVENT_LABEL[e.type] ?? e.type}
                  {e.status === "pending" && <span className="text-warning"> (pending)</span>}
                </span>
                <span className="shrink-0 text-caption text-muted-foreground">{fmtDateTime(e.occurredAt ?? e.receivedAt)}</span>
              </div>
              {e.fill && (
                <div className="text-label font-normal text-muted-foreground tabular-nums">
                  {fmt(e.fill.quantity, 6)} @ {fmtPrice(e.fill.price)} = {fmt(e.fill.notional)} USDT
                </div>
              )}
              {e.reason && <div className="text-label font-normal text-muted-foreground">{e.reason}</div>}
            </li>
          )),
        )}
      </ol>
    </div>
  );
}
