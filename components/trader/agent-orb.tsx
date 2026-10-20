"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Alert02Icon, ArrowDown02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import xeno from "@/assets/agents/XENO_robot_icon.svg";
import type { Trader } from "@/lib/api/types";
import { fmt } from "@/lib/money";
import type { OrbMode } from "@/lib/trader";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import type { ProfitBubble } from "@/components/trader/profit-events";
import { useAgentStatus } from "@/components/trader/use-agent-status";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

const SIZE = 252;
const DISC = 192;
const COLOR: Record<OrbMode, string> = {
  scanning: "var(--color-primary)",
  managing: "var(--color-primary)",
  waiting: "var(--color-warning)",
  paused: "var(--color-warning)",
  alert: "var(--color-destructive)",
};

/**
 * Home's centrepiece: the agent as a big live circle saying what it's doing. It sweeps while it looks for entries and
 * pulses while trades are open; every real settled profit floats up as a bubble and pops. The money is on the card
 * below it. Tapping it opens the agent. It has no start/stop: the server runs the account.
 */
export function AgentOrb({ t, bubbles, onBubbleDone }: { t: Trader; bubbles: ProfitBubble[]; onBubbleDone: (id: string) => void }) {
  const { s, title, short, mode, warn } = useAgentStatus(t);
  const reduce = useReducedMotion();
  const openDeposit = useOpenDeposit();
  const color = COLOR[mode];
  const live = !reduce && (mode === "scanning" || mode === "managing");
  const ring = (SIZE - DISC) / 2;

  return (
    <section className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <div className="absolute inset-4 rounded-full blur-2xl" style={{ background: `radial-gradient(circle, color-mix(in oklab, ${color} 34%, transparent), transparent 70%)` }} aria-hidden />
        <div className="absolute inset-1.5 rounded-full border border-white/8" aria-hidden />
        {mode === "scanning" && !reduce && (
          <motion.div
            aria-hidden
            className="absolute inset-1.5 rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, ${color} 45%, transparent) 70deg, transparent 72deg)`,
              mask: "radial-gradient(circle, transparent 62%, black 63%)",
              WebkitMask: "radial-gradient(circle, transparent 62%, black 63%)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          />
        )}
        {live &&
          [0, 1].map((k) => (
            <motion.span
              key={k}
              aria-hidden
              className="absolute rounded-full border"
              style={{ inset: ring, borderColor: color }}
              animate={{ scale: [1, 1.3], opacity: [0.45, 0] }}
              transition={{ duration: 2.6, delay: k * 1.3, repeat: Infinity, ease: "easeOut" }}
            />
          ))}
        {live && (
          <motion.div aria-hidden className="absolute inset-1.5" animate={{ rotate: 360 }} transition={{ duration: 9, repeat: Infinity, ease: "linear" }}>
            <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}` }} />
          </motion.div>
        )}

        <Link
          href="/agents"
          aria-label={`Agent: ${title}. Open the agent`}
          // green only while it's working; paused or waiting reads neutral, so the centre never contradicts the ring
          className={`absolute grid place-items-center rounded-full text-white ring-1 ring-white/10 transition-transform duration-150 active:scale-[0.97] ${
            mode === "scanning" || mode === "managing" ? "hero-gradient shadow-[0_24px_60px_-24px_rgb(2_233_73/0.45)]" : "bg-surface-raised"
          }`}
          style={{ inset: ring }}
        >
          <span className="flex flex-col items-center px-6 text-center">
            <Image src={xeno} alt="" width={56} height={56} className={mode === "paused" ? "opacity-60 grayscale" : ""} />
            <span className="mt-2 line-clamp-2 text-body font-semibold leading-tight">{title}</span>
            <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-caption text-white/80 tabular-nums">
              <span className="size-1.5 rounded-full" style={{ background: color }} aria-hidden />
              {t.quota.openPositions}/{t.quota.maxOpenPositions} trades open
            </span>
          </span>
        </Link>

        {/* real profits only, as they settle */}
        <div className="pointer-events-none absolute inset-0" role="status" aria-live="polite">
          {bubbles.map((b) => (
            <Bubble key={b.id} b={b} onDone={onBubbleDone} />
          ))}
        </div>
      </div>

      {/* why it's in this state, in one short line right where the eye already is */}
      {short && (
        <p
          role={warn ? "alert" : "status"}
          className={`mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-label ${warn ? "bg-warning/10 text-warning" : "bg-surface-raised text-muted-foreground"}`}
        >
          <Icon icon={warn ? Alert02Icon : InformationCircleIcon} size={14} className="shrink-0" />
          <span className="truncate">{short}</span>
        </p>
      )}
      {s.cta === "deposit" && (
        <Button size="sm" className="mt-3" icon={<Icon icon={ArrowDown02Icon} size={16} />} onClick={() => openDeposit()}>
          Deposit to trade
        </Button>
      )}
    </section>
  );
}

// a stable sideways drift per bubble, so they don't all rise on the same line
const drift = (id: string) => ([...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) % 41) - 20;
const SPARKS = Array.from({ length: 8 }, (_, k) => (k / 8) * Math.PI * 2);

/** "+$1.23" rises out of the circle, then pops in a small burst. */
function Bubble({ b, onDone }: { b: ProfitBubble; onDone: (id: string) => void }) {
  const [popped, setPopped] = useState(false);
  useEffect(() => {
    if (!popped) return;
    const t = setTimeout(() => onDone(b.id), 650);
    return () => clearTimeout(t);
  }, [popped, onDone, b.id]);

  return (
    <motion.div
      className="absolute left-1/2 top-[34%] -translate-x-1/2 -translate-y-1/2"
      initial={{ y: 0, x: 0, opacity: 0, scale: 0.4 }}
      animate={{ y: -168, x: drift(b.id), opacity: 1, scale: 1 }}
      transition={{ duration: 1.7, delay: b.delay, ease: [0.22, 0.8, 0.36, 1] }}
      onAnimationComplete={() => setPopped(true)}
    >
      <motion.span
        className="relative block whitespace-nowrap rounded-full bg-primary px-3.5 py-1.5 text-body-sm font-bold text-primary-foreground tabular-nums shadow-[0_8px_24px_-6px_rgb(2_233_73/0.7)]"
        style={{ backgroundImage: "radial-gradient(circle at 30% 25%, rgb(255 255 255/0.45), transparent 45%)" }}
        animate={popped ? { scale: 1.4, opacity: 0 } : { scale: 1, opacity: 1 }}
        transition={{ duration: 0.22 }}
      >
        +${fmt(b.amount)}
      </motion.span>
      {popped && (
        <>
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary"
            initial={{ scale: 0.4, opacity: 0.9 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
          {SPARKS.map((a) => (
            <motion.span
              key={a}
              aria-hidden
              className="absolute left-1/2 top-1/2 size-1.5 rounded-full bg-primary"
              initial={{ x: 0, y: 0, opacity: 1 }}
              animate={{ x: Math.cos(a) * 42, y: Math.sin(a) * 42, opacity: 0 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            />
          ))}
        </>
      )}
    </motion.div>
  );
}
