"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { IconSvgElement } from "@hugeicons/react";
import { ArrowDown02Icon, ArrowUp02Icon, ChartUpIcon, HourglassIcon, StarIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { t } from "@/lib/i18n";
import { qk, useAfterTrader } from "@/lib/queries";
import { dedupeFeed, feedKey, tickerLine, type TickerLine } from "@/lib/trader";
import { Icon } from "@/components/ui/icon";

const POLL_MS = 10_000;
/** How long each line stays before the next one slides in. */
const STEP_MS = 3_500;
const MAX_LINES = 10;
// money out reads blue, a profit's ROI and a deposit green, a review amber, as everywhere else in the app
const LOOK: Record<TickerLine["kind"], { icon: IconSvgElement; badge: string; value: string }> = {
  profit: { icon: ChartUpIcon, badge: "bg-primary/15 text-primary", value: "text-primary" },
  deposit: { icon: ArrowDown02Icon, badge: "bg-primary/15 text-primary", value: "text-primary" },
  withdrawal: { icon: ArrowUp02Icon, badge: "bg-info/15 text-info", value: "text-info" },
  feedback: { icon: StarIcon, badge: "bg-warning/15 text-warning", value: "text-warning" },
};

/**
 * A slim bar at the top of every screen (it scrolls away with the page): other users' recent settled profits, deposits, approved reviews and withdrawals (confirmed, or on their way),
 * one line at a time sliding up. Quiet by design (no toasts, no sound, no focus); tapping it opens the community Activity.
 * Hidden while there's nothing from the last 24 hours.
 */
export function LiveTicker() {
  // the screen's own /trader goes first: on the server this would only queue ahead of it
  const after = useAfterTrader();
  // React Query pauses polling in the background; the community Activity list shares this cache
  const q = useQuery({ queryKey: qk.feed, queryFn: () => API.communityFeed(), refetchInterval: POLL_MS, enabled: after });
  const [now, setNow] = useState(() => Date.now());
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      setNow(Date.now());
      setStep((n) => n + 1);
    }, STEP_MS);
    return () => clearInterval(t);
  }, []);

  const lines = useMemo(
    () =>
      // one key per withdrawal, so "is withdrawing" turns into "withdrew" in place instead of showing twice
      dedupeFeed(q.data?.items ?? [])
        .map((i) => ({ key: feedKey(i), line: tickerLine(i, now) }))
        .filter((x): x is { key: string; line: NonNullable<typeof x.line> } => x.line != null)
        .slice(0, MAX_LINES),
    [q.data, now],
  );

  // something new arrived on top: show it next instead of finishing the old loop
  const top = lines[0]?.key;
  const [seenTop, setSeenTop] = useState(top);
  const [offset, setOffset] = useState(0);
  if (top !== seenTop) {
    setSeenTop(top);
    setOffset(step);
  }

  if (!lines.length) return null;
  const cur = lines[(step - offset) % lines.length];
  const l = cur.line;
  const look = LOOK[l.kind];

  return (
    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} transition={{ duration: 0.25 }} className="pt-safe overflow-hidden border-b bg-background">
      <Link href="/leaderboard" aria-label={t("Recent community activity. Open it")} className="mx-auto flex h-9 max-w-150 items-center gap-2.5 px-4 min-[390px]:px-5">
        <span className="relative flex size-1.5 shrink-0" aria-hidden>
          <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary" />
          <span className="relative size-1.5 rounded-full bg-primary" />
        </span>
        <div className="relative h-full min-w-0 flex-1 overflow-hidden" aria-hidden>
          <AnimatePresence initial={false}>
            <motion.div
              key={cur.key}
              initial={{ y: "100%", opacity: 0 }}
              animate={{ y: "0%", opacity: 1 }}
              exit={{ y: "-100%", opacity: 0 }}
              transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
              className="absolute inset-0 flex items-center gap-2"
            >
              <span className={`grid size-5 shrink-0 place-items-center rounded-full ${look.badge}`}>
                <Icon icon={l.pending ? HourglassIcon : look.icon} size={12} strokeWidth={2} />
              </span>
              <span className="min-w-0 truncate text-label font-normal">
                <bdi className="font-semibold text-foreground">{l.name}</bdi> <span className="text-muted-foreground">{l.verb}</span>{" "}
                <span dir="ltr" className={`font-semibold tabular-nums ${look.value}`}>{l.value}</span>
                {l.coin && <span className="text-muted-foreground"> {t("on {coin}", { coin: l.coin })}</span>}
              </span>
              {l.when && <span className="ms-auto shrink-0 text-caption text-subtle">{l.when}</span>}
            </motion.div>
          </AnimatePresence>
        </div>
      </Link>
    </motion.div>
  );
}
