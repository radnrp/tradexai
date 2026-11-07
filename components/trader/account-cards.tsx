"use client";
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { Trader } from "@/lib/api/types";
import { haptic } from "@/lib/telegram";
import { onboardingStep, setupTrack } from "@/lib/trader";
import { t as tr } from "@/lib/i18n";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/primitives";

/**
 * The server-tracked setup steps for the top of Home: a progress bar, then the steps with a check or an open circle, done
 * ones first. An open step the user can do is tappable: the tutorial, or the same deposit form as everywhere else. Hidden
 * once all are complete.
 */
export function OnboardingCard({ t, onTutorial, className = "" }: { t: Trader; onTutorial: () => void; className?: string }) {
  const openDeposit = useOpenDeposit();
  const { steps, completed, total } = t.onboarding;
  if (!steps.length || completed >= total) return null;
  const action: Record<string, (() => void) | undefined> = { tutorial_watched: onTutorial, fund_account: () => openDeposit() };
  const { ordered, done, pct, next } = setupTrack(steps);

  return (
    <Card className={`p-3.5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-body-sm font-semibold">{tr("Your setup")}</span>
        <span className="text-label font-semibold text-primary tabular-nums">
          {tr("{progress} complete", { progress: `${done}/${ordered.length}` })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={tr("Setup progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-surface-raised"
      >
        <div className="h-full rounded-full bg-primary shadow-[0_0_12px_rgb(2_233_73/0.5)] transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3">
        {ordered.map((s) => {
          const label = onboardingStep(s.key).title;
          const run = s.complete ? undefined : action[s.key];
          const inner = (
            <>
              {s.complete ? (
                <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Icon icon={Tick02Icon} size={11} strokeWidth={3} />
                </span>
              ) : (
                <span className={`size-4.5 shrink-0 rounded-full border-2 ${s.key === next ? "border-primary" : "border-subtle"}`} aria-hidden />
              )}
              <span className={`min-w-0 leading-tight ${run ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
              {run && <Icon icon={ArrowRight01Icon} size={14} className="rtl:-scale-x-100 ms-auto shrink-0 text-muted-foreground" />}
            </>
          );
          const cls = "flex min-h-8 w-full items-center gap-2 text-start text-label";
          return (
            <li key={s.key} className="min-w-0">
              {run ? (
                <button
                  type="button"
                  onClick={() => {
                    haptic.tap();
                    run();
                  }}
                  className={`hit-area ${cls} active:opacity-70`}
                >
                  {inner}
                </button>
              ) : (
                <div className={cls} aria-label={s.complete ? tr("{label}, done", { label }) : label}>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
