"use client";
import Image from "next/image";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import xeno from "@/assets/agents/XENO_robot_icon.svg";
import type { Trader } from "@/lib/api/types";
import { fmtTime } from "@/lib/format";
import { type OrbMode, traderState } from "@/lib/trader";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/primitives";

const RING: Record<OrbMode, string> = {
  scanning: "var(--color-primary)",
  managing: "var(--color-primary)",
  waiting: "var(--color-warning)",
  paused: "var(--color-warning)",
  alert: "var(--color-destructive)",
};

/**
 * The round agent indicator: a radar sweep while it looks for entries, a pulse while trades are open, still otherwise.
 * Display only: the account is never started or stopped from here.
 */
export function StatusOrb({ mode, size = 56 }: { mode: OrbMode; size?: number }) {
  const reduce = useReducedMotion();
  const color = RING[mode];
  const live = !reduce && (mode === "scanning" || mode === "managing");
  return (
    <span className="relative grid shrink-0 place-items-center rounded-full" style={{ width: size, height: size }} aria-hidden>
      <span className="absolute inset-0 rounded-full" style={{ background: `color-mix(in oklab, ${color} 14%, transparent)` }} />
      {mode === "scanning" && !reduce && (
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, ${color} 55%, transparent) 70deg, transparent 72deg)` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        />
      )}
      {live && (
        <motion.span
          className="absolute inset-0 rounded-full border"
          style={{ borderColor: color }}
          animate={{ scale: [1, 1.18], opacity: [0.6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="absolute inset-[3px] rounded-full border-2" style={{ borderColor: `color-mix(in oklab, ${color} ${mode === "paused" ? 45 : 80}%, transparent)` }} />
      <Image src={xeno} alt="" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} className={`relative ${mode === "paused" ? "opacity-60 grayscale" : ""}`} />
    </span>
  );
}

/** What the agent is doing now, in the contract's priority order, with the one fix that applies (a deposit when under the minimum). */
export function TraderStatusCard({ t, href, orb = 48 }: { t: Trader; href?: string; orb?: number }) {
  const s = traderState(t);
  const openDeposit = useOpenDeposit();
  const body = (
    <div className="flex items-center gap-3.5">
      <StatusOrb mode={s.mode} size={orb} />
      <div className="min-w-0 flex-1" role="status" aria-live="polite">
        <div className="text-body-sm font-semibold">{s.title}</div>
        {s.body && <p className="mt-0.5 text-label font-normal text-muted-foreground">{s.body}</p>}
        {s.key === "quota" && s.nextSlotAt && (
          <p className="mt-0.5 text-label font-normal text-muted-foreground">
            Next slot{" "}
            <time dateTime={s.nextSlotAt} className="font-semibold text-foreground tabular-nums">
              {fmtTime(s.nextSlotAt)}
            </time>
          </p>
        )}
      </div>
      {href && <Icon icon={ArrowRight01Icon} size={18} className="shrink-0 text-muted-foreground" />}
    </div>
  );
  return (
    <Card className="p-4">
      {href ? (
        <Link href={href} className="block transition-opacity duration-100 active:opacity-70" aria-label={`Agent: ${s.title}`}>
          {body}
        </Link>
      ) : (
        body
      )}
      {s.cta === "deposit" && (
        <Button size="sm" block className="mt-3.5" icon={<Icon icon={ArrowDown02Icon} size={16} />} onClick={() => openDeposit()}>
          Deposit
        </Button>
      )}
    </Card>
  );
}
