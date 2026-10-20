"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { maxOpenOf } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import { ApiError } from "@/lib/api/session";
import type { AgentInstance } from "@/lib/api/types";
import { activityLine, describeError, INSTANCE_FINAL, instanceStatus } from "@/lib/labels";
import { useInvalidateLedger } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { usePendingAction } from "@/lib/use-pending-action";
import { Amount, dotCls, Pill } from "@/components/ui/primitives";

/** Roster row: who it is, what it's doing now (and today's entries left) and how many of its trade slots are in use. The whole row is the target. */
export function InstanceRow({ inst }: { inst: AgentInstance }) {
  const st = instanceStatus(inst.status);
  const ended = INSTANCE_FINAL.has(inst.status);
  const max = maxOpenOf(inst);
  return (
    <Link href={`/agents/${inst.id}`} className="flex items-center gap-3 py-3.5 transition-opacity duration-100 active:opacity-60">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-body-sm font-semibold">{inst.name}</span>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        <div className="mt-0.5 truncate text-label font-normal text-muted-foreground">{ended ? (inst.termination_reason ? `Ended: ${inst.termination_reason.replace(/_/g, " ")}` : "Ended") : activityLine(inst)}</div>
        {ended ? (
          inst.capital_released != null && (
            <div className="mt-2 text-caption text-muted-foreground">
              <Amount value={inst.capital_released} unit="USDT" /> returned to your balance
            </div>
          )
        ) : (
          <div className="mt-2 flex items-center gap-2.5">
            <TradeSlots open={inst.openPositions} max={max} scanning={inst.status === "active" && inst.executionState === "waiting_for_signal"} />
            <span className="text-caption text-muted-foreground tabular-nums">
              {inst.openPositions} of {max} open
            </span>
            <span className="ml-auto truncate text-caption text-muted-foreground">
              <Amount value={inst.initial_capital} unit="USDT" /> given
            </span>
          </div>
        )}
      </div>
    </Link>
  );
}

/** One bar per trade the agent may hold at once (different coins each); filled = open. Empty bars sweep while it scans for an entry. */
export function TradeSlots({ open, max, scanning }: { open: number; max: number; scanning: boolean }) {
  const reduce = useReducedMotion();
  const filled = Math.min(open, max);
  return (
    <span className="flex gap-1" aria-hidden>
      {Array.from({ length: max }, (_, k) => (
        <span key={k} className={`relative h-1.5 w-4 overflow-hidden rounded-full ${k < filled ? "bg-primary" : "bg-white/12"}`}>
          {scanning && k >= filled && !reduce && (
            <motion.span
              className="absolute inset-0 rounded-full bg-primary/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.4, delay: (k - filled) * 0.3, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }}
            />
          )}
        </span>
      ))}
    </span>
  );
}

/** Compact card for the dashboard's horizontal strip (the reference's asset cards). */
export function InstanceTile({ inst }: { inst: AgentInstance }) {
  const st = instanceStatus(inst.status);
  return (
    <Link href={`/agents/${inst.id}`} className="flex w-40 shrink-0 flex-col rounded-lg bg-surface p-4 transition-transform duration-100 active:scale-[0.98]">
      <Amount value={inst.cash} unit="USDT" className="truncate text-h2" />
      <div className="mt-1 flex items-center gap-1.5 text-label font-normal text-muted-foreground">
        <span className={`size-1.5 shrink-0 rounded-full ${dotCls[st.tone]}`} />
        <span className="truncate">{inst.name}</span>
      </div>
      <span className="sr-only">{st.label}</span>
    </Link>
  );
}

const DONE_TOAST: Record<string, string> = { active: "Agent activated", paused: "Agent paused", stopping: "Stop requested" };

/** PATCH status/name with an idempotency key that survives an uncertain network result. */
export function useInstanceControl(inst: Pick<AgentInstance, "id">) {
  const { run, pending } = usePendingAction<{ name?: string; status?: "active" | "paused" | "stopping" }>(`patch:${inst.id}`);
  const [busy, setBusy] = useState<string | null>(null);
  const invalidate = useInvalidateLedger();

  async function patch(body: { name?: string; status?: "active" | "paused" | "stopping" }) {
    setBusy(body.status ?? "name");
    try {
      await run(body, (b, key) => API.patchInstance(inst.id, b, key));
      haptic.success();
      toast.success(body.name ? "Name saved" : DONE_TOAST[body.status!]);
      return true;
    } catch (e) {
      haptic.error();
      const d = describeError(e);
      toast.error(e instanceof ApiError && e.uncertain ? "Result unknown. Retry." : d.title, { description: d.detail });
      return false;
    } finally {
      setBusy(null);
      invalidate();
    }
  }
  return { patch, busy, pending };
}
