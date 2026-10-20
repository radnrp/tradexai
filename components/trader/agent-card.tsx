"use client";
import { ArrowDown02Icon } from "@hugeicons/core-free-icons";
import { rrText, targetRROf } from "@/lib/agent-info";
import type { Trader } from "@/lib/api/types";
import { instanceStatus } from "@/lib/labels";
import { add, fmt } from "@/lib/money";
import { useStatement } from "@/lib/queries";
import { Cell, EntryCheck, MoneySplit, toneCls } from "@/components/agents/shared";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { StatusOrb } from "@/components/trader/status";
import { useAgentStatus } from "@/components/trader/use-agent-status";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, Pill, Skeleton } from "@/components/ui/primitives";

/**
 * The agent as one account: what it's doing, what it's worth, how it has done and where its money is.
 * Display only: there's no pause or stop, the server runs the account.
 * Total P&L is realized + open from GET /trader, never "value − first deposit", so deposits never look like profit.
 */
export function AgentCard({ t }: { t: Trader }) {
  const { s, inst, title, note, mode, warn } = useAgentStatus(t);
  // win rate of this agent's own settled trades
  const st = useStatement("all", t.instanceId);
  const openDeposit = useOpenDeposit();
  const i = inst.data;
  const pill = instanceStatus(t.status);
  const rr = i ? targetRROf(i) : null;

  const realized = t.pnl.realizedNet;
  const open = t.pnl.unrealizedNetEstimate;
  // unknown open P&L keeps the total unknown rather than pretending it's zero
  const total = open == null ? null : add(realized, open);
  const wr = st.data?.observedWinrate;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <StatusOrb mode={mode} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-caption text-muted-foreground">Agent{rr != null ? ` · target R/R ${rrText(rr)}` : ""}</div>
          <div className="truncate text-body-sm font-semibold" role="status">
            {title}
          </div>
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      {note && <p className={`mt-2.5 text-caption ${warn ? "text-warning" : "text-muted-foreground"}`}>{note}</p>}
      {i?.entryRejection && t.status === "active" && <EntryCheck r={i.entryRejection} trading={i.openPositions > 0} />}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">Agent value (USDT)</div>
          <div className={`text-display tabular-nums ${t.equity == null ? "text-muted-foreground" : ""}`}>{fmt(t.equity ?? t.bookedEquity)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-caption text-muted-foreground">Total PnL (USDT)</div>
          <div className={`text-h2 tabular-nums ${toneCls(total)}`}>{fmt(total, 2, { sign: true })}</div>
        </div>
      </div>
      {t.equity == null && <p className="mt-1 text-caption text-warning">Booked value; live prices are unavailable.</p>}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Cell label="Closed PnL (USDT)">
          <span className={toneCls(realized)}>{fmt(realized, 2, { sign: true })}</span>
        </Cell>
        <Cell label="Open PnL (USDT)">
          <span className={toneCls(open)}>{fmt(open, 2, { sign: true })}</span>
        </Cell>
        <Cell label={st.data ? `Win rate (${st.data.realized.closed_trades})` : "Win rate"}>{wr == null ? "—" : `${Number(wr).toFixed(0)}%`}</Cell>
      </dl>

      {i ? <MoneySplit inst={i} /> : inst.isPending && <Skeleton className="mt-4 h-14 rounded-md" />}
      <p className="mt-2 text-caption text-muted-foreground tabular-nums">
        {t.quota.entriesLastHour} of {t.quota.hourlyEntryLimit} new trades in the last hour
      </p>

      {s.cta === "deposit" && (
        <Button size="sm" block className="mt-3.5" icon={<Icon icon={ArrowDown02Icon} size={16} />} onClick={() => openDeposit()}>
          Deposit
        </Button>
      )}
    </Card>
  );
}
