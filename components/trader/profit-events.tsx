"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import type { TraderEvent } from "@/lib/api/types";
import { sign } from "@/lib/money";
import { fmtAgo } from "@/lib/format";
import { qk } from "@/lib/queries";
import { positionRoi } from "@/lib/trader";
import { haptic } from "@/lib/telegram";

// The cursor lives for the session (module scope), so leaving Home and coming back doesn't replay profits;
// a reload starts again from "latest". It's opaque: only ever passed back to the server.
let cursor: string | null = null;
let lastPollAt = 0;
const seen = new Set<string>();

const POLL_MS = 7_000;
/** After this long away (background or another screen), skip what happened meanwhile instead of replaying it. */
const STALE_MS = 2 * 60_000;
/** The server's page size: a full page means more is waiting behind the same cursor. */
const PAGE = 100;
const MAX_PAGES = 10;
const MAX_BUBBLES = 6;

/** Forget the cursor and seen ids; called on logout / session end. */
export function resetProfitEvents() {
  cursor = null;
  lastPollAt = 0;
  seen.clear();
}

function remember(id: string) {
  seen.add(id);
  // insertion order: drop the oldest once the set gets long
  if (seen.size > 1000) for (const old of [...seen].slice(0, 500)) seen.delete(old);
}

/** Polls GET /trader/events while the app is visible and `enabled`, and calls `onEvents` with the new, de-duplicated items. */
function useTraderEvents(onEvents: (items: TraderEvent[]) => void, enabled: boolean) {
  const cb = useRef(onEvents);
  useEffect(() => {
    cb.current = onEvents;
  });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (Date.now() - lastPollAt > STALE_MS) cursor = null;

    const schedule = () => {
      clearTimeout(timer);
      if (!stopped && !document.hidden) timer = setTimeout(tick, POLL_MS);
    };

    async function tick() {
      if (stopped || running || document.hidden) return;
      running = true;
      try {
        if (cursor == null) {
          // first look: just take the current position, old profits are not animated
          cursor = (await API.traderEvents("latest")).nextAfter;
        } else {
          const fresh: TraderEvent[] = [];
          for (let n = 0; n < MAX_PAGES; n++) {
            const page = await API.traderEvents(cursor);
            if (stopped) return;
            cursor = page.nextAfter;
            for (const e of page.items)
              if (!seen.has(e.id)) {
                remember(e.id);
                fresh.push(e);
              }
            if (page.items.length < PAGE) break;
          }
          if (fresh.length) cb.current(fresh);
        }
        lastPollAt = Date.now();
      } catch {
        // keep the cursor and try again on the next tick
      } finally {
        running = false;
        schedule();
      }
    }

    const onVisibility = () => {
      if (document.hidden) return clearTimeout(timer);
      if (Date.now() - lastPollAt > STALE_MS) cursor = null;
      tick();
    };

    tick();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);
}

/** A real profit on its way up: `delay` staggers bubbles that arrive together. */
export type ProfitBubble = TraderEvent & { delay: number };

/**
 * Real settled profits as bubbles; each removes itself with `done` once it has popped. Only settled trades with a
 * positive net animate, and the balance is always reread from GET /trader, never summed from these amounts. Polls only while `enabled`.
 */
export function useProfitBubbles(enabled = true) {
  const qc = useQueryClient();
  const [bubbles, setBubbles] = useState<ProfitBubble[]>([]);

  useTraderEvents((items) => {
    qc.invalidateQueries({ queryKey: qk.trader });
    // a bubble shows the ROI, never the amount, so a profit without one isn't animated
    const wins = items.filter((e) => e.type === "trade_profit" && sign(e.amount) > 0 && e.roiPercent != null).slice(-MAX_BUBBLES);
    if (!wins.length) return;
    haptic.success();
    setBubbles((b) => [...b, ...wins.map((e, n) => ({ ...e, delay: n * 0.45 }))].slice(-MAX_BUBBLES));
  }, enabled);

  const done = useCallback((id: string) => setBubbles((b) => b.filter((x) => x.id !== id)), []);
  return { bubbles, done };
}

/** One of this account's own recent profits as its ROI, replayed with its coin and age so it never reads as a new one. */
export type RecentBubble = { key: string; roi: string; coin: string; when: string; side: 1 | -1 };

const RECENT_FIRST_MS = 1_200;
const RECENT_STEP_MS = 3_000;
const MAX_RECENT_BUBBLES = 2;

/**
 * This account's own settled profits from the last 7 days (closed trades with a positive net), one bubble every few
 * seconds while Home is visible: newest first, then straight round again, for as long as Home is open. Each carries its coin and how long ago it
 * closed, so a replay never reads as a new profit; brand-new ones still arrive through useProfitBubbles. Holds off while
 * `busy` (a new profit is rising) and does nothing unless `enabled`.
 */
export function useRecentProfitBubbles(instanceId: string, enabled: boolean, busy: boolean) {
  const q = useQuery({
    queryKey: [...qk.positions("closed", instanceId, "7d"), "recent-wins"],
    queryFn: () => API.positions({ status: "closed", instanceId, range: "7d", limit: 20 }),
    enabled,
    staleTime: 60_000,
  });
  const [bubbles, setBubbles] = useState<RecentBubble[]>([]);
  const latest = useRef({ items: q.data?.items, busy });
  useEffect(() => {
    latest.current = { items: q.data?.items, busy };
  });

  useEffect(() => {
    if (!enabled) return;
    const shown = new Set<string>();
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      timer = setTimeout(tick, RECENT_STEP_MS);
      const { items, busy } = latest.current;
      if (document.hidden || busy) return;
      // the list is newest first; a trade still waiting on funding isn't final yet
      const wins = (items ?? []).filter((p) => p.closed_at && sign(p.net_pnl) > 0 && (p.funding_state ?? "settled") === "settled" && positionRoi(p) != null);
      if (!wins.length) return;
      let pick = wins.find((p) => !shown.has(p.id));
      if (!pick) {
        // every one has had its bubble: start over from the newest
        shown.clear();
        pick = wins[0];
      }
      shown.add(pick.id);
      const b: RecentBubble = {
        key: `${pick.id}:${n}`,
        roi: positionRoi(pick)!,
        coin: pick.symbol.replace(/USDT$/, ""),
        when: fmtAgo(pick.closed_at),
        side: n % 2 ? 1 : -1,
      };
      n++;
      setBubbles((all) => [...all, b].slice(-MAX_RECENT_BUBBLES));
    };

    timer = setTimeout(tick, RECENT_FIRST_MS);
    return () => clearTimeout(timer);
  }, [enabled]);

  const done = useCallback((key: string) => setBubbles((b) => b.filter((x) => x.key !== key)), []);
  return { bubbles: enabled ? bubbles : [], done };
}
