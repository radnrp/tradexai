"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowDown02Icon, ArrowRight01Icon, ArrowUp02Icon, GiftIcon, InboxIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { fmtDateTime, shortAddr } from "@/lib/format";
import { depositStatus, withdrawalStatus } from "@/lib/labels";
import { fmt, sign } from "@/lib/money";
import { qk, useReferrals, useTrader } from "@/lib/queries";
import { withdrawalBlock } from "@/lib/trader";
import { Button } from "@/components/ui/button";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { useOpenWithdraw } from "@/components/withdraw/withdraw-sheet";
import { networkInfo, tokenByCode } from "@/components/deposit/options";
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
      <PageHeader title="Wallet" />
      <Card hero className="p-5">
        <div className="text-label text-white/75">Withdrawable</div>
        {trader.isPending ? (
          <div className="mt-2 h-9.5 w-48 animate-pulse rounded-md bg-white/10" aria-busy aria-label="Loading balance" />
        ) : !trader.data ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-body-sm text-white/85">Couldn&apos;t load balance</p>
            <button type="button" onClick={() => trader.refetch()} className="h-9 shrink-0 rounded-full bg-white/12 px-3 text-label">
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="mt-2 text-display">
              <Amount value={trader.data.withdrawable} unit={trader.data.asset} />
            </div>
            {/* parts of the same account, not separate wallets */}
            <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label text-white/75">
              <div className="flex gap-1">
                {/* with no live valuation it's the booked figure, labelled as such rather than a zero */}
                <dt>{trader.data.equity != null ? "Account value" : "Booked value"}</dt>
                <dd className="font-semibold text-white tabular-nums">{fmt(trader.data.equity ?? trader.data.bookedEquity)} {trader.data.asset}</dd>
              </div>
              {sign(trader.data.trialPrincipalRemaining) > 0 && (
                <div className="flex gap-1">
                  <dt>Trial fund, not withdrawable</dt>
                  <dd className="font-semibold text-white tabular-nums">{fmt(trader.data.trialPrincipalRemaining)} {trader.data.asset}</dd>
                </div>
              )}
            </dl>
            {withdrawalBlock(trader.data) && <p className="mt-2 text-caption text-warning">{withdrawalBlock(trader.data)}</p>}
          </>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button onClick={() => openDeposit()} icon={<Icon icon={ArrowDown02Icon} size={18} />}>
            Deposit
          </Button>
          <Button onClick={() => openWithdraw()} variant="secondary" className="bg-white/12! text-white!" icon={<Icon icon={ArrowUp02Icon} size={18} />}>
            Withdraw
          </Button>
        </div>
      </Card>

      <InviteRow />

      <SectionTitle href="/activity" linkLabel="All activity">
        History
      </SectionTitle>
      <Segmented layoutId="wallet-tab" value={tab} onChange={setTab} options={[{ value: "deposits", label: "Deposits" }, { value: "withdrawals", label: "Withdrawals" }]} />
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
                const s = late ? { label: "Time's up", tone: "pending" as const } : depositStatus(d.status);
                return (
                  <HistoryRow key={d.id} onClick={() => openDeposit(d.id)} icon={ArrowDown02Icon} title={depositTitle(d.pay_currency)} sub={fmtDateTime(d.created_at ?? null)}>
                    <Amount value={d.credited_amount ?? d.requested_usd} unit={d.credited_amount ? "USDT" : "USD"} className="text-body-sm font-semibold" />
                    <Pill tone={s.tone}>{s.label}</Pill>
                  </HistoryRow>
                );
              })}
            </Card>
          ) : (
            <EmptyState icon={<Icon icon={InboxIcon} size={28} />} title="No deposits yet" />
          )
        ) : withdrawals.data?.length ? (
          <Card className="divide-y divide-border px-4">
            {withdrawals.data.map((w) => {
              const s = withdrawalStatus(w.status);
              return (
                <HistoryRow key={w.id} onClick={() => openWithdraw(w.id)} icon={ArrowUp02Icon} title={`To ${shortAddr(w.address, 4)}`} sub={fmtDateTime(w.created_at)}>
                  <Amount value={w.amount} unit="USDT" className="text-body-sm font-semibold" />
                  <Pill tone={s.tone}>{s.label}</Pill>
                </HistoryRow>
              );
            })}
          </Card>
        ) : (
          <EmptyState icon={<Icon icon={InboxIcon} size={28} />} title="No withdrawals yet" />
        )}
      </div>
    </Page>
  );
}

/** The referral program in one row; the full page (link, sharing, friends) is behind it. */
function InviteRow() {
  const q = useReferrals();
  const r = q.data;
  return (
    <Link href="/referrals" className="mt-3 flex items-center gap-3 rounded-lg bg-surface p-4 transition-opacity active:opacity-80">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/12 text-warning">
        <Icon icon={GiftIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-semibold">Invite friends</div>
        <div className="truncate text-label font-normal text-muted-foreground">
          {r ? `${r.shareBps / 100}% of their fees · ${r.referredUsers} joined` : "Earn from friends' trading fees"}
        </div>
      </div>
      {r && sign(r.earned) > 0 && <Amount value={r.earned} unit="USDT" signed colored className="shrink-0 text-body-sm font-semibold" />}
      <Icon icon={ArrowRight01Icon} size={18} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

function depositTitle(code: string) {
  const t = tokenByCode(code);
  return t ? `${t.currency} on ${networkInfo(t.network).name}` : `${code.toUpperCase()} deposit`;
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
  title: string;
  sub: string;
  children: React.ReactNode;
}) {
  const cls = "flex min-h-16 w-full items-center gap-3 py-3 text-left active:opacity-80";
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-foreground">
        <Icon icon={icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-medium">{title}</div>
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
