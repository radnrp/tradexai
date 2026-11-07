"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowDown02Icon, ArrowRight01Icon, ArrowUp02Icon, GiftIcon, InboxIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { Trader } from "@/lib/api/types";
import { fmtDateTime, shortAddr } from "@/lib/format";
import { depositStatus, withdrawalStatus } from "@/lib/labels";
import { fmt, sign, trimZeros } from "@/lib/money";
import { bountyActive, programActive, sharePct } from "@/lib/partner";
import { qk, useReferrals, useTrader } from "@/lib/queries";
import { trialProfitFundingText, trialProfitLock, withdrawalBlock } from "@/lib/trader";
import { t as tr } from "@/lib/i18n";
import { tx } from "@/lib/i18n/rich";
import { Button } from "@/components/ui/button";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { useOpenWithdraw } from "@/components/withdraw/withdraw-sheet";
import { networkInfo, tokenByCode } from "@/components/deposit/options";
import { DepositLocksCard } from "@/components/wallet/deposit-locks";
import { Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Amount, Card, EmptyState, ErrorState, ListSkeleton, Page, PageHeader, Pill, SectionTitle } from "@/components/ui/primitives";

export default function WalletPage() {
  const trader = useTrader();
  const openDeposit = useOpenDeposit();
  const openWithdraw = useOpenWithdraw();
  const [tab, setTab] = useState<"deposits" | "withdrawals">("deposits");
  const deposits = useQuery({ queryKey: qk.deposits, queryFn: () => API.deposits(), enabled: tab === "deposits" });
  const withdrawals = useQuery({ queryKey: qk.withdrawals, queryFn: () => API.withdrawals(), enabled: tab === "withdrawals" });
  const list = tab === "deposits" ? deposits : withdrawals;

  return (
    <Page>
      <PageHeader title={tr("Wallet")} />
      <Card hero className="p-5">
        {trader.isPending ? (
          <div className="mt-2 h-9.5 w-48 animate-pulse rounded-md bg-white/10" aria-busy aria-label={tr("Loading balance")} />
        ) : !trader.data ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-body-sm text-white/85">{tr("Couldn't load balance")}</p>
            <button type="button" onClick={() => trader.refetch()} className="h-9 shrink-0 rounded-full bg-white/12 px-3 text-label">
              {tr("Try again")}
            </button>
          </div>
        ) : (
          <AccountBalance t={trader.data} />
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button onClick={() => openDeposit()} icon={<Icon icon={ArrowDown02Icon} size={18} />}>
            {tr("Deposit")}
          </Button>
          <Button onClick={() => openWithdraw()} variant="secondary" className="bg-white/12! text-white!" icon={<Icon icon={ArrowUp02Icon} size={18} />}>
            {tr("Withdraw")}
          </Button>
        </div>
      </Card>

      {/* only while a deposit's principal is locked */}
      {!!trader.data?.depositLocks?.items.length && <DepositLocksCard locks={trader.data.depositLocks} />}

      <InviteRow />

      <SectionTitle href="/activity" linkLabel={tr("All activity")}>
        {tr("History")}
      </SectionTitle>
      <Segmented layoutId="wallet-tab" value={tab} onChange={setTab} options={[{ value: "deposits", label: tr("Deposits") }, { value: "withdrawals", label: tr("Withdrawals") }]} />
      <div className="mt-3">
        {list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : tab === "deposits" ? (
          deposits.data?.length ? (
            <Card className="divide-y divide-border px-4">
              {deposits.data.map((d) => {
                // the list isn't polled: a waiting row past its deadline is shown as pending, not as payable
                const late = d.status === "waiting" && !!d.expires_at && Date.parse(d.expires_at) <= deposits.dataUpdatedAt;
                const s = late ? { label: tr("Time's up"), tone: "pending" as const } : depositStatus(d.status);
                return (
                  <HistoryRow key={d.id} onClick={() => openDeposit(d.id)} icon={ArrowDown02Icon} title={depositTitle(d.pay_currency)} sub={fmtDateTime(d.created_at ?? null)}>
                    <Amount value={d.credited_amount ?? d.requested_usd} unit={d.credited_amount ? "USDT" : "USD"} className="text-body-sm font-semibold" />
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </HistoryRow>
                );
              })}
            </Card>
          ) : (
            <EmptyState icon={<Icon icon={InboxIcon} size={28} />} title={tr("No deposits yet")} />
          )
        ) : withdrawals.data?.length ? (
          <Card className="divide-y divide-border px-4">
            {withdrawals.data.map((w) => {
              const s = withdrawalStatus(w.status);
              return (
                <HistoryRow key={w.id} onClick={() => openWithdraw(w.id)} icon={ArrowUp02Icon} title={tx("To {addr}", { addr: <span dir="ltr" className="font-latin">{shortAddr(w.address, 4)}</span> })} sub={fmtDateTime(w.created_at)}>
                  <Amount value={w.amount} unit="USDT" className="text-body-sm font-semibold" />
                  <Pill tone={s.tone}>{s.label}</Pill>
                </HistoryRow>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon={<Icon icon={InboxIcon} size={28} />} title={tr("No withdrawals yet")} />
        )}
      </div>
    </Page>
  );
}

/** The referral program in one row; the full page (link, sharing, friends) is behind it. */
function InviteRow() {
  const q = useReferrals();
  const r = q.data;
  // all-time commission and rewards: not part of what's withdrawable
  const earned = r && programActive(r) && r.totals ? r.totals.totalEarned : r?.earned;
  const line = !r
    ? tr("Earn from friends' trading fees")
    : programActive(r)
      ? bountyActive(r) && r.bounty
        ? tr("{tier} · {pct} of fees + {n} USDT per qualified friend", { tier: r.tier?.name ?? "Partner", pct: sharePct(r.shareBps), n: trimZeros(r.bounty.amount) })
        : tr("{tier} · {pct} of fees", { tier: r.tier?.name ?? "Partner", pct: sharePct(r.shareBps) })
      : tr("{pct} of their fees · {n} joined", { pct: sharePct(r.shareBps), n: r.referredUsers });
  return (
    <Link href="/referrals" className="mt-3 flex items-center gap-3 rounded-lg bg-surface p-4 transition-opacity active:opacity-80">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/12 text-warning">
        <Icon icon={GiftIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-semibold">{tr("Invite friends")}</div>
        <div className="truncate text-label font-normal text-muted-foreground rtl:whitespace-normal">{line}</div>
      </div>
      {sign(earned) > 0 && <Amount value={earned!} unit="USDT" signed colored className="shrink-0 text-body-sm font-semibold" />}
      <Icon icon={ArrowRight01Icon} size={18} className="rtl:-scale-x-100 shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * The account without the Trial grant (GET /trader balances.nonTrialEquity): the grant never reads as the user's money, so Wallet
 * doesn't show it at all. What can be withdrawn is the server's number alone; a null valuation shows "—", never 0.
 */
function AccountBalance({ t }: { t: Trader }) {
  const b = t.balances;
  const block = withdrawalBlock(t);
  const profit = trialProfitLock(t.trialProfitProtection);
  const onTrial = !!t.trial && t.trial.status !== "converted";
  return (
    <>
      <div className="text-label text-white/75">{tr("Account balance")}</div>
      <div className="mt-1 text-display [overflow-wrap:anywhere]">
        {b.nonTrialEquity == null ? <span className="text-white/60">—</span> : <Amount value={b.nonTrialEquity} unit={t.asset} />}
      </div>
      {b.nonTrialEquity == null ? (
        <p className="text-caption text-white/75">{tr("Updating…")}</p>
      ) : (
        // a real zero: says why, so it doesn't read as money gone missing
        onTrial && sign(b.nonTrialEquity) === 0 && <p className="mt-0.5 text-caption text-white/75">{tr("Your free trial trades aren't money, so they aren't counted here.")}</p>
      )}

      <dl className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3 text-label text-white/75">
        <Line label={tr("Available to withdraw")} value={t.withdrawable} unit={t.asset} />
        {/* already in the balance, never added to it */}
        {profit && (
          <div>
            <Line label={tr("Trial profit awaiting funding")} value={profit.locked} unit={t.asset} />
            <p className="mt-0.5 text-caption text-white/75">{trialProfitFundingText(profit)}</p>
          </div>
        )}
        {sign(b.withdrawalReserved) > 0 && <Line label={tr("Withdrawal pending")} value={b.withdrawalReserved} unit={t.asset} />}
      </dl>
      {/* the trial-profit lock has its own row above */}
      {block && !(profit && t.withdrawalBlockedReason === "trial_profit_locked") && <p className={`mt-2 text-caption ${t.withdrawalBlockedReason === "trial_profit_locked" ? "text-white/80" : "text-warning"}`}>{block}</p>}
    </>
  );
}

function Line({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="min-w-0">{label}</dt>
      <dd dir="ltr" className="shrink-0 text-body-sm font-semibold text-white tabular-nums">
        {fmt(value)} {unit}
      </dd>
    </div>
  );
}

function depositTitle(code: string) {
  const t = tokenByCode(code);
  return t ? tr("{coin} on {network}", { coin: t.currency, network: networkInfo(t.network).name }) : tr("{code} deposit", { code: code.toUpperCase() });
}

function HistoryRow({
  href,
  onClick,
  icon,
  title,
  sub,
  children,
}: {
  href?: string;
  onClick?: () => void;
  icon: IconSvgElement;
  title: React.ReactNode;
  sub: string;
  children: React.ReactNode;
}) {
  const cls = "flex min-h-16 w-full items-center gap-3 py-3 text-start active:opacity-80";
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-foreground">
        <Icon icon={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-medium rtl:whitespace-normal">{title}</div>
        <div className="text-label font-normal text-muted-foreground">{sub}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">{children}</div>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}
