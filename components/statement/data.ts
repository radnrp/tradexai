"use client";
import { useEffect, useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import type { Position, Range, Row, Statement } from "@/lib/api/types";
import { pick, utcDayKey } from "@/lib/format";
import { add } from "@/lib/money";
import { qk } from "@/lib/queries";

// shortcut: the stats are computed in the app from up to 10 pages (500 trades); past that they cover the
// latest 500 only. Upgrade when the backend returns these stats itself.
const AUTO_PAGES = 10;

/** Closed trades for the period, loaded page by page in the background. Shared by Overview and Trades. */
export function useClosedTrades(range: Range, agent?: string) {
  const q = useInfiniteQuery({
    queryKey: [...qk.positions("closed", agent, range), "infinite"],
    queryFn: ({ pageParam }) => API.positions({ status: "closed", instanceId: agent, range, page: pageParam, limit: 50 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const pages = q.data?.pages.length ?? 0;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && pages < AUTO_PAGES) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, pages, fetchNextPage]);

  const trades = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  return { q, trades, total: q.data?.pages[0]?.total ?? 0, loadingMore: !!hasNextPage && pages < AUTO_PAGES };
}

/** Net result per day: the server's daily rows when it sends them, otherwise summed from trades. */
export function dailyNet(daily: Statement["daily"], trades: Position[]): { day: string; net: string }[] {
  const m = new Map<string, string>();
  for (const row of daily as Row[]) {
    const d = pick<string>(row, ["date", "day", "bucket"]);
    const net = pick<string | number>(row, ["realized_net", "realizedNet", "net"]);
    if (d && net != null) m.set(String(d).slice(0, 10), String(net));
  }
  if (!m.size)
    for (const p of trades) {
      if (p.net_pnl == null) continue;
      const k = utcDayKey(p.closed_at ?? p.opened_at);
      m.set(k, add(m.get(k) ?? "0", p.net_pnl));
    }
  return [...m].map(([day, net]) => ({ day, net })).sort((a, b) => a.day.localeCompare(b.day));
}

/** Equity values from the hourly history, oldest first (display only). */
export const equityValues = (rows: Row[]) =>
  rows
    .map((r) => ({ t: new Date(pick<string>(r, ["captured_at", "capturedAt", "bucket"]) ?? 0).getTime(), v: pick<string>(r, ["equity", "booked_equity", "bookedEquity"]) }))
    .filter((p) => p.t > 0 && p.v != null)
    .sort((a, b) => a.t - b.t)
    .map((p) => Number(p.v));
