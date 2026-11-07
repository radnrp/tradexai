"use client";
import { useQuery } from "@tanstack/react-query";
import { Calculator01Icon, Cancel01Icon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import { feeText, leverageText, pct, readPolicy, rrText, stopLossText, targetRROf } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import type { Trader } from "@/lib/api/types";
import { pick } from "@/lib/format";
import { fmt } from "@/lib/money";
import { t as tr, type Key } from "@/lib/i18n";
import { qk } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

/** The agent's rules in a few rows, all read from GET /trader, plus the way into the tutorial and the scenario calculator. */
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
  // GET /trader's policy has no target; the instance's settings do, in the query the Agent page already keeps fresh
  const inst = useQuery({ queryKey: qk.instance(t.instanceId), queryFn: () => API.instance(t.instanceId), enabled: open });
  const rr = pick<number | string>(t.tradePolicy ?? null, ["rr", "targetRR", "targetRr"]) ?? (inst.data ? targetRROf(inst.data) : null);
  const upTo = (bps: number | null): string | null => (bps != null ? tr("Up to {pct} of value", { pct: pct(bps) }) : null);
  // optional rules are left out when the API doesn't send them, never filled in with a number from here
  const optional = (key: Key, value: string | null): [Key, string][] => (value != null ? [[key, value]] : []);
  const rows: [Key, string][] = [
    ["Strategy", tr("Scalping, long & short")],
    ["Leverage", t.tradePolicy?.marginMode === "isolated" ? `${leverageText(p)} · ${tr("Isolated")}` : leverageText(p)],
    ["Margin per trade", tr("{pct} of value", { pct: pct(p.budgetBps) })],
    ...optional("Risk per trade", upTo(p.riskPerTradeBps)),
    ...optional("Total risk limit", upTo(p.maxPortfolioRiskBps)),
    ...optional("Daily loss limit", upTo(p.dailyLossBps)),
    ["Open at once", tr("{n} trades", { n: t.quota.maxOpenPositions })],
    ["New trades", tr("{n} per hour", { n: t.quota.hourlyEntryLimit })],
    ["Fee", feeText(t)],
    ["Stop loss", stopLossText(p)],
    ...optional("Target R/R", rr != null ? rrText(rr) : null),
    ...optional("Minimum net R/R", p.minimumRR != null ? rrText(p.minimumRR) : null),
    ["Minimum to trade", `${fmt(t.minimumCapital, 0)} USDT`],
  ];
  const go = (fn: () => void) => () => {
    onClose();
    fn();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto">
        <div className="flex items-center justify-between">
          <DialogTitle>{tr("Agent info")}</DialogTitle>
          <DialogClose aria-label={tr("Close")} className="hit-area grid size-9 place-items-center rounded-full bg-surface-raised text-muted-foreground">
            <Icon icon={Cancel01Icon} size={18} />
          </DialogClose>
        </div>
        <p className="text-body-sm text-muted-foreground">{tr("XENO adjusts position size and leverage within its risk limits.")}</p>
        <dl className="divide-y divide-border">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 py-2.5 text-body-sm">
              <dt className="text-muted-foreground">{tr(k)}</dt>
              <dd className="text-end font-semibold tabular-nums">
                <bdi>{v}</bdi>
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-caption text-muted-foreground">{tr("Results aren't guaranteed. You can lose money.")}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Icon icon={PlayCircleIcon} size={18} />} onClick={go(onTutorial)}>
            {tr("Tutorial")}
          </Button>
          <Button variant="secondary" icon={<Icon icon={Calculator01Icon} size={18} />} onClick={go(onCalculator)}>
            {tr("Calculator")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
