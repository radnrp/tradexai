"use client";
import Link from "next/link";
import { ArrowDown02Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import type { Trader } from "@/lib/api/types";
import { haptic } from "@/lib/telegram";
import { trialTitle, type TrialView } from "@/lib/trader";
import { t as tr } from "@/lib/i18n";
import { useFundXeno } from "@/components/deposit/deposit-sheet";
import { useAgentStatus } from "@/components/trader/use-agent-status";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/primitives";

// the bar's colour reads before any text: green while it runs, blue for funding, and amber once the limit is reached: an end of the
// trial is a stop, never a goal reached
const BAR: Record<string, string> = { ready: "bg-primary", active: "bg-primary", draining: "bg-warning", completed: "bg-warning", converted: "bg-info" };

/**
 * The Trial on Home, right under the circle and kept small: what state it's in, the trades used (the server's count, never ours) and
 * one short line on what's happening, with a way to the full explanation. Once it's over, one button for the one way on: a deposit
 * into the same XENO, with the amount already filled in. No timer: the trial ends on entries, not on the clock. After a deposit
 * (converted) it's no longer about the trial, only the deposit total still missing for real trading.
 */
export function TrialCard({ t, view, className = "" }: { t: Trader; view: TrialView; className?: string }) {
  const fundXeno = useFundXeno();
  const { mode } = useAgentStatus(t);
  const title = trialTitle(view, mode);
  // an active trial the agent can't act on doesn't look like a working one
  const bar = title === view.title ? (BAR[view.status] ?? "bg-primary") : "bg-warning";
  const funding = view.status === "converted";

  return (
    <Card className={`px-4 py-3 ${className}`}>
      <div className="text-body-sm font-semibold" role="status">
        {title}
      </div>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
        <span dir="ltr" className="text-h2 font-bold tabular-nums">{view.counter.value}</span>
        <span className="text-label font-normal text-muted-foreground">{view.counter.label}</span>
      </p>
      {/* trades used; after a deposit the trades no longer matter, the credited total against the minimum does */}
      <div
        role="progressbar"
        aria-label={funding ? tr("Deposits towards real trading") : tr("Trial trades used")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={view.pct}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-raised"
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${bar}`} style={{ width: `${view.pct}%` }} />
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <p className="min-w-0 text-caption text-muted-foreground">{view.note}</p>
        {!funding && (
          <Link href="/trial" onClick={() => haptic.tap()} className="hit-area inline-flex shrink-0 items-center text-caption font-medium text-info active:opacity-80">
            {tr("How it works")}
            <Icon icon={ArrowRight01Icon} size={14} className="rtl:-scale-x-100" />
          </Link>
        )}
      </div>
      {view.cta && (
        <Button size="sm" block className="mt-2.5" icon={<Icon icon={ArrowDown02Icon} size={16} />} onClick={() => fundXeno(view.cta?.amount)}>
          {view.cta.button}
        </Button>
      )}
    </Card>
  );
}
