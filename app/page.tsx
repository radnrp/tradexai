"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown02Icon, ArrowRight01Icon, ArrowUp02Icon, GiftIcon, Invoice03Icon, Notification03Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { telegramUser } from "@/lib/api/session";
import type { Trader } from "@/lib/api/types";
import { add, fmt, sign } from "@/lib/money";
import { qk, useLedgerSync, useStatement, useTrader } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { ActivityItem } from "@/components/activity-item";
import { toneCls } from "@/components/agents/shared";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { useOpenWithdraw } from "@/components/withdraw/withdraw-sheet";
import { useSession } from "@/components/shell/boot-gate";
import { OnboardingCard } from "@/components/trader/account-cards";
import { AgentOrb } from "@/components/trader/agent-orb";
import { AgentTour } from "@/components/trader/agent-tour";
import { CalculatorButton, CalculatorDialog } from "@/components/trader/calculator";
import { useProfitBubbles } from "@/components/trader/profit-events";
import { WelcomeDialog } from "@/components/trader/welcome-dialog";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, ListSkeleton, Page, SectionTitle, Skeleton } from "@/components/ui/primitives";

/** Home is the agent: the live circle, then what matters most (warnings, value, P&L), money actions, then everything else below. */
export default function Dashboard() {
  const { user } = useSession();
  const trader = useTrader();
  const { bubbles, done } = useProfitBubbles();
  const activity = useQuery({ queryKey: qk.activity(), queryFn: () => API.activity({ page: 1 }) });
  const [tour, setTour] = useState(false);
  const [calc, setCalc] = useState(false);
  const t = trader.data;
  // a trade opening/closing, funding settling or the migration finishing moves the balance: reread the ledger from the server
  useLedgerSync(t ? `${t.status}:${t.pauseReason}:${t.migrationState}:${t.quota.openPositions}:${t.valuation.fundingPendingPositions ?? ""}:${t.pnl.realizedNet}` : null);

  return (
    <Page>
      <TopBar name={user.name} />

      {trader.isPending ? (
        <div className="flex flex-col items-center gap-3 py-1" aria-busy aria-label="Loading your agent">
          <Skeleton className="size-63 rounded-full" />
          <Skeleton className="h-4 w-44" />
        </div>
      ) : !t ? (
        <ErrorState error={trader.error} onRetry={() => trader.refetch()} />
      ) : (
        <>
          <AgentOrb t={t} bubbles={bubbles} onBubbleDone={done} />
          <AgentSummary t={t} />
          <QuickActions />
          <div className="mt-3">
            <OnboardingCard t={t} onTutorial={() => setTour(true)} />
          </div>
          <WelcomeDialog t={t} userId={user.id} onTutorial={() => setTour(true)} />
          <AgentTour open={tour} t={t} onClose={() => setTour(false)} />
        </>
      )}

      <div className="mt-4 flex justify-center">
        <CalculatorButton onClick={() => setCalc(true)} />
      </div>
      <CalculatorDialog open={calc} onClose={() => setCalc(false)} />

      <SectionTitle href="/activity">Recent activity</SectionTitle>
      {activity.isPending ? (
        <ListSkeleton rows={3} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : activity.data.items.length ? (
        <Card className="divide-y divide-border px-4">
          {activity.data.items.slice(0, 3).map((j) => (
            <ActivityItem key={j.id} j={j} names={t ? { [t.instanceId]: "Agent" } : {}} />
          ))}
        </Card>
      ) : (
        <EmptyState icon={<Icon icon={Invoice03Icon} size={28} />} title="No activity yet" />
      )}
    </Page>
  );
}

function TopBar({ name }: { name: string }) {
  const photo = telegramUser()?.photo_url;
  return (
    <header className="flex items-center justify-between gap-3 pb-2 pt-4">
      <Link href="/profile" className="flex min-w-0 items-center gap-3" aria-label="Profile">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-body font-semibold">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="flex min-w-0 items-center gap-0.5 text-body font-semibold">
          <span className="truncate">{name}</span>
          <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-muted-foreground" />
        </div>
      </Link>
      <div className="flex shrink-0 gap-2">
        <Link href="/activity" aria-label="Activity" className="grid size-11 place-items-center rounded-full bg-surface-raised transition-transform duration-100 active:scale-95">
          <Icon icon={Notification03Icon} />
        </Link>
        <Link href="/profile" aria-label="Profile" className="grid size-11 place-items-center rounded-full bg-surface-raised transition-transform duration-100 active:scale-95">
          <Icon icon={UserCircleIcon} />
        </Link>
      </div>
    </header>
  );
}

/** Deposit, Withdraw and Invite as three round buttons under the circle. */
function QuickActions() {
  const openDeposit = useOpenDeposit();
  const openWithdraw = useOpenWithdraw();
  const cls = "group flex flex-col items-center gap-1.5 text-label text-foreground";
  const dot = "grid size-12 place-items-center rounded-full transition-transform duration-100 group-active:scale-95";
  return (
    <nav className="mt-5 grid grid-cols-3 gap-2" aria-label="Quick actions">
      <button
        type="button"
        className={cls}
        onClick={() => {
          haptic.tap();
          openDeposit();
        }}
      >
        <span className={`${dot} bg-primary text-primary-foreground`}>
          <Icon icon={ArrowDown02Icon} size={22} />
        </span>
        Deposit
      </button>
      <button
        type="button"
        className={cls}
        onClick={() => {
          haptic.tap();
          openWithdraw();
        }}
      >
        <span className={`${dot} bg-surface-raised`}>
          <Icon icon={ArrowUp02Icon} size={22} />
        </span>
        Withdraw
      </button>
      <Link href="/referrals" onClick={() => haptic.tap()} className={cls}>
        <span className={`${dot} bg-surface-raised`}>
          <Icon icon={GiftIcon} size={22} />
        </span>
        Invite
      </Link>
    </nav>
  );
}

/**
 * The critical numbers right under the circle (its warning chip sits with the circle): the agent's value and total
 * P&L, then what can be withdrawn, open P&L and win rate. Total P&L is realized + open
 * from the server, never value minus a deposit, and an unknown value stays "—" rather than zero.
 */
function AgentSummary({ t }: { t: Trader }) {
  const st = useStatement("all", t.instanceId);
  const wr = st.data?.observedWinrate;
  const open = t.pnl.unrealizedNetEstimate;
  const total = open == null ? null : add(t.pnl.realizedNet, open);

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-end justify-between gap-3">
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

      <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3 text-center">
        <div className="px-1">
          <dt className="text-caption text-muted-foreground">Withdrawable</dt>
          <dd className="mt-0.5 truncate text-body-sm font-semibold tabular-nums">{fmt(t.withdrawable)}</dd>
        </div>
        <div className="px-1">
          <dt className="text-caption text-muted-foreground">Open PnL</dt>
          <dd className={`mt-0.5 truncate text-body-sm font-semibold tabular-nums ${toneCls(open)}`}>{fmt(open, 2, { sign: true })}</dd>
        </div>
        <div className="px-1">
          <dt className="text-caption text-muted-foreground">{st.data ? `Win rate (${st.data.realized.closed_trades})` : "Win rate"}</dt>
          <dd className="mt-0.5 text-body-sm font-semibold tabular-nums">{wr == null ? "—" : `${Number(wr).toFixed(0)}%`}</dd>
        </div>
      </dl>
      {sign(t.trialPrincipalRemaining) > 0 && (
        <p className="mt-3 border-t border-border pt-3 text-center text-caption text-muted-foreground">
          Includes <span className="font-semibold text-foreground tabular-nums">{fmt(t.trialPrincipalRemaining)} USDT</span> Trial fund: it trades, but can&apos;t be withdrawn.
        </p>
      )}
    </Card>
  );
}
