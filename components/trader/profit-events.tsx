"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import type { TraderEvent } from "@/lib/api/types";
import { sign } from "@/lib/money";
import { qk } from "@/lib/queries";
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

/** Polls GET /trader/events while the app is visible and calls `onEvents` with the new, de-duplicated items. */
function useTraderEvents(onEvents: (items: TraderEvent[]) => void) {
  const cb = useRef(onEvents);
  useEffect(() => {
    cb.current = onEvents;
  });

  useEffect(() => {
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
  }, []);
}

/** A real profit on its way up: `delay` staggers bubbles that arrive together. */
export type ProfitBubble = TraderEvent & { delay: number };

/**
 * Real settled profits as bubbles; each removes itself with `done` once it has popped. Only settled trades with a
 * positive net animate, and the balance is always reread from GET /trader, never summed from these amounts.
 */
export function useProfitBubbles() {
  const qc = useQueryClient();
  const [bubbles, setBubbles] = useState<ProfitBubble[]>([]);

  useTraderEvents((items) => {
    qc.invalidateQueries({ queryKey: qk.trader });
    const wins = items.filter((e) => e.type === "trade_profit" && sign(e.amount) > 0).slice(-MAX_BUBBLES);
    if (!wins.length) return;
    haptic.success();
    setBubbles((b) => [...b, ...wins.map((e, n) => ({ ...e, delay: n * 0.45 }))].slice(-MAX_BUBBLES));
  });

  const done = useCallback((id: string) => setBubbles((b) => b.filter((x) => x.id !== id)), []);
  return { bubbles, done };
}
