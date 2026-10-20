"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Add01Icon, ArrowRight01Icon, Invoice03Icon, Notification03Icon, Robot01Icon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { telegramUser } from "@/lib/api/session";
import { cmp } from "@/lib/money";
import { valuationNotes } from "@/lib/valuation";
import { qk, useHealth, useInstances, useLedgerSync, useStatement, useWallet } from "@/lib/queries";
import { BalanceCard } from "@/components/balance-card";
import { InstanceTile } from "@/components/agents/shared";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { ActivityItem } from "@/components/activity-item";
import { PositionCard } from "@/components/trading/position-card";
import { useSession } from "@/components/shell/boot-gate";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Amount, Card, EmptyState, ErrorState, ListSkeleton, Page, Pill, SectionTitle, Skeleton, Stat } from "@/components/ui/primitives";

export default function Dashboard() {
  const { user } = useSession();
  const wallet = useWallet();
  const instances = useInstances(true);
  const statement = useStatement("30d");
  const positions = useQuery({ queryKey: qk.positions("open"), queryFn: () => API.positions({ status: "open", limit: 3 }), refetchInterval: 15_000 });
  const activity = useQuery({ queryKey: qk.activity(), queryFn: () => API.activity({ page: 1 }) });

  const live = (instances.data ?? []).filter((i) => !["stopped", "expired"].includes(i.status));
  const fresh = wallet.data && cmp(wallet.data.available, "0") === 0 && instances.data?.length === 0;
  const names = Object.fromEntries((instances.data ?? []).map((i) => [i.id, i.name]));
  // a trade opening/closing or funding settling on any agent moves the balance: reread it from the server
  useLedgerSync(instances.data ? instances.data.map((i) => `${i.id}:${i.status}:${i.openPositions}:${i.pendingOrders}:${i.funding_reserved ?? ""}`).join("|") : null);

  return (
    <Page>
      <TopBar name={user.name} />
      <BalanceCard wallet={wallet} />

      {fresh && <Onboarding />}

      <SectionTitle href="/agents/mine">Your agents</SectionTitle>
      {instances.isPending ? (
        <div className="flex gap-3 overflow-hidden" aria-busy aria-label="Loading agents">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-40 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : instances.isError ? (
        <ErrorState error={instances.error} onRetry={() => instances.refetch()} />
      ) : live.length ? (
        <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 min-[390px]:-mx-5 min-[390px]:px-5">
          {live.map((i, n) => (
            <motion.div key={i.id} className="snap-start" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: n * 0.03, duration: 0.2 }}>
              <InstanceTile inst={i} />
            </motion.div>
          ))}
          <Link
            href="/agents#choose"
            className="flex w-40 shrink-0 snap-start flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-label text-muted-foreground active:text-foreground"
          >
            <span className="grid size-10 place-items-center rounded-full bg-surface-raised text-foreground">
              <Icon icon={Add01Icon} />
            </span>
            New agent
          </Link>
        </div>
      ) : (
        <EmptyState
          icon={<Icon icon={Robot01Icon} size={28} />}
          title="No agents running"
          action={
            <Button as="a" href="/agents#choose" size="sm" icon={<Icon icon={Add01Icon} size={16} />}>
              Browse agents
            </Button>
          }
        />
      )}

      <SectionTitle href="/statements" linkLabel="Statement">
        Last 30 days
      </SectionTitle>
      {statement.isPending ? (
        <Skeleton className="h-40 rounded-lg" />
      ) : statement.isError ? (
        <ErrorState error={statement.error} onRetry={() => statement.refetch()} />
      ) : (
        <Card className="grid grid-cols-2 gap-x-4 gap-y-5 p-4">
          <Stat label="Balance" hint="Excl. open trades">
            <Amount value={statement.data.bookedEquity} unit="USDT" />
          </Stat>
          <Stat
            label="Total value"
            hint={
              statement.data.valuation.status === "complete" ? (
                "Incl. open trades"
              ) : (
                <Pill tone={statement.data.valuation.status === "partial" ? "pending" : "bad"}>
                  {(() => {
                    const n = valuationNotes(statement.data);
                    return n.prices ? (statement.data.valuation.status === "partial" ? "Some prices missing" : "Prices unavailable") : "Funding being checked";
                  })()}
                </Pill>
              )
            }
          >
            <Amount value={statement.data.equity} unit="USDT" />
          </Stat>
          <Stat label="Realized PnL" hint={`${statement.data.realized.closed_trades} trades`}>
            <Amount value={statement.data.realized.realized_net} unit="USDT" signed colored />
          </Stat>
          <Stat label="Open PnL">
            <Amount value={statement.data.unrealizedNetEstimate} unit="USDT" signed colored />
          </Stat>
        </Card>
      )}

      {!!positions.data?.items.length && (
        <>
          <SectionTitle href="/statements">Open trades</SectionTitle>
          <div className="flex flex-col gap-2">
            {positions.data.items.map((p) => (
              <PositionCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}

      <SectionTitle href="/activity">Recent activity</SectionTitle>
      {activity.isPending ? (
        <ListSkeleton rows={3} />
      ) : activity.isError ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : activity.data.items.length ? (
        <Card className="divide-y divide-border px-4">
          {activity.data.items.slice(0, 5).map((j) => (
            <ActivityItem key={j.id} j={j} names={names} />
          ))}
        </Card>
      ) : (
        <EmptyState icon={<Icon icon={Invoice03Icon} size={28} />} title="No activity yet" />
      )}
    </Page>
  );
}

function TopBar({ name }: { name: string }) {
  const health = useHealth();
  const photo = telegramUser()?.photo_url;
  const engine = health.data?.agentEngine;
  const tone = engine ? (engine.connected && engine.entriesEnabled ? "bg-primary" : engine.connected ? "bg-warning" : "bg-destructive") : "";
  return (
    <header className="flex items-center justify-between gap-3 pb-4 pt-4">
      <Link href="/profile" className="flex min-w-0 items-center gap-3" aria-label="Profile">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-body font-semibold">{name.slice(0, 1).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-0.5 text-body font-semibold">
            <span className="truncate">{name}</span>
            <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-muted-foreground" />
          </div>
          {engine && (
            <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <span className={`size-1.5 rounded-full ${tone}`} />
              {engine.connected ? (engine.entriesEnabled ? "Trading on" : "New trades paused") : "Trading offline"}
            </div>
          )}
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

function Onboarding() {
  const openDeposit = useOpenDeposit();
  const steps: { title: string; body: string; href?: string }[] = [
    { title: "Deposit", body: "Any token, held as USDT" },
    { title: "Pick an agent", body: "Set its budget", href: "/agents#choose" },
    { title: "Track results", body: "Every trade, live", href: "/statements" },
  ];
  return (
    <>
      <SectionTitle>Get started</SectionTitle>
      <Card className="p-2">
        <ol>
          {steps.map((s, i) => {
            const cls = "flex w-full items-center gap-3 rounded-md p-3 text-left active:bg-surface-raised";
            const inner = (
              <>
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-body-sm font-semibold ${i === 0 ? "bg-primary text-primary-foreground" : "bg-surface-raised text-muted-foreground"}`}
                >
                  {i + 1}
                </span>
                <div>
                  <div className="text-body-sm font-semibold">{s.title}</div>
                  <div className="text-label font-normal text-muted-foreground">{s.body}</div>
                </div>
              </>
            );
            return (
              <li key={s.title}>
                {s.href ? (
                  <Link href={s.href} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button type="button" onClick={() => openDeposit()} className={cls}>
                    {inner}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </Card>
    </>
  );
}
