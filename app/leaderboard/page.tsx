"use client";
import { useEffect, useState } from "react";
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowDown02Icon, ArrowUp02Icon, ChartUpIcon, HourglassIcon, InboxIcon, StarIcon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { CommunityFeed, CommunityItem, FeedType, LeaderboardRange } from "@/lib/api/types";
import { fmtAgo } from "@/lib/format";
import { qk } from "@/lib/queries";
import { feedKey, feedRows, roiText, withdrawalState } from "@/lib/trader";
import { t, type Key } from "@/lib/i18n";
import { Stars } from "@/components/feedback/stars";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Amount, Card, EmptyState, ErrorState, ListSkeleton, Page, PageHeader } from "@/components/ui/primitives";

type Tab = "live" | "top" | "reviews" | "deposits" | "withdrawals";
/** Each list tab asks the server for its own type (none: Live's mixed feed); Top is the leaderboard. */
const LISTS: Record<Exclude<Tab, "top">, { type?: FeedType; empty: Key; icon: IconSvgElement }> = {
  live: { empty: "No activity yet", icon: ChartUpIcon },
  reviews: { type: "feedback", empty: "No reviews yet", icon: StarIcon },
  deposits: { type: "deposit", empty: "No deposits yet", icon: InboxIcon },
  withdrawals: { type: "withdrawal", empty: "No withdrawals yet", icon: InboxIcon },
};
const RANGES: { value: LeaderboardRange; label: Key }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
// top three stand out; palette tokens only
const MEDAL = ["bg-warning/16 text-warning", "bg-foreground/14 text-foreground", "bg-info/14 text-info"];
const POLL_MS = 8_000;

/**
 * What the community is doing: winning trades (ROI only), deposits, approved reviews and withdrawals as they happen, who has the
 * best return, and reviews, deposits and withdrawals on their own. Names come masked.
 */
export default function CommunityActivityPage() {
  const [tab, setTab] = useState<Tab>("live");
  return (
    <Page>
      <PageHeader title={t("Activity")} subtitle={t("Live community activity")} action={tab !== "top" && <Live />} />
      <Segmented
        layoutId="activity-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "live", label: t("Live") },
          { value: "top", label: t("Top") },
          { value: "reviews", label: t("Reviews") },
          { value: "deposits", label: t("Deposits") },
          { value: "withdrawals", label: t("Withdrawals") },
        ]}
      />
      <div className="mt-3">{tab === "top" ? <TopUsers /> : <Feed key={tab} {...LISTS[tab]} />}</div>
    </Page>
  );
}

function Live() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 pb-0.5 text-label text-primary">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary" />
        <span className="relative size-2 rounded-full bg-primary" />
      </span>
      {t("Live")}
    </span>
  );
}

/** "2m ago" keeps counting between refreshes. */
function useTick() {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);
}

/**
 * One list tab's pages by the server's opaque cursor, with its own filter, cursors and cache: a cursor never crosses tabs and a
 * late answer for another tab never lands here. While one page is loaded, polling reads it again from the top (no cursor). Once
 * more are loaded the chain stays as read (asOf is fixed along it) and a fresh first page is polled on its own and merged on top
 * by eventKey. Leaving the tab keeps only its first page, so coming back asks for one page, not the whole chain.
 */
function useFeedTab(type?: FeedType) {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: type ? qk.typeFeedPages(type) : qk.feedPages,
    queryFn: ({ pageParam, signal }) => API.communityFeed({ type, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    refetchInterval: (q) => ((q.state.data?.pages.length ?? 0) > 1 ? false : POLL_MS),
  });
  const chained = (q.data?.pages.length ?? 0) > 1;
  // Live's first page is the live bar's
  const head = useQuery({
    queryKey: type ? qk.typeFeed(type) : qk.feed,
    queryFn: ({ signal }) => API.communityFeed({ type, signal }),
    refetchInterval: POLL_MS,
    enabled: chained,
  });
  useEffect(
    () => () => {
      const key = type ? qk.typeFeedPages(type) : qk.feedPages;
      const d = qc.getQueryData<InfiniteData<CommunityFeed, string | undefined>>(key);
      // as stale as it was, so coming back refreshes it
      if (d && d.pages.length > 1)
        qc.setQueryData(key, { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) }, { updatedAt: qc.getQueryState(key)?.dataUpdatedAt });
    },
    [qc, type],
  );
  return { q, items: feedRows(type, chained ? head.data?.items : undefined, q.data?.pages) };
}

function More({ q }: { q: { hasNextPage: boolean; isFetchingNextPage: boolean; isFetchNextPageError: boolean; fetchNextPage: () => unknown } }) {
  if (!q.hasNextPage) return null;
  return (
    <>
      {/* the rows read so far stay; the same button tries again */}
      {q.isFetchNextPageError && !q.isFetchingNextPage && (
        <p role="alert" className="mt-3 px-1 text-caption text-destructive">
          {t("Couldn't load more. Check your connection and try again.")}
        </p>
      )}
      <Button variant="secondary" size="sm" block className="mt-3" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
        {t("Load more")}
      </Button>
    </>
  );
}

/**
 * Verified community activity, newest first: settled winning trades (each trade's ROI on its margin, never the amount), credited
 * deposits, approved reviews and withdrawals. Live is the mixed feed; Reviews, Deposits and Withdrawals each ask the server for
 * their own type, so they never depend on what Live's pages hold and older items are found too. One row per eventKey, so a
 * withdrawal turns from processing to confirmed in place. A curated list, so no win rate is read from it; types this build
 * doesn't know are left out.
 */
function Feed({ type, empty, icon }: { type?: FeedType; empty: Key; icon: IconSvgElement }) {
  const { q, items } = useFeedTab(type);
  useTick();
  return (
    <>
      {!type && <p className="mb-2 px-1 text-caption text-muted-foreground">{t("Verified activity · ROI on each trade's margin")}</p>}
      <List q={q} empty={empty} emptyIcon={icon}>
        {items.map((i) => (
          <FeedItem key={feedKey(i)} i={i} />
        ))}
      </List>
      {items.length > 0 && <More q={q} />}
    </>
  );
}

function FeedItem({ i }: { i: CommunityItem }) {
  if (i.type === "trade_profit")
    return (
      <FeedRow i={i} icon={ChartUpIcon} tone="bg-primary/12 text-primary" sub={t("Closed {coin} · {ago}", { coin: coinOf(i), ago: fmtAgo(i.occurredAt) })}>
        {i.roiPercent == null ? (
          <span className="shrink-0 text-caption text-muted-foreground">{t("ROI unavailable")}</span>
        ) : (
          <span dir="ltr" className="shrink-0 text-body-sm font-semibold text-primary tabular-nums">{roiText(i.roiPercent)}</span>
        )}
      </FeedRow>
    );
  if (i.type === "deposit") return <DepositRow i={i} />;
  if (i.type === "feedback") return <ReviewRow i={i} />;
  return <WithdrawalRow i={i} />;
}

/** An approved public review: the server's public copy as plain text, with its rating; a low one shows like any other. */
function ReviewRow({ i }: { i: CommunityItem }) {
  return (
    <FeedRow i={i} icon={StarIcon} tone="bg-warning/12 text-warning" sub={t("Review · {ago}", { ago: fmtAgo(i.occurredAt) })} body={i.text}>
      <Stars value={i.rating ?? 0} />
    </FeedRow>
  );
}

/** A real credited deposit, in USDT: money in, never a profit. */
function DepositRow({ i }: { i: CommunityItem }) {
  return (
    <FeedRow i={i} icon={ArrowDown02Icon} tone="bg-primary/12 text-primary" sub={t("Deposited · {ago}", { ago: fmtAgo(i.occurredAt) })}>
      <span className="shrink-0 text-body-sm font-semibold text-primary tabular-nums">
        <Amount value={i.amount!} unit={i.asset ?? "USDT"} />
      </span>
    </FeedRow>
  );
}

/**
 * A confirmed withdrawal, or one still on its way (queued, signed or broadcast: never called sent or successful). The amount is
 * the net sent; the row updates in place when it confirms.
 */
function WithdrawalRow({ i }: { i: CommunityItem }) {
  const processing = withdrawalState(i) === "processing";
  return (
    <FeedRow
      i={i}
      icon={processing ? HourglassIcon : ArrowUp02Icon}
      tone="bg-info/12 text-info"
      sub={t(processing ? "Withdrawal processing · {ago}" : "Withdrew · {ago}", { ago: fmtAgo(i.occurredAt) })}
    >
      {/* money out reads blue, as everywhere else in the app */}
      <span className="shrink-0 text-body-sm font-semibold text-info tabular-nums">
        <Amount value={i.amount!} unit={i.asset ?? "USDT"} />
      </span>
    </FeedRow>
  );
}

const coinOf = (i: CommunityItem) => i.symbol?.replace(/USDT$/, "") ?? t("a trade");

function List({
  q,
  empty,
  emptyIcon,
  children,
}: {
  q: { isPending: boolean; isError: boolean; data?: unknown; error: unknown; refetch: () => unknown };
  empty: Key;
  emptyIcon: IconSvgElement;
  children: React.ReactNode[];
}) {
  if (q.isPending) return <ListSkeleton rows={6} />;
  if (q.isError && !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!children.length) return <EmptyState icon={<Icon icon={emptyIcon} size={28} />} title={t(empty)} />;
  return (
    <Card className="overflow-hidden px-4">
      <ul>
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </Card>
  );
}

function FeedRow({
  i,
  icon,
  tone,
  sub,
  body,
  children,
}: {
  i: CommunityItem;
  icon: IconSvgElement;
  tone: string;
  sub: string;
  body?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
      className={`flex min-h-14 gap-3 border-b border-border py-2.5 last:border-b-0 ${body ? "items-start" : "items-center"}`}
    >
      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${tone}`}>
        <Icon icon={icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-body-sm font-semibold"><bdi>{i.name}</bdi></div>
            <div className="truncate text-caption text-muted-foreground rtl:whitespace-normal">{sub}</div>
          </div>
          {children}
        </div>
        {body && <p dir="auto" className="mt-1 line-clamp-4 whitespace-pre-line break-words text-caption text-foreground/85">{body}</p>}
      </div>
    </motion.li>
  );
}

/** The server's ranking by account ROI (settled wins and losses, fees and funding); its rank is kept as is, never re-sorted by amount. */
function TopUsers() {
  const [range, setRange] = useState<LeaderboardRange>("today");
  const q = useQuery({ queryKey: qk.leaderboard(range), queryFn: () => API.leaderboard(range), placeholderData: keepPreviousData, refetchInterval: 60_000 });

  return (
    <>
      <Segmented layoutId="activity-range" value={range} onChange={setRange} options={RANGES.map((r) => ({ ...r, label: t(r.label) }))} />
      <div className={`mt-3 transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
        {q.isPending ? (
          <ListSkeleton rows={6} />
        ) : q.isError && !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data.items.length ? (
          <EmptyState icon={<Icon icon={UserMultipleIcon} size={28} />} title={t("No ranked users in this period yet")} />
        ) : (
          <Card className="divide-y divide-border px-4">
            {q.data.items.map((r) => (
              <div key={r.rank} className="flex min-h-15 items-center gap-3 py-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-label font-bold tabular-nums ${MEDAL[r.rank - 1] ?? "bg-surface-raised text-muted-foreground"}`}>
                  {r.rank}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-sm font-semibold"><bdi>{r.name}</bdi></div>
                  <div className="text-caption text-muted-foreground tabular-nums">
                    {t(r.trades === 1 ? "{n} trade" : "{n} trades", { n: r.trades })}
                  </div>
                </div>
                <span dir="ltr" className="shrink-0 text-body-sm font-semibold text-primary tabular-nums">{roiText(r.roiPercent)}</span>
              </div>
            ))}
          </Card>
        )}
      </div>
      <p className="mt-3 px-1 text-caption text-muted-foreground">
        {t(range === "today" ? "Ranked by account return on settled trades, after losses, fees and funding. Today starts at 00:00 UTC." : "Ranked by account return on settled trades, after losses, fees and funding.")}
      </p>
    </>
  );
}
