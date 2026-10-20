"use client";
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import type { Trader } from "@/lib/api/types";
import { onboardingStep } from "@/lib/trader";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/primitives";

/** The four server-tracked steps; tapping an open one does it (tutorial, deposit). Hidden once all are complete. */
export function OnboardingCard({ t, onTutorial }: { t: Trader; onTutorial: () => void }) {
  const openDeposit = useOpenDeposit();
  const { steps, completed, total } = t.onboarding;
  if (!steps.length || completed >= total) return null;
  const action: Record<string, (() => void) | undefined> = { tutorial_watched: onTutorial, fund_account: () => openDeposit() };
  const todo = steps.filter((s) => !s.complete);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-body-sm font-semibold">Get started</span>
        <span className="text-label text-muted-foreground tabular-nums">
          {completed} of {total} done
        </span>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((s) => (
          <span key={s.key} className={`h-1 flex-1 rounded-full ${s.complete ? "bg-primary" : "bg-surface-raised"}`} />
        ))}
      </div>
      <ul className="mt-2 -mb-1">
        {todo.map((s) => {
          const label = onboardingStep(s.key);
          const run = action[s.key];
          const inner = (
            <>
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-subtle text-muted-foreground">
                <Icon icon={Tick02Icon} size={12} className="opacity-0" />
              </span>
              <span className="min-w-0 flex-1 text-body-sm">{label.title}</span>
              {label.body && <span className="text-caption text-muted-foreground">{label.body}</span>}
              {run && <Icon icon={ArrowRight01Icon} size={16} className="shrink-0 text-muted-foreground" />}
            </>
          );
          const cls = "flex min-h-11 w-full items-center gap-3 text-left";
          return (
            <li key={s.key}>
              {run ? (
                <button type="button" onClick={run} className={`${cls} active:opacity-70`}>
                  {inner}
                </button>
              ) : (
                <div className={cls}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
