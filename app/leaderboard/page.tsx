"use client";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp02Icon, Award01Icon, ChartUpIcon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { CommunityItem, LeaderboardRange } from "@/lib/api/types";
import { fmtAgo } from "@/lib/format";
import { qk } from "@/lib/queries";
import { Chip, Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Amount, Card, EmptyState, ErrorState, ListSkeleton, Page, PageHeader } from "@/components/ui/primitives";

type View = "activity" | "top";
type Filter = "all" | "profits" | "withdrawals";
const RANGES: { value: LeaderboardRange; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
// top three stand out; palette tokens only
const MEDAL = ["bg-warning/16 text-warning", "bg-foreground/14 text-foreground", "bg-info/14 text-info"];
const POLL_MS = 8_000;

/** Everything the community is doing (profits and withdrawals, live), and who made the most. Names come masked from the server. */
export default function LeaderboardPage() {
  const [view, setView] = useState<View>("activity");
  return (
    <Page>
      <PageHeader title="Leaderboard" subtitle="Community activity and top profits" />
      <Segmented
        layoutId="leader-view"
        value={view}
        onChange={setView}
        options={[
          { value: "activity", label: "Activity" },
          { value: "top", label: "Top profits" },
        ]}
      />
      <div className="mt-4">{view === "activity" ? <Activity /> : <TopProfits />}</div>
    </Page>
  );
}

/**
 * All users' settled profits and confirmed withdrawals, newest first, refreshed every few seconds; new ones slide in on top.
 * "Withdrawals" reads its own endpoint so withdrawals aren't crowded out of the mixed feed by trades.
 */
function Activity() {
  const [filter, setFilter] = useState<Filter>("all");
  const feed = useQuery({ queryKey: qk.feed, queryFn: API.communityFeed, refetchInterval: POLL_MS, enabled: filter !== "withdrawals" });
  const outs = useQuery({ queryKey: qk.communityWithdrawals, queryFn: API.communityWithdrawals, refetchInterval: POLL_MS, enabled: filter === "withdrawals" });
  const q = filter === "withdrawals" ? outs : feed;
  // "2m ago" keeps counting between refreshes
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  const items = (q.data?.items ?? []).filter((i) => filter !== "profits" || i.type === "trade_profit");

  return (
    <>
      <div className="flex items-center gap-2">
        {(
          [
            ["all", "All"],
            ["profits", "Profits"],
            ["withdrawals", "Withdrawals"],
          ] as const
        ).map(([v, label]) => (
          <Chip key={v} active={filter === v} onClick={() => setFilter(v)}>
            {label}
          </Chip>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5 text-label text-primary">
          <span className="relative flex size-2" aria-hidden>
            <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary" />
            <span className="relative size-2 rounded-full bg-primary" />
          </span>
          Live
        </span>
      </div>

      <div className="mt-3">
        {q.isPending ? (
          <ListSkeleton rows={6} />
        ) : q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !items.length ? (
          <EmptyState icon={<Icon icon={UserMultipleIcon} size={28} />} title="No activity yet" />
        ) : (
          <Card className="overflow-hidden px-4">
            <ul>
              <AnimatePresence initial={false}>
                {items.map((i) => (
                  <ActivityRow key={`${i.type}:${i.id}`} i={i} />
                ))}
              </AnimatePresence>
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}

function ActivityRow({ i }: { i: CommunityItem }) {
  const out = i.type === "withdrawal";
  const coin = i.symbol?.replace(/USDT$/, "");
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      className="flex min-h-14 items-center gap-3 border-b border-border py-2.5 last:border-b-0"
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${out ? "bg-info/12 text-info" : "bg-primary/12 text-primary"}`}>
        <Icon icon={out ? ArrowUp02Icon : ChartUpIcon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-semibold">{i.name}</div>
        <div className="truncate text-caption text-muted-foreground">
          {out ? "Withdrew" : `Profit${coin ? ` on ${coin}` : ""}`} · {fmtAgo(i.occurredAt)}
        </div>
      </div>
      {/* money out reads blue, money earned green, as everywhere else in the app */}
      {out ? (
        <span className="shrink-0 text-body-sm font-semibold text-info tabular-nums">
          <Amount value={i.amount} unit={i.asset} />
        </span>
      ) : (
        <Amount value={i.amount} unit={i.asset} signed colored className="shrink-0 text-body-sm font-semibold" />
      )}
    </motion.li>
  );
}

/** Ranked by net profit for the period: every settled win and loss, fees and funding. */
function TopProfits() {
  const [range, setRange] = useState<LeaderboardRange>("today");
  const q = useQuery({ queryKey: qk.leaderboard(range), queryFn: () => API.leaderboard(range), placeholderData: keepPreviousData, refetchInterval: 60_000 });

  return (
    <>
      <Segmented layoutId="leader-range" value={range} onChange={setRange} options={RANGES} />
      <div className={`mt-3 transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
        {q.isPending ? (
          <ListSkeleton rows={6} />
        ) : q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data.items.length ? (
          <EmptyState icon={<Icon icon={Award01Icon} size={28} />} title="No profits in this period yet" />
        ) : (
          <Card className="divide-y divide-border px-4">
            {q.data.items.map((r) => (
              <div key={r.rank} className="flex min-h-15 items-center gap-3 py-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-label font-bold tabular-nums ${MEDAL[r.rank - 1] ?? "bg-surface-raised text-muted-foreground"}`}>
                  {r.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-sm font-semibold">{r.name}</div>
                  <div className="text-caption text-muted-foreground tabular-nums">
                    {r.trades} trade{r.trades === 1 ? "" : "s"}
                  </div>
                </div>
                <Amount value={r.net} unit="USDT" signed colored className="shrink-0 text-body-sm font-semibold" />
              </div>
            ))}
          </Card>
        )}
      </div>
      <p className="mt-3 px-1 text-caption text-muted-foreground">
        Net profit after losses, fees and funding.{range === "today" ? " Today starts at 00:00 UTC." : ""}
      </p>
    </>
  );
}
