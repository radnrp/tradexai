"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { maxOpenOf } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import { ApiError } from "@/lib/api/session";
import type { AgentInstance, EntryRejection } from "@/lib/api/types";
import { fmtAgo } from "@/lib/format";
import { describeError, entryRejectionFacts, entryRejectionText } from "@/lib/labels";
import { add, fmt, ratio, sign } from "@/lib/money";
import { useInvalidateLedger } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { usePendingAction } from "@/lib/use-pending-action";

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

/**
 * PATCH the name with an idempotency key that survives an uncertain network result.
 * The status (active / paused / stopping) is the server's alone in single_xeno mode; sending it gets a 400.
 */
export function useRename(inst: Pick<AgentInstance, "id">) {
  const { run, pending } = usePendingAction<{ name: string }>(`patch:${inst.id}`);
  const [busy, setBusy] = useState(false);
  const invalidate = useInvalidateLedger();

  async function rename(name: string) {
    setBusy(true);
    try {
      await run({ name }, (b, key) => API.renameInstance(inst.id, b, key));
      haptic.success();
      toast.success("Name saved");
      return true;
    } catch (e) {
      haptic.error();
      const d = describeError(e);
      toast.error(e instanceof ApiError && e.uncertain ? "Result unknown. Retry." : d.title, { description: d.detail });
      return false;
    } finally {
      setBusy(false);
      invalidate();
    }
  }
  return { rename, busy, pending };
}

/** Where the agent's money sits right now, as one bar with a legend. Display only. */
export function MoneySplit({ inst }: { inst: AgentInstance }) {
  const parts = [
    { label: "Free", value: inst.cash, cls: "bg-foreground/70" },
    { label: "In trades", value: add(inst.reserved, inst.exit_fee_reserved ?? "0"), cls: "bg-primary" },
    { label: "Held for funding", value: inst.funding_reserved ?? "0", cls: "bg-warning" },
  ].filter((x) => sign(x.value) > 0 || x.label !== "Held for funding");
  const total = parts.reduce((a, x) => add(a, x.value), "0");
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-caption text-muted-foreground">Where its money is (USDT)</span>
        <span className="flex items-center gap-2 text-caption text-muted-foreground">
          <TradeSlots open={inst.openPositions} max={maxOpenOf(inst)} scanning={inst.status === "active" && inst.executionState === "waiting_for_signal"} />
          {inst.openPositions} of {maxOpenOf(inst)} open
        </span>
      </div>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-raised">
        {sign(total) > 0 && parts.map((x) => <span key={x.label} className={x.cls} style={{ width: `${ratio(x.value, total) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5 text-caption">
            <span className={`size-2 rounded-full ${x.cls}`} />
            <span className="text-muted-foreground">{x.label}</span>
            <span className="tabular-nums">{fmt(x.value)}</span>
          </span>
        ))}
        {inst.last_tick_at && <span className="ml-auto text-caption text-muted-foreground">Updated {fmtAgo(inst.last_tick_at)}</span>}
      </div>
    </div>
  );
}

/** Why the last entry check didn't open a trade. Informational only: open trades aren't affected and the agent keeps checking by itself. */
export function EntryCheck({ r, trading }: { r: EntryRejection; trading: boolean }) {
  const facts = entryRejectionFacts(r);
  const at = r.details?.checkedAt;
  return (
    <div className="mt-3 rounded-md bg-surface-raised p-3">
      <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
        <span>Last entry check</span>
        {at && <time dateTime={at}>{fmtAgo(at)}</time>}
      </div>
      <div className="mt-0.5 text-body-sm font-medium">{entryRejectionText(r.code)}</div>
      {facts.length > 0 && <div className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">{facts.join(" · ")}</div>}
      <div className="mt-1 text-caption text-muted-foreground">{trading ? "Open trades aren't affected. " : ""}It keeps checking on its own.</div>
    </div>
  );
}

export function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-body-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export const toneCls = (v: string | null | undefined) => (sign(v) > 0 ? "text-primary" : sign(v) < 0 ? "text-destructive" : "");
