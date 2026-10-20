"use client";
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown02Icon, Calculator01Icon, Cancel01Icon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { fmtDateUtc } from "@/lib/format";
import { fmt, isAmount, sign } from "@/lib/money";
import { qk } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { AmountInput } from "@/components/ui/controls";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Amount, ErrorState, Skeleton } from "@/components/ui/primitives";

// shortcut: the contract documents range=30d only, so there's no range picker until more are confirmed.
const RANGE = "30d";
const MIN_TRADES = 20;
const QUICK = ["100", "500", "1000"];

/** The small pill that opens the calculator, for places that shouldn't carry the whole card. */
export function CalculatorButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic.tap();
        onClick();
      }}
      className="hit-area inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-raised px-3.5 text-label font-semibold text-foreground active:opacity-80"
    >
      <Icon icon={Calculator01Icon} size={16} className="text-info" />
      Historical illustration
    </button>
  );
}

/**
 * What past trades made on an amount over the last 30 days, as the server computes it, in a dialog.
 * Never a forecast or a month-end promise: it's labelled historical, shows its sample and period, and a loss is shown as is.
 */
export function CalculatorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const openDeposit = useOpenDeposit();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent aria-describedby={undefined} className="gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle>Historical illustration</DialogTitle>
            <p className="mt-0.5 text-label font-normal text-muted-foreground">What past trades made on this amount, last 30 days</p>
          </div>
          <DialogClose aria-label="Close" className="hit-area grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-muted-foreground">
            <Icon icon={Cancel01Icon} size={18} />
          </DialogClose>
        </div>
        <Calculator
          onDeposit={() => {
            onClose();
            openDeposit();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function Calculator({ onDeposit }: { onDeposit: () => void }) {
  const [amount, setAmount] = useState("100");
  const [debounced, setDebounced] = useState(amount);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(amount), 400);
    return () => clearTimeout(t);
  }, [amount]);
  const valid = isAmount(debounced, 9, 2);
  const q = useQuery({
    queryKey: qk.calculator(debounced, RANGE),
    queryFn: () => API.calculator(debounced, RANGE),
    enabled: valid,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
  const c = q.data;
  const ready = c && c.status === "available" && c.illustrativeNet != null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {QUICK.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              haptic.select();
              setAmount(v);
            }}
            className={`hit-area h-9 flex-1 rounded-full text-label tabular-nums transition-colors ${amount === v ? "bg-foreground text-background" : "bg-surface-raised text-muted-foreground"}`}
          >
            {fmt(v, 0)} USDT
          </button>
        ))}
      </div>
      <div>
        <label htmlFor="calc-amount" className="sr-only">
          Amount in USDT
        </label>
        <AmountInput id="calc-amount" value={amount} onChange={setAmount} unit="USDT" maxDecimals={2} placeholder="100" />
      </div>

      <div aria-live="polite">
        {!valid ? null : q.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : q.isError && !c ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !ready ? (
          <p className="rounded-lg bg-surface-raised p-4 text-body-sm text-muted-foreground">
            Not enough history yet ({c?.sampleTrades ?? 0} of {MIN_TRADES} settled trades).
          </p>
        ) : (
          <div className={`rounded-lg bg-surface-raised p-4 text-center transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
            <div className="text-label text-muted-foreground">On {fmt(c.amount ?? debounced)} USDT, past 30 days</div>
            <Amount value={c.illustrativeNet} unit="USDT" signed colored className="mt-1 block text-display" />
            <div className="mt-2 text-caption text-muted-foreground tabular-nums">
              {c.sampleTrades} trades · {c.sampleAccounts} account{c.sampleAccounts === 1 ? "" : "s"}
              {c.firstTradeAt && c.lastTradeAt ? ` · ${fmtDateUtc(c.firstTradeAt)} – ${fmtDateUtc(c.lastTradeAt)}` : ""}
            </div>
          </div>
        )}
      </div>

      <p className="text-caption text-muted-foreground">Past results, not a forecast. Future months can be lower or negative.</p>
      {ready && sign(c.illustrativeNet) > 0 && (
        <Button block icon={<Icon icon={ArrowDown02Icon} size={18} />} onClick={onDeposit}>
          Deposit
        </Button>
      )}
    </div>
  );
}
