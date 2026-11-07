"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown02Icon, ArrowRight01Icon, ArrowUp02Icon, CustomerSupportIcon, GiftIcon, Invoice03Icon, Notification03Icon, StarIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { telegramUser } from "@/lib/api/session";
import type { Trader } from "@/lib/api/types";
import { SUPPORT_URL } from "@/lib/env";
import { fmt } from "@/lib/money";
import { qk, useAfterTrader, useLedgerSync, useStatement, useTrader } from "@/lib/queries";
import { roiText, supportHref, trialCard, trialProfitLock } from "@/lib/trader";
import { haptic, openExternal } from "@/lib/telegram";
import { t as tr } from "@/lib/i18n";
import { ActivityItem } from "@/components/activity-item";
import { toneCls } from "@/components/agents/shared";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { useOpenWithdraw } from "@/components/withdraw/withdraw-sheet";
import { useSession } from "@/components/shell/boot-gate";
import { OnboardingCard } from "@/components/trader/account-cards";
import { AgentOrb } from "@/components/trader/agent-orb";
import { AgentTour } from "@/components/trader/agent-tour";
import { NextStepCard } from "@/components/trader/next-step";
import { TrialCard } from "@/components/trader/trial-card";
import { TrialProfitCard } from "@/components/trader/trial-profit-card";
import { CalculatorButton, CalculatorDialog } from "@/components/trader/calculator";
import { useProfitBubbles } from "@/components/trader/profit-events";
import { WelcomeDialog } from "@/components/trader/welcome-dialog";
import { PnlAmount } from "@/components/trading/pnl";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, ListSkeleton, Page, SectionTitle, Skeleton } from "@/components/ui/primitives";

/**
 * Home is the agent: setup on top until it's done, the live circle, then what matters most (warnings, value, P&L), money
 * actions and the one next step, then everything else below.
 */
export default function Dashboard() {
  const { user } = useSession();
  const trader = useTrader();
  // the agent's numbers go first; the rest would only queue ahead of them on the server
  const after = useAfterTrader();
  const { bubbles, done } = useProfitBubbles(after);
  const activity = useQuery({ queryKey: qk.activity(), queryFn: () => API.activity({ page: 1 }), enabled: after });
  const [tour, setTour] = useState(false);
  const t = trader.data;
  // a trade opening/closing, funding settling, the migration or the trial finishing moves the balance: reread the ledger from the server
  useLedgerSync(
    t ? `${t.status}:${t.pauseReason}:${t.migrationState}:${t.quota.openPositions}:${t.valuation.fundingPendingPositions ?? ""}:${t.pnl.realizedNet}:${t.trial?.status ?? ""}` : null,
  );
  // its "real funds" button replaces the bottom banner for that step, so the same action never shows twice
  const trial = t ? trialCard(t.trial, t.engagement.recommendedCta) : null;
  // trial profit waiting for real deposits; its button only when that's the server's next step, so a payment under way comes first
  const profitLock = t && t.engagement.trialProfitCta?.eligible !== false ? trialProfitLock(t.trialProfitProtection) : null;
  const profitFund = !!profitLock && t?.engagement.recommendedCta.code === "fund_to_unlock_trial_profit";

  return (
    <Page>
      <TopBar name={user.name} supportUrl={t?.depositUi?.supportUrl} />

      {trader.isPending ? (
        <div className="flex flex-col items-center gap-3 py-1" aria-busy aria-label={tr("Loading your agent")}>
          <Skeleton className="size-63 rounded-full" />
          <Skeleton className="h-4 w-44" />
        </div>
      ) : !t ? (
        <ErrorState error={trader.error} onRetry={() => trader.refetch()} />
      ) : (
        <>
          {/* only until setup is done, so it's the first thing a new user sees */}
          <OnboardingCard t={t} onTutorial={() => setTour(true)} className="mb-3" />
          <AgentOrb t={t} bubbles={bubbles} onBubbleDone={done} />
          {trial && <TrialCard t={t} view={trial} className="mt-4" />}
          {profitLock && <TrialProfitCard lock={profitLock} fund={profitFund} className="mt-4" />}
          <AgentSummary t={t} />
          <QuickActions />
          {t.engagement.feedbackCta?.eligible && <FeedbackInvite />}
          {!trial?.cta && !profitFund && (
            <div className="mt-3">
              <NextStepCard cta={t.engagement.recommendedCta} userId={user.id} />
            </div>
          )}
          <WelcomeDialog t={t} userId={user.id} onTutorial={() => setTour(true)} />
          <AgentTour open={tour} t={t} onClose={() => setTour(false)} />
        </>
      )}

      <SectionTitle href="/activity">{tr("Recent activity")}</SectionTitle>
      {activity.isPending ? (
        <ListSkeleton rows={3} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : activity.data.items.length ? (
        <Card className="divide-y divide-border px-4">
          {activity.data.items.slice(0, 3).map((j) => (
            <ActivityItem key={j.id} j={j} names={t ? { [t.instanceId]: tr("Agent") } : {}} />
          ))}
        </Card>
      ) : (
        <EmptyState icon={<Icon icon={Invoice03Icon} size={28} />} title={tr("No activity yet")} />
      )}
    </Page>
  );
}

function TopBar({ name, supportUrl }: { name: string; supportUrl?: string | null }) {
  const photo = telegramUser()?.photo_url;
  const support = supportHref(supportUrl, SUPPORT_URL);
  return (
    <header className="flex items-center justify-between gap-3 pb-2 pt-4">
      <Link href="/profile" className="flex min-w-0 items-center gap-3" aria-label={tr("Profile")}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-body font-semibold">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="flex min-w-0 items-center gap-0.5 text-body font-semibold">
          <span className="truncate">{name}</span>
          <Icon icon={ArrowRight01Icon} size={16} className="rtl:-scale-x-100 shrink-0 text-muted-foreground" />
        </div>
      </Link>
      <div className="flex shrink-0 gap-2">
        <Link href="/activity" aria-label={tr("Activity")} className="grid size-11 place-items-center rounded-full bg-surface-raised transition-transform duration-100 active:scale-95">
          <Icon icon={Notification03Icon} />
        </Link>
        {support && (
          <button
            type="button"
            aria-label={tr("Support")}
            onClick={() => {
              haptic.tap();
              openExternal(support);
            }}
            className="grid size-11 place-items-center rounded-full bg-surface-raised transition-transform duration-100 active:scale-95"
          >
            <Icon icon={CustomerSupportIcon} />
          </button>
        )}
      </div>
    </header>
  );
}

/** Shown only while the server says it's a good time to ask (engagement.feedbackCta). */
function FeedbackInvite() {
  return (
    <Link href="/feedback" onClick={() => haptic.tap()} className="mt-4 flex items-center gap-3 rounded-lg bg-surface p-4 transition-opacity active:opacity-80">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/12 text-warning">
        <Icon icon={StarIcon} />
      </span>
      <span className="min-w-0 flex-1 text-body-sm font-semibold">{tr("Rate your experience")}</span>
      <Icon icon={ArrowRight01Icon} size={18} className="rtl:-scale-x-100 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/** Deposit, Withdraw and Invite as three round buttons under the circle. */
function QuickActions() {
  const openDeposit = useOpenDeposit();
  const openWithdraw = useOpenWithdraw();
  const cls = "group flex flex-col items-center gap-1.5 text-label text-foreground";
  const dot = "grid size-12 place-items-center rounded-full transition-transform duration-100 group-active:scale-95";
  return (
    <nav className="mt-5 grid grid-cols-3 gap-2" aria-label={tr("Quick actions")}>
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
        {tr("Deposit")}
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
        {tr("Withdraw")}
      </button>
      <Link href="/referrals" onClick={() => haptic.tap()} className={cls}>
        <span className={`${dot} bg-surface-raised`}>
          <Icon icon={GiftIcon} size={22} />
        </span>
        {tr("Invite")}
      </Link>
    </nav>
  );
}

/**
 * The critical numbers right under the circle (its warning chip sits with the circle): the account balance, without the Trial
 * grant and the same figure as Wallet's, and settled P&L with its ROI (one basis, all time) and the scenario calculator beside
 * them, then what can be withdrawn, open P&L and win rate. Open P&L stays in its own column, never added into the ROI; an unknown
 * value reads Pending rather than zero. Both P&Ls are personal: losses the Trial grant covered are left out; win rate stays the actual one.
 */
function AgentSummary({ t }: { t: Trader }) {
  const st = useStatement("all", t.instanceId);
  const wr = st.data?.observedWinrate;
  const open = t.pnl.unrealizedNetEstimate;
  const p = t.performance;
  const balance = t.balances.nonTrialEquity;
  const [calc, setCalc] = useState(false);

  return (
    <Card className="mt-4 p-4">
      <div className="flex items-end justify-between gap-3 rtl:flex-wrap">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">{tr("Account balance (USDT)")}</div>
          <div className={`text-display tabular-nums ${balance == null ? "text-muted-foreground" : ""}`}>{balance == null ? "—" : fmt(balance)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-end">
            <div className="text-caption text-muted-foreground">{tr("Realized PnL (USDT)")}</div>
            <div className={`text-h2 tabular-nums ${toneCls(p.netPnl)}`}>
              <bdi>{fmt(p.netPnl, 2, { sign: true })}</bdi>
            </div>
            <div className={`text-caption font-semibold tabular-nums ${p.status === "available" ? toneCls(p.roiPercent) : "text-muted-foreground"}`}>
              {/* short on purpose: a wider column here squeezes the agent's value on small screens */}
              {p.status === "funding_pending" ? tr("Funding pending") : tr("{roi} ROI", { roi: roiText(p.roiPercent) })}
            </div>
          </div>
          <CalculatorButton onClick={() => setCalc(true)} />
        </div>
      </div>
      {balance == null && <p className="mt-1 text-caption text-muted-foreground">{tr("Updating…")}</p>}

      <dl className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3 text-center">
        <div className="px-1">
          <dt className="text-caption text-muted-foreground">{tr("Withdrawable")}</dt>
          <dd className="mt-0.5 truncate text-body-sm font-semibold tabular-nums">{fmt(t.withdrawable)}</dd>
        </div>
        <div className="px-1">
          <dt className="text-caption text-muted-foreground">{tr("Open PnL")}</dt>
          <dd className="mt-0.5 truncate text-body-sm font-semibold">
            <PnlAmount value={open} />
          </dd>
        </div>
        <div className="px-1">
          <dt className="text-caption text-muted-foreground">{st.data ? tr("Win rate ({n})", { n: st.data.realized.closed_trades }) : tr("Win rate")}</dt>
          <dd className="mt-0.5 text-body-sm font-semibold tabular-nums">{wr == null ? "—" : `${Number(wr).toFixed(0)}%`}</dd>
        </div>
      </dl>
      <CalculatorDialog open={calc} onClose={() => setCalc(false)} balance={balance} />
    </Card>
  );
}
