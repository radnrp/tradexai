"use client";
import { Calculator01Icon, Cancel01Icon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import { leverageText, pct, readPolicy, rrText, stopLossText } from "@/lib/agent-info";
import type { Trader } from "@/lib/api/types";
import { pick } from "@/lib/format";
import { fmt } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

/** The agent's rules in a few rows, all read from GET /trader, plus the way into the tutorial and the historical calculator. */
export function AgentInfoDialog({
  t,
  open,
  onClose,
  onTutorial,
  onCalculator,
}: {
  t: Trader;
  open: boolean;
  onClose: () => void;
  onTutorial: () => void;
  onCalculator: () => void;
}) {
  const p = readPolicy(t.tradePolicy);
  const rr = pick<number | string>(t.tradePolicy ?? null, ["rr", "targetRR", "targetRr"]);
  const rows: [string, string][] = [
    ["Strategy", "Scalping, long & short"],
    ["Leverage", leverageText(p)],
    ["Margin per trade", `${pct(p.budgetBps)} of value`],
    ["Open at once", `${t.quota.maxOpenPositions} trades`],
    ["New trades", `${t.quota.hourlyEntryLimit} per hour`],
    ["Fee", `${pct(t.feeBpsPerSide)} of margin, each side`],
    ["Stop loss", stopLossText(p)],
    ...(rr != null ? ([["Target R/R", rrText(rr)]] as [string, string][]) : []),
    ["Minimum to trade", `${fmt(t.minimumCapital, 0)} USDT`],
  ];
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="gap-3">
        <div className="flex items-center justify-between">
          <DialogTitle>Agent info</DialogTitle>
          <DialogClose aria-label="Close" className="hit-area grid size-9 place-items-center rounded-full bg-surface-raised text-muted-foreground">
            <Icon icon={Cancel01Icon} size={18} />
          </DialogClose>
        </div>
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5 text-body-sm">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-muted-foreground">Results aren&apos;t guaranteed. You can lose money.</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Icon icon={PlayCircleIcon} size={18} />} onClick={go(onTutorial)}>
            Tutorial
          </Button>
          <Button variant="secondary" icon={<Icon icon={Calculator01Icon} size={18} />} onClick={go(onCalculator)}>
            Calculator
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
