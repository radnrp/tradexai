"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Alert02Icon,
  ArrowLeft01Icon,
  ChartLineData02Icon,
  Clock01Icon,
  Coins01Icon,
  PauseIcon,
  Robot01Icon,
  SecurityCheckIcon,
  StopIcon,
  Target02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { pct, type Policy, timeLimitText } from "@/lib/agent-info";
import { haptic } from "@/lib/telegram";
import { Button, IconButton } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";

type IconSvg = Parameters<typeof Icon>[0]["icon"];
type Slide = { icon: IconSvg; color: string; title: string; body: string; points: { icon: IconSvg; text: string }[] };
/** The catalog's shared rules; rr is null when the agents don't share one target. */
export type TourFacts = { policy: Policy; rr: number | string | null };

// each slide has its own color so the steps feel distinct; values are the app's tokens plus one accent.
// numbers come from the catalog so the guide can't drift from the rules
function slides({ policy: p, rr }: TourFacts): Slide[] {
  const lev = p.leverage != null ? `${p.leverage}× leverage` : p.maxLeverage != null ? `auto leverage up to ${p.maxLeverage}×` : "auto leverage";
  return [
    {
      icon: Robot01Icon,
      color: "var(--color-primary)",
      title: "What is an agent?",
      body: "A bot that scalps crypto for you, long or short.",
      points: [
        { icon: Clock01Icon, text: "Runs 24/7" },
        { icon: ChartLineData02Icon, text: `Top ${p.universe} coins, ${lev}` },
      ],
    },
    {
      icon: Wallet01Icon,
      color: "var(--color-info)",
      title: "Its own budget",
      body: "You set how much it trades with.",
      points: [
        { icon: Coins01Icon, text: "Minimum per agent, more is fine" },
        { icon: Target02Icon, text: `${pct(p.budgetBps)} of its value per trade, fees on top` },
      ],
    },
    {
      icon: Target02Icon,
      color: "var(--color-warning)",
      title: "Every trade has an exit",
      body: p.maxHoldingMs == null ? "Take profit or stop loss. No time limit." : `Take profit, stop loss, or ${timeLimitText(p)} max.`,
      points: [
        { icon: ChartLineData02Icon, text: rr != null ? `Take profit ${+Number(rr).toFixed(2)}× the stop distance` : "Take profit set from the stop distance" },
        { icon: Coins01Icon, text: "Fee on entry and exit" },
      ],
    },
    {
      icon: SecurityCheckIcon,
      color: "#9b6bff",
      title: "You stay in control",
      body: "Pause or stop anytime.",
      points: [
        { icon: PauseIcon, text: "Pause: no new trades" },
        { icon: StopIcon, text: "Stop: money comes back" },
      ],
    },
    {
      icon: Alert02Icon,
      color: "var(--color-destructive)",
      title: "Know the risk",
      body: "Targets aren't guarantees. You can lose money.",
      points: [
        p.dailyLossBps != null
          ? { icon: ChartLineData02Icon, text: `A ${pct(p.dailyLossBps)} daily loss pauses new trades` }
          : null,
        { icon: Alert02Icon, text: "Only risk what you can afford" },
      ].filter((x): x is Slide["points"][number] => x != null),
    },
  ];
}

export function AgentsTour({ open, facts, onClose }: { open: boolean; facts: TourFacts; onClose: () => void }) {
  const [[i, dir], setPos] = useState<[number, number]>([0, 1]);
  const reduce = useReducedMotion();
  const SLIDES = slides(facts);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const go = (to: number) => {
    if (to < 0 || to >= SLIDES.length) return;
    haptic.select();
    setPos([to, to > i ? 1 : -1]);
  };
  const finish = () => {
    onClose();
    // reopen at the start next time
    setTimeout(() => setPos([0, 1]), 300);
  };

  return (
    <Sheet
      open={open}
      onClose={finish}
      title="How agents work"
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
            <p className="mt-1.5 max-w-72 text-body-sm text-muted-foreground">{s.body}</p>
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
