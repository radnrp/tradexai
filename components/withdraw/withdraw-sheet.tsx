"use client";
import Image from "next/image";
import { createContext, useCallback, useContext, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Alert02Icon,
  ArrowDown02Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  ClipboardPasteIcon,
  GiftIcon,
  LockIcon,
  SentIcon,
  Tick02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { ApiError, apiErrorCode } from "@/lib/api/session";
import type { Trader, WithdrawalPolicy } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { describeError } from "@/lib/labels";
import { add, cmp, fmt, isAmount, mulBps, sign, sub, trimZeros } from "@/lib/money";
import { qk, useInvalidateLedger, useTrader } from "@/lib/queries";
import { trialProfitLock, trialProfitText, withdrawActivation, withdrawalBlock, withdrawalErrorText } from "@/lib/trader";
import { haptic } from "@/lib/telegram";
import { usePendingAction } from "@/lib/use-pending-action";
import { normalizeDigits } from "@/lib/digits";
import { t as tr, type Key } from "@/lib/i18n";
import { serverText } from "@/lib/i18n/server-text";
import { tx } from "@/lib/i18n/rich";
import { useFundXeno } from "@/components/deposit/deposit-sheet";
import { networkInfo, tokenByCode } from "@/components/deposit/options";
import { TokenIcon } from "@/components/deposit/token-icon";
import { AmountDial, DirectionBadge, TONE } from "@/components/money/flow-ui";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ErrorState, Notice, Row, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { WithdrawStatus } from "./withdraw-status";

type Body = { amount: string; address: string; network: "bsc" };
type View = { kind: "form" } | { kind: "review" } | { kind: "status"; id: string };

// shortcut: format check only (no EIP-55 checksum); the server is the source of truth for address validity.
const isEvmAddress = (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/.test(a);
const BSC = networkInfo("BSC");
const USDT = tokenByCode("usdtbsc");

const SUBTITLE: Record<View["kind"], Key> = {
  form: "To your wallet",
  review: "Review details",
  status: "Enter bot code",
};

const OpenWithdraw = createContext<(withdrawalId?: string) => void>(() => {});

/** Opens the withdraw sheet: empty for a new withdrawal, or on an existing one (code / status). */
export const useOpenWithdraw = () => useContext(OpenWithdraw);

/** Withdrawals live in one bottom sheet: address → amount → review → code from the bot; until the account is activated, only how to do that. */
export function WithdrawProvider({ children }: { children: React.ReactNode }) {
  const { pending } = usePendingAction<Body>("withdraw");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: "form" });
  // lifted here so "Edit" on the review screen comes back with everything still filled in
  const [address, setAddress] = useState(pending?.body.address ?? "");
  const [amount, setAmount] = useState(pending?.body.amount ?? "");

  const show = useCallback((withdrawalId?: string) => {
    setView(withdrawalId ? { kind: "status", id: withdrawalId } : { kind: "form" });
    setOpen(true);
  }, []);
  const close = () => setOpen(false);
  // the way past activation or the trial-profit lock is a deposit: this sheet makes way for it, with the missing amount filled in
  const fundXeno = useFundXeno();
  const fund = (amount?: string) => {
    setOpen(false);
    fundXeno(amount);
  };
  const startOver = () => {
    setAddress("");
    setAmount("");
    setView({ kind: "form" });
  };

  return (
    <OpenWithdraw.Provider value={show}>
      {children}
      <Sheet open={open} onClose={close} title={tr("Withdraw USDT")} subtitle={tr(view.kind === "form" && withdrawActivation(qc.getQueryData<Trader>(qk.trader) ?? {}) ? "Account activation" : SUBTITLE[view.kind])} icon={<DirectionBadge dir="out" icon={ArrowUp02Icon} />}>
        {view.kind === "form" ? (
          <WithdrawForm address={address} setAddress={setAddress} amount={amount} setAmount={setAmount} onReview={() => setView({ kind: "review" })} onFund={fund} />
        ) : view.kind === "review" ? (
          <WithdrawReview
            address={address}
            amount={amount}
            onEdit={() => setView({ kind: "form" })}
            onCreated={(id) => setView({ kind: "status", id })}
            onFund={fund}
          />
        ) : (
          <WithdrawStatus key={view.id} id={view.id} onNew={startOver} onDone={close} />
        )}
      </Sheet>
    </OpenWithdraw.Provider>
  );
}

function usePolicy() {
  return useQuery({ queryKey: ["withdrawal-policy"], queryFn: API.withdrawalPolicy, staleTime: 5 * 60_000 });
}

const overLimit = (available: string, p: WithdrawalPolicy) => tr("You can withdraw up to {amount} {asset}", { amount: fmt(available), asset: p.asset });

/** Checked against the server's `withdrawable` only (never equity or cash minus the Trial grant); the POST checks again. */
function amountProblem(amount: string, available: string, p: WithdrawalPolicy) {
  if (!amount) return tr("Enter an amount");
  if (!isAmount(amount, 18, 8)) return tr("Max 8 decimals");
  if (cmp(amount, p.minimum) < 0) return tr("The minimum is {min} {asset}", { min: fmt(p.minimum), asset: p.asset });
  if (cmp(p.feeIncluded ? amount : add(amount, p.fee), available) > 0) return overLimit(available, p);
  return null;
}

/** What leaves the balance and what arrives in the wallet, depending on how the fee is charged. */
const split = (amount: string, p: WithdrawalPolicy) => ({
  debit: p.feeIncluded ? amount : add(amount, p.fee),
  receive: p.feeIncluded ? sub(amount, p.fee) : amount,
});

function WithdrawForm({
  address,
  setAddress,
  amount,
  setAmount,
  onReview,
  onFund,
}: {
  address: string;
  setAddress: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  onReview: () => void;
  onFund: (amount?: string) => void;
}) {
  const trader = useTrader();
  const policy = usePolicy();
  const { pending } = usePendingAction<Body>("withdraw");
  const [touched, setTouched] = useState(false);
  const [tried, setTried] = useState(false);

  // before anything about withdrawing, so it never waits on (or fails with) the withdrawal policy
  const activation = trader.data ? withdrawActivation(trader.data) : null;
  if (activation)
    return (
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-warning/12 text-warning">
          <Icon icon={LockIcon} size={26} />
        </span>
        <div>
          <h3 className="text-h2">{tr("Activate your account")}</h3>
          <p className="mt-1.5 text-body-sm text-muted-foreground">{tr("To withdraw, you need to activate your account.")}</p>
          <p className="mt-0.5 text-body-sm font-semibold">{activation.step}</p>
        </div>
        <Button size="lg" block icon={<Icon icon={ArrowDown02Icon} size={18} />} onClick={() => onFund(activation.amount)}>
          {tr("Deposit {n} USDT", { n: activation.amount })}
        </Button>
      </div>
    );

  if (trader.isPending || policy.isPending)
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label={tr("Loading")}>
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  if (!trader.data || policy.isError) return <ErrorState error={trader.error ?? policy.error} onRetry={() => (trader.refetch(), policy.refetch())} />;

  const p = policy.data;
  const t = trader.data;
  // migration, pending funding or missing prices: nothing can be asked for until the server clears it
  const blocked = withdrawalBlock(t);
  const available = blocked ? "0" : t.withdrawable;
  const belowMinimum = !blocked && cmp(available, p.minimum) < 0;
  // recent deposits' principal: a separate limit from the Trial grant, already left out of `withdrawable` by the server
  const locked = t.depositLocks?.items.length ? t.depositLocks : null;
  const addressOk = isEvmAddress(address);
  const addressError = !address ? tr("Enter your wallet address") : !addressOk ? tr("Invalid BEP20 address") : null;
  const addressInvalid = touched && !!address && !!addressError;
  const amountError = amountProblem(amount, available, p);
  // asking for more than is withdrawable is worth saying right away; the rest waits for "Review"
  const showAmountError = !!amount && (tried || amountError === overLimit(available, p));
  // the most you can type: all of it if the fee comes out of the amount, else what's left after the fee
  const max = p.feeIncluded ? trimZeros(available) : cmp(available, p.fee) > 0 ? trimZeros(sub(available, p.fee)) : "0";

  async function paste() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) {
        haptic.select();
        setAddress(t);
        setTouched(true);
      }
    } catch {
      toast(tr("Paste isn't available here"), { description: tr("Long-press to paste.") });
    }
  }

  function review() {
    setTried(true);
    setTouched(true);
    if (blocked || addressError || amountError) return haptic.error();
    haptic.tap();
    onReview();
  }

  return (
    <div className="flex flex-col gap-3">
      {/* what is being withdrawn, on which chain, and how much of it there is */}
      <div className="flex items-center gap-3 rounded-lg bg-surface-raised p-3">
        <span className="relative shrink-0">
          {USDT && <TokenIcon token={USDT} size={40} />}
          {BSC.icon && <Image src={BSC.icon} alt="" width={16} height={16} className="absolute -bottom-0.5 -end-0.5 size-4 rounded-full ring-2 ring-surface-raised" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold">{p.asset}</div>
          <div className="truncate text-caption text-muted-foreground">
            {BSC.name} ({BSC.tag})
          </div>
        </div>
        <div className="text-end">
          <div className="text-caption text-muted-foreground">{tr("Withdrawable")}</div>
          <div className="text-body-sm font-semibold tabular-nums">
            <bdi>{blocked ? "—" : fmt(available)} <span className="font-normal text-muted-foreground">{p.asset}</span></bdi>
          </div>
        </div>
      </div>

      {blocked ? (
        <Notice tone="warn" title={tr("Withdrawals are paused")}>
          {blocked}
        </Notice>
      ) : (
        belowMinimum && (
          <Notice tone="info" title={tr("Withdrawals start at {min} {asset}", { min: fmt(p.minimum), asset: p.asset })}>
            {sign(t.trialPrincipalRemaining) > 0 ? `${tr("The Trial grant can't be withdrawn; settled profit can.")} ` : ""}
            {locked ? `${tr("A deposit can be withdrawn {days} days after it's added.", { days: locked.durationDays })} ` : ""}
            {tr("Money in open trades frees up when they close.")}
          </Notice>
        )
      )}

      {pending && (
        <Notice tone="warn" title={tr("Last try didn't finish")}>
          {tr("Retry. It won't be sent twice.")}
        </Notice>
      )}

      <div>
        <div
          className={`flex items-center gap-3 min-h-18 rounded-lg border bg-surface-raised py-3 ps-3 pe-2.5 transition-colors ${
            addressInvalid ? "border-destructive" : addressOk ? TONE.out.border : `border-transparent ${TONE.out.focusWithin}`
          }`}
        >
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors ${
              addressInvalid ? "bg-destructive/12 text-destructive" : addressOk ? TONE.out.soft : "bg-surface text-muted-foreground"
            }`}
          >
            <Icon icon={addressOk ? Tick02Icon : Wallet01Icon} size={18} strokeWidth={addressOk ? 2.5 : 1.5} />
          </span>
          <label className="min-w-0 flex-1" htmlFor="withdraw-address">
            <span className="block text-caption text-muted-foreground">
              {tr("To your {asset} wallet · {tag}", { asset: p.asset, tag: BSC.tag ?? "" })}
            </span>
            <input
              id="withdraw-address"
              dir="ltr"
              value={address}
              onChange={(e) => setAddress(normalizeDigits(e.target.value.replace(/\s/g, "")))}
              onBlur={() => setTouched(true)}
              placeholder={tr("Paste a 0x… address")}
              aria-invalid={addressInvalid || undefined}
              aria-describedby="withdraw-address-hint"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              // outline-none! beats the global :focus-visible ring; the field's border already shows focus
              className="mt-0.5 block h-8 w-full truncate bg-transparent font-mono text-body text-foreground outline-none! placeholder:font-sans placeholder:text-subtle"
            />
          </label>
          {address ? (
            <button
              type="button"
              aria-label={tr("Clear address")}
              onClick={() => {
                haptic.select();
                setAddress("");
                setTouched(false);
              }}
              className="hit-area grid size-8 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground"
            >
              <Icon icon={Cancel01Icon} size={16} />
            </button>
          ) : (
            <button type="button" onClick={paste} className={`hit-area inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-label font-semibold ${TONE.out.soft}`}>
              <Icon icon={ClipboardPasteIcon} size={16} /> Paste
            </button>
          )}
        </div>
        <p id="withdraw-address-hint" role={addressInvalid ? "alert" : undefined} className={`mt-1.5 px-1 text-caption ${addressInvalid ? "text-destructive" : "text-muted-foreground"}`}>
          {addressInvalid ? addressError : tr("{tag} only. Other networks lose funds.", { tag: BSC.tag ?? "" })}
        </p>
      </div>

      <div className={`transition-opacity duration-200 ${addressOk && !blocked ? "" : "opacity-50"}`}>
        <AmountDial
          dir="out"
          label={tr("{asset} to withdraw", { asset: p.asset })}
          unit={p.asset}
          decimals={8}
          step="10"
          value={amount}
          onChange={setAmount}
          invalid={showAmountError && !!amountError}
          disabled={!addressOk || !!blocked}
          quick={[
            { label: tr("Min"), value: trimZeros(p.minimum) },
            { label: "25%", value: trimZeros(mulBps(max, 2500)) },
            { label: "50%", value: trimZeros(mulBps(max, 5000)) },
            { label: tr("Max"), value: max },
          ]}
        />
        {showAmountError && amountError && (
          <p role="alert" className="mt-1.5 px-1 text-label text-destructive">
            {amountError}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between px-1 text-label text-muted-foreground tabular-nums">
        <span>
          {tr(p.feeIncluded ? "Fee {fee} {asset}, included" : "Fee {fee} {asset}", { fee: fmt(p.fee), asset: p.asset })}
        </span>
        <span>
          {tx("You get {amount}", { amount: <span className="font-semibold text-foreground">{!amountError ? `${trimZeros(fmt(split(amount, p).receive, 8))} ${p.asset}` : "—"}</span> })}
        </span>
      </div>

      {sign(t.trialPrincipalRemaining) > 0 && (
        <p className="flex items-start gap-1.5 px-1 text-caption text-muted-foreground">
          <Icon icon={GiftIcon} size={14} className="mt-px shrink-0 text-warning" />
          {tr("The Trial grant can't be withdrawn and isn't part of this amount. Open trades aren't closed to free up money.")}
        </p>
      )}

      {locked && (
        <p className="flex items-start gap-1.5 px-1 text-caption text-muted-foreground">
          <Icon icon={LockIcon} size={14} className="mt-px shrink-0 text-info" />
          {locked.nextUnlockAt
            ? tr("{amount} {asset} from recent deposits is locked and isn't part of this amount; the next part unlocks {at}. Profits and referral income aren't locked.", { amount: fmt(locked.lockedPrincipal), asset: p.asset, at: fmtDateTime(locked.nextUnlockAt) })
            : tr("{amount} {asset} from recent deposits is locked and isn't part of this amount. Profits and referral income aren't locked.", { amount: fmt(locked.lockedPrincipal), asset: p.asset })}
        </p>
      )}

      <Button variant="outgoing" size="lg" block disabled={!!blocked || belowMinimum} onClick={review}>
        {tr("Review {asset} withdrawal", { asset: p.asset })}
      </Button>
    </div>
  );
}

function WithdrawReview({
  address,
  amount,
  onEdit,
  onCreated,
  onFund,
}: {
  address: string;
  amount: string;
  onEdit: () => void;
  onCreated: (id: string) => void;
  onFund: (amount?: string) => void;
}) {
  const policy = usePolicy();
  const invalidate = useInvalidateLedger();
  const { run, settle } = usePendingAction<Body>("withdraw");
  const [busy, setBusy] = useState(false);

  if (policy.isPending) return <Skeleton className="h-80 rounded-lg" />;
  if (policy.isError) return <ErrorState error={policy.error} onRetry={() => policy.refetch()} />;
  const p = policy.data;
  const { debit, receive } = split(amount, p);

  async function confirm() {
    setBusy(true);
    try {
      const w = await run({ amount, address, network: "bsc" }, API.createWithdrawal);
      haptic.success();
      invalidate();
      onCreated(w.id);
    } catch (e) {
      haptic.error();
      // the server re-checks everything here, even when Home showed enough; reread its numbers either way
      invalidate();
      if (e instanceof ApiError && e.status === 503 && /not reserved/i.test(e.message)) {
        // a definite no: nothing was held, so the next try is a new request rather than a retry
        settle();
        toast.error(tr("Couldn't withdraw right now"), { description: withdrawalErrorText(e.message) });
      } else if (apiErrorCode(e) === "TRIAL_PROFIT_LOCKED") {
        // a definite no: no request, reserve or code was made, so no code screen; the form shows the lock from the reread numbers
        settle();
        const lock = trialProfitLock(((e as ApiError).details as { details?: Parameters<typeof trialProfitLock>[0] } | null)?.details);
        toast(tr("Your trial profit is waiting"), {
          description: trialProfitText(lock) ?? serverText((e as ApiError).message),
          action: lock ? { label: tr("Fund XENO"), onClick: () => onFund(lock.amount) } : undefined,
        });
        onEdit();
      } else if (apiErrorCode(e) === "WITHDRAWAL_PRINCIPAL_LOCKED") {
        // the server's message and its next unlock; the numbers are reread above, and nothing is retried on its own
        const at = ((e as ApiError).details as { details?: { nextUnlockAt?: string | null } } | null)?.details?.nextUnlockAt;
        const message = serverText((e as ApiError).message).replace(/\.$/, "");
        toast.error(tr("Recent deposit still locked"), { description: `${message}.${at ? ` ${tr("Next unlock {at}.", { at: fmtDateTime(at) })}` : ""}` });
      } else if (e instanceof ApiError && e.uncertain) toast.error(tr("Not sure it worked"), { description: tr("Retry. It won't be sent twice.") });
      else if (e instanceof ApiError && e.status === 400) toast.error(tr("Withdrawal not accepted"), { description: withdrawalErrorText(e.message) });
      else {
        const d = describeError(e);
        toast.error(d.title, { description: d.detail });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center rounded-lg bg-surface-raised px-4 py-4 text-center">
        <span className={`grid size-10 place-items-center rounded-full ${TONE.out.soft}`}>
          <Icon icon={ArrowUp02Icon} />
        </span>
        <div className="mt-2 text-label text-muted-foreground">{tr("Your wallet receives")}</div>
        <div dir="ltr" className="mt-1 text-display tabular-nums">
          {trimZeros(fmt(receive, 8))} <span className="text-body font-medium text-muted-foreground">{p.asset}</span>
        </div>
      </div>

      <div className="divide-y divide-border rounded-lg bg-surface-raised px-4">
        <Row label={tr("From your account")}>
          {trimZeros(fmt(debit, 8))} {p.asset}
        </Row>
        <Row label={tr("Fee")}>
          {fmt(p.fee)} {p.asset}
        </Row>
        <Row label={tr("Network")}>
          <span className="inline-flex items-center gap-1.5">
            {BSC.icon && <Image src={BSC.icon} alt="" width={16} height={16} className="size-4 rounded-full" />}
            {BSC.name}
          </span>
        </Row>
      </div>

      <div className="rounded-lg bg-surface-raised p-3">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <Icon icon={Wallet01Icon} size={14} /> {tr("To this wallet")}
        </div>
        <div dir="ltr" className="mt-1 break-all text-start font-mono text-body-sm">{address}</div>
        <p className="mt-2 flex items-center gap-1.5 text-label text-warning">
          <Icon icon={Alert02Icon} size={14} className="shrink-0" /> {tr("Irreversible. Double-check the address.")}
        </p>
      </div>

      <p className="text-center text-caption text-muted-foreground">
        {tr("The full amount is held from your account as soon as the code is sent, and returns if the code expires or the transfer is cancelled.")}
      </p>
      <p className="flex items-center justify-center gap-1.5 text-label text-muted-foreground">
        <Icon icon={SentIcon} size={14} className="shrink-0 text-info" /> {tr("Next: confirm with a bot code")}
      </p>

      <div className="flex gap-2">
        <Button variant="secondary" size="lg" disabled={busy} onClick={onEdit}>
          {tr("Edit")}
        </Button>
        <Button variant="outgoing" size="lg" className="flex-1" loading={busy} icon={<Icon icon={SentIcon} size={18} />} onClick={confirm}>
          {tr("Send code")}
        </Button>
      </div>
    </div>
  );
}
