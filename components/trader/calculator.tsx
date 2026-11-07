"use client";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown02Icon, Calculator01Icon, Cancel01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { rrText } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import type { Calculator as Scenario, CalculatorRange } from "@/lib/api/types";
import { div, fmt, isAmount, sign } from "@/lib/money";
import { qk } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { t as tr, type Key } from "@/lib/i18n";
import { toneCls } from "@/components/agents/shared";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { AmountInput, Segmented } from "@/components/ui/controls";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Amount, ErrorState, Skeleton } from "@/components/ui/primitives";

const RANGES: { value: CalculatorRange; label: Key }[] = [
  { value: "today", label: "1 day" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];
const QUICK = ["100", "500", "1000"];

/** Whole USDT of the account balance as the starting amount; null when there's nothing to start from. */
function wholeUsdt(v: string | null | undefined): string | null {
  const int = v?.split(".")[0];
  return int && /^\d{1,9}$/.test(int) && /[1-9]/.test(int) ? int : null;
}

/** The round button that opens the calculator, sized to sit beside the agent's numbers. */
export function CalculatorButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={tr("Profit calculator")}
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      className="hit-area grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-info transition-transform duration-100 active:scale-95"
    >
      <Icon icon={Calculator01Icon} size={18} />
    </button>
  );
}

/**
 * The approximate gross the server's fixed scenario gives on an amount, in a dialog. It starts from the account balance when
 * there is one. Never past results or a forecast: the assumptions and what's left out sit in two short lines under the result.
 */
export function CalculatorDialog({ open, onClose, balance }: { open: boolean; onClose: () => void; balance?: string | null }) {
  const openDeposit = useOpenDeposit();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="max-h-[calc(100dvh-2rem)] gap-3 overflow-y-auto p-5">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle>{tr("Profit calculator")}</DialogTitle>
          <DialogClose aria-label={tr("Close")} className="hit-area grid size-8 shrink-0 place-items-center rounded-full bg-surface-raised text-muted-foreground">
            <Icon icon={Cancel01Icon} size={16} />
          </DialogClose>
        </div>
        <Calculator
          seed={wholeUsdt(balance)}
          onDeposit={() => {
            onClose();
            openDeposit();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Calculator({ seed, onDeposit }: { seed: string | null; onDeposit: () => void }) {
  const [amount, setAmount] = useState(seed ?? "100");
  const [range, setRange] = useState<CalculatorRange>("30d");
  const [debounced, setDebounced] = useState(amount);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 400);
    return () => clearTimeout(t);
  }, [amount]);
  const valid = isAmount(debounced, 9, 2);
  const q = useQuery({
    queryKey: qk.calculator(debounced, range),
    queryFn: () => API.calculator(debounced, range),
    enabled: valid,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const c = q.data;
  const chips = [...(seed ? [{ v: seed, label: tr("Your balance") }] : []), ...QUICK.filter((v) => v !== seed).map((v) => ({ v, label: fmt(v, 0) }))];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label htmlFor="calc-amount" className="sr-only">
          {tr("Starting amount in USDT")}
        </label>
        <AmountInput id="calc-amount" size="sm" value={amount} onChange={setAmount} unit="USDT" maxDecimals={2} placeholder="100" />
        <div className="flex gap-2">
          {chips.map(({ v, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => {
                haptic.select();
                setAmount(v);
              }}
              className={`hit-area h-8 flex-1 whitespace-nowrap rounded-full px-2 text-label tabular-nums transition-colors ${amount === v ? "bg-foreground text-background" : "bg-surface-raised text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Segmented layoutId="calc-range" value={range} onChange={setRange} options={RANGES.map((r) => ({ ...r, label: tr(r.label) }))} />

      <div aria-live="polite">
        {!valid ? null : q.isPending ? (
          <Skeleton className="h-34 rounded-lg" />
        ) : q.isError && !c ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : c ? (
          <div className={`transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
            <Result c={c} />
          </div>
        ) : null}
      </div>

      {c && sign(c.illustrativeGross) > 0 && (
        <Button block size="sm" icon={<Icon icon={ArrowDown02Icon} size={16} />} onClick={onDeposit}>
          {tr("Deposit")}
        </Button>
      )}
    </div>
  );
}

/** The gross up front, its daily average and end balance side by side under it; the net is null by contract, so it's never shown. */
function Result({ c }: { c: Scenario }) {
  const a = c.assumptions;
  const days = a.days === 1 ? tr("1 day") : tr("{n} days", { n: a.days });
  const daily = a.days > 1 ? div(c.illustrativeGross, String(a.days), 2) : null;
  const winRate = `${+(Number(a.winRate) * 100).toFixed(2)}%`;
  const excluded: Key | null = !a.feesIncluded && !a.fundingIncluded ? "Before fees and funding." : !a.feesIncluded ? "Before fees." : !a.fundingIncluded ? "Before funding." : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="rounded-lg bg-surface-raised px-4 py-3 text-center">
        <div className="text-label text-muted-foreground">{tr("Approx. profit · {days}", { days })}</div>
        {/* ≈ stays on the number; on a narrow screen only the unit drops to the next line */}
        <div className={`text-display [overflow-wrap:anywhere] ${toneCls(c.illustrativeGross)}`}>
          <span className="text-muted-foreground">≈&nbsp;</span>
          <Amount value={c.illustrativeGross} signed /> <span className="text-[0.7em] font-medium opacity-70">USDT</span>
        </div>
        <dl className={`mt-2.5 grid border-t border-border pt-2.5 ${daily ? "grid-cols-2 divide-x divide-border" : ""}`}>
          {daily && (
            <div className="min-w-0 px-1">
              <dt className="text-caption text-muted-foreground">{tr("Daily average")}</dt>
              <dd className="text-body-sm font-semibold [overflow-wrap:anywhere]">
                ≈&nbsp;<Amount value={daily} unit="USDT" signed />
              </dd>
            </div>
          )}
          <div className="min-w-0 px-1">
            <dt className="text-caption text-muted-foreground">{tr("Balance after")}</dt>
            <dd className="text-body-sm font-semibold [overflow-wrap:anywhere]">
              <Amount value={c.illustrativeEndingBalance} unit="USDT" />
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex gap-2 px-1 text-caption text-muted-foreground">
        <Icon icon={InformationCircleIcon} size={14} className="mt-px shrink-0" />
        <p>
          {tr("Assumes {winRate} win rate · {rr} reward:risk.", { winRate, rr: rrText(a.rewardRiskRatio) })}
          <br />
          {excluded ? tr(excluded) : ""}
        </p>
      </div>
    </div>
  );
}
