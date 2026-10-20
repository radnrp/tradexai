"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  ChartLineData02Icon,
  Clock01Icon,
  Coins01Icon,
  GiftIcon,
  Layers01Icon,
  PieChartIcon,
  Robot01Icon,
  Target02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { pct, readPolicy } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import type { Trader } from "@/lib/api/types";
import { fmt } from "@/lib/money";
import { qk } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";

type IconSvg = Parameters<typeof Icon>[0]["icon"];
type Slide = { icon: IconSvg; color: string; title: string; body: string; points: { icon: IconSvg; text: string }[] };
type Facts = Pick<Trader, "tradePolicy" | "quota" | "feeBpsPerSide" | "minimumCapital">;

// each slide has its own color so the steps feel distinct; numbers come from GET /trader so the guide can't drift from the rules
function slides(t: Facts): Slide[] {
  const p = readPolicy(t.tradePolicy);
  const lev = p.leverage != null ? `${p.leverage}×` : p.maxLeverage != null ? `up to ${p.maxLeverage}×` : "auto";
  return [
    {
      icon: Robot01Icon,
      color: "var(--color-primary)",
      title: "Meet your agent",
      body: "It trades crypto for you, long or short, 24/7.",
      points: [
        { icon: Clock01Icon, text: "Always on. Nothing to start or stop" },
        { icon: ChartLineData02Icon, text: `Top ${p.universe} coins, leverage ${lev}` },
      ],
    },
    {
      icon: Wallet01Icon,
      color: "var(--color-info)",
      title: "One account",
      body: "Every deposit goes to the same account.",
      points: [
        { icon: GiftIcon, text: "Trial fund trades too, but can't be withdrawn" },
        { icon: Coins01Icon, text: "Settled profit can be withdrawn" },
      ],
    },
    {
      icon: Target02Icon,
      color: "var(--color-warning)",
      title: "Every trade has an exit",
      body: "Take profit or stop loss. No time limit.",
      points: [
        { icon: Layers01Icon, text: `Up to ${t.quota.hourlyEntryLimit} new trades an hour, ${t.quota.maxOpenPositions} open at once` },
        { icon: PieChartIcon, text: `Fee ${pct(t.feeBpsPerSide)} of the trade's margin, each side` },
      ],
    },
    {
      icon: Alert02Icon,
      color: "var(--color-destructive)",
      title: "Know the risk",
      body: "Results aren't guaranteed. You can lose money.",
      points: [
        { icon: Wallet01Icon, text: `Below ${fmt(t.minimumCapital, 0)} USDT, new trades pause` },
        { icon: Alert02Icon, text: "Only risk what you can afford" },
      ],
    },
  ];
}

/** The agent walkthrough. Finishing it ("Got it") records the tutorial step on the server; closing early doesn't. */
export function AgentTour({ open, t, onClose }: { open: boolean; t: Facts; onClose: () => void }) {
  const [[i, dir], setPos] = useState<[number, number]>([0, 1]);
  const reduce = useReducedMotion();
  const qc = useQueryClient();
  const SLIDES = slides(t);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const go = (to: number) => {
    if (to < 0 || to >= SLIDES.length) return;
    haptic.select();
    setPos([to, to > i ? 1 : -1]);
  };
  const close = () => {
    onClose();
    // reopen at the start next time
    setTimeout(() => setPos([0, 1]), 300);
  };
  const finish = () => {
    close();
    // idempotent on the server, which keeps the first time; a failure just leaves the step open
    API.patchPreferences({ tutorialWatched: true })
      .then(() => qc.invalidateQueries({ queryKey: qk.trader }))
      .catch(() => {});
  };

  return (
    <Sheet
      open={open}
      onClose={close}
      title="How your agent works"
      subtitle={`${i + 1} of ${SLIDES.length}`}
      footer={
        <div className="flex items-center gap-2">
          {i > 0 && (
            <IconButton label="Back" onClick={() => go(i - 1)}>
              <Icon icon={ArrowLeft01Icon} />
            </IconButton>
          )}
          <Button size="lg" className="flex-1" onClick={() => (last ? finish() : go(i + 1))}>
            {last ? "Got it" : "Next"}
          </Button>
        </div>
      }
    >
      {/* horizontal swipe changes slides; data-vaul-no-drag keeps the sheet from taking the gesture */}
      <div data-vaul-no-drag className="relative h-80 overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={i}
            custom={dir}
            variants={{
              enter: (d: number) => ({ x: d * 60, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (d: number) => ({ x: d * -60, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.25}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50) go(i + 1);
              else if (info.offset.x > 50) go(i - 1);
            }}
            className="absolute inset-0 flex flex-col items-center text-center"
          >
            <div className="relative mt-2 grid size-28 place-items-center">
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: `color-mix(in oklab, ${s.color} 16%, transparent)` }}
                animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.span
                className="relative grid size-18 place-items-center rounded-full"
                style={{ background: `color-mix(in oklab, ${s.color} 24%, transparent)`, color: s.color }}
                initial={{ scale: 0.6, rotate: -12 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ duration: 0.45, ease: [0.2, 0, 0, 1.3] }}
              >
                <Icon icon={s.icon} size={36} />
              </motion.span>
            </div>
            <h3 className="mt-4 text-h1">{s.title}</h3>
            <p className="mt-1.5 max-w-80 text-body-sm text-muted-foreground">{s.body}</p>
            <ul className="mt-5 flex w-full flex-col gap-2">
              {s.points.map((p, k) => (
                <motion.li
                  key={p.text}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 + k * 0.08, duration: 0.22 }}
                  className="flex items-center gap-3 rounded-md bg-surface-raised px-3.5 py-2.5 text-left text-body-sm"
                >
                  <Icon icon={p.icon} size={18} style={{ color: s.color }} className="shrink-0" />
                  {p.text}
                </motion.li>
              ))}
            </ul>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-2 flex justify-center gap-1.5" role="tablist" aria-label="Tour steps">
        {SLIDES.map((sl, k) => (
          <button
            key={sl.title}
            role="tab"
            aria-selected={k === i}
            aria-label={`Step ${k + 1}`}
            onClick={() => go(k)}
            className="hit-area h-1.5 rounded-full transition-all duration-200"
            style={{ width: k === i ? 20 : 6, background: k === i ? s.color : "var(--color-subtle)" }}
          />
        ))}
      </div>
    </Sheet>
  );
}
