"use client";
import { ArrowRight01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { pct, strengths } from "@/lib/agent-info";
import type { AgentModel } from "@/lib/api/types";
import { pick } from "@/lib/format";
import { fmt } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { Icon } from "@/components/ui/icon";
import { Pill } from "@/components/ui/primitives";
import { modelState } from "./agent-sheet";

// shortcut: the API has no "recommended" flag yet, so we fall back to the middle agent like a pricing page;
// once the backend sends `recommended: true` on a model, that one wins.
export function recommendedIndex(list: AgentModel[]) {
  const flagged = list.findIndex((m) => pick(m as unknown as Record<string, unknown>, ["recommended", "featured"]) === true);
  return flagged >= 0 ? flagged : Math.floor((list.length - 1) / 2);
}

/** One plain card per agent: what it's good at in words, the three numbers that differ, and a way in. */
export function AgentList({ list, onChoose }: { list: AgentModel[]; onChoose: (i: number) => void }) {
  const rec = recommendedIndex(list);
  return (
    <div className="flex flex-col gap-2.5">
      {list.map((m, i) => {
        const st = modelState(m);
        const top = i === rec && list.length > 1;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              haptic.tap();
              onChoose(i);
            }}
            className={`block w-full rounded-lg bg-surface p-4 text-left transition-transform duration-100 active:scale-[0.99] ${top ? "ring-1 ring-primary/60" : ""}`}
          >
            <span className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-body font-semibold">{m.name}</span>
                  {top && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-caption font-semibold text-primary">
                      <Icon icon={StarIcon} size={11} strokeWidth={2} /> Recommended
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-label font-normal text-muted-foreground">{strengths(m, list)}</span>
              </span>
              {st.tone !== "ok" && <Pill tone={st.tone}>{st.label}</Pill>}
            </span>

            <span className="mt-4 grid grid-cols-3 gap-2">
              <Num label="Minimum" value={`${fmt(m.min_capital, 0)} USDT`} />
              <Num label="Trades/day" value={`${m.daily_limit}`} />
              <Num label="Fee" value={m.billing_mode === "subscription" ? "Plan" : pct(m.fee_bps)} />
            </span>

            <span className="mt-3 flex items-center justify-between border-t border-border pt-3 text-label font-semibold">
              Details
              <Icon icon={ArrowRight01Icon} size={16} className="text-muted-foreground" />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Num({ label, value }: { label: string; value: string }) {
  return (
    <span className="block min-w-0 rounded-md bg-surface-raised px-2.5 py-2">
      <span className="block text-caption text-muted-foreground">{label}</span>
      <span className="mt-0.5 block truncate text-body-sm font-semibold tabular-nums">{value}</span>
    </span>
  );
}
