"use client";
import { ArrowDown02Icon } from "@hugeicons/core-free-icons";
import { rrText, targetRROf } from "@/lib/agent-info";
import type { Trader } from "@/lib/api/types";
import { instanceStatus } from "@/lib/labels";
import { add, fmt, sign } from "@/lib/money";
import { useStatement } from "@/lib/queries";
import { trialUsage } from "@/lib/trader";
import { t as tr } from "@/lib/i18n";
import { Cell, EntryCheck, MoneySplit } from "@/components/agents/shared";
import { useFundXeno } from "@/components/deposit/deposit-sheet";
import { StatusOrb } from "@/components/trader/status";
import { useAgentStatus } from "@/components/trader/use-agent-status";
import { PnlAmount } from "@/components/trading/pnl";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, Pill, Skeleton } from "@/components/ui/primitives";

/**
 * The agent as one account: what it's doing, the balance (without the Trial grant, same as Wallet), how it has done and where its
 * money is.
 * Display only: there's no pause or stop, the server runs the account.
 * Total P&L is realized + open from GET /trader, never "value − first deposit", so deposits never look like profit.
 * Both are personal (losses the Trial grant covered are left out); win rate stays the actual one.
 */
export function AgentCard({ t }: { t: Trader }) {
  const { s, inst, title, note, mode, warn } = useAgentStatus(t);
  // win rate of this agent's own settled trades
  const st = useStatement("all", t.instanceId);
  const fundXeno = useFundXeno();
  const i = inst.data;
  const pill = instanceStatus(t.status);
  const rr = i ? targetRROf(i) : null;

  const realized = t.pnl.realizedNet;
  const open = t.pnl.unrealizedNetEstimate;
  // unknown open P&L keeps the total pending rather than pretending it's zero
  const total = open == null ? null : add(realized, open);
  const wr = st.data?.observedWinrate;
  const balance = t.balances.nonTrialEquity;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <StatusOrb mode={mode} size={44} />
        <div className="min-w-0 flex-1">
          <div className="text-caption text-muted-foreground">{rr != null ? tr("Agent · target R/R {rr}", { rr: rrText(rr) }) : tr("Agent")}</div>
          <div className="truncate text-body-sm font-semibold rtl:whitespace-normal" role="status">
            {title}
          </div>
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>
      {note && <p className={`mt-2.5 text-caption ${warn ? "text-warning" : "text-muted-foreground"}`}>{note}</p>}
      {i?.entryRejection && t.status === "active" && <EntryCheck r={i.entryRejection} trading={i.openPositions > 0} />}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">{tr("Account balance (USDT)")}</div>
          <div className={`text-display tabular-nums ${balance == null ? "text-muted-foreground" : ""}`}>{balance == null ? "—" : fmt(balance)}</div>
        </div>
        <div className="shrink-0 text-end">
          <div className="text-caption text-muted-foreground">{tr("Total PnL (USDT)")}</div>
          <div className="text-h2">
            <PnlAmount value={total} />
          </div>
        </div>
      </div>
      {balance == null && <p className="mt-1 text-caption text-muted-foreground">{tr("Updating…")}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Cell label={tr("Closed PnL (USDT)")}>
          <PnlAmount value={realized} />
        </Cell>
        <Cell label={tr("Open PnL (USDT)")}>
          <PnlAmount value={open} />
        </Cell>
        <Cell label={st.data ? tr("Win rate ({n})", { n: st.data.realized.closed_trades }) : tr("Win rate")}>{wr == null ? "—" : `${Number(wr).toFixed(0)}%`}</Cell>
      </dl>

      {i ? <MoneySplit inst={i} /> : inst.isPending && <Skeleton className="mt-4 h-14 rounded-md" />}
      {/* what XENO trades with, so the grant is in these figures: without this they'd read as the user's money */}
      {sign(t.balances.trialPrincipal) > 0 && <p className="mt-2 text-caption text-muted-foreground">{tr("Includes the Trial grant, which isn't part of your balance.")}</p>}
      <p className="mt-2 text-caption text-muted-foreground tabular-nums">
        {tr("{used} of {limit} new trades in the last hour", { used: t.quota.entriesLastHour, limit: t.quota.hourlyEntryLimit })}
      </p>
      {t.trial && t.trial.status !== "converted" && <p className="mt-0.5 text-caption text-muted-foreground tabular-nums">{tr("Trial: {usage}", { usage: trialUsage(t.trial) })}</p>}

      {s.cta === "deposit" && (
        <Button size="sm" block className="mt-3.5" icon={<Icon icon={ArrowDown02Icon} size={16} />} onClick={() => fundXeno()}>
          {tr("Deposit")}
        </Button>
      )}
    </Card>
  );
}
