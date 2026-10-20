"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Alert02Icon, CancelCircleIcon, CheckmarkCircle02Icon, HourglassIcon, QrCodeIcon, Refresh01Icon, Timer02Icon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { apiErrorCode } from "@/lib/api/session";
import type { Deposit } from "@/lib/api/types";
import { fmtAgo, shortAddr } from "@/lib/format";
import { fmt } from "@/lib/money";
import { DEPOSIT_FINAL, depositStatus, describeError } from "@/lib/labels";
import { pollUntil, qk, useInvalidateLedger } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { CopyButton, useCountdown } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Amount, ErrorState, Pill, Row, Skeleton } from "@/components/ui/primitives";
import { networkInfo, tokenByCode } from "./options";
import { TokenIcon } from "./token-icon";

const REFRESH_MS = 30_000;
const STAGES = ["Created", "Paid", "Checking", "Added"];
const stageOf = (s: string) => (s === "credited" ? 3 : ["confirming", "confirmed", "sending", "partially_paid"].includes(s) ? 2 : s === "waiting" ? 1 : 0);
// only these may show an address to pay; review and creation_unknown must never invite a payment
const AWAITING = new Set(["waiting", "creating"]);

export function DepositPayment({ id, onNew, onDone }: { id: string; onNew: () => void; onDone: () => void }) {
  // re-checks every 30s until a final status; paused while the app is in the background
  const q = useQuery({ queryKey: ["deposit", id], queryFn: () => API.deposit(id), refetchInterval: pollUntil(DEPOSIT_FINAL, REFRESH_MS) });
  const invalidate = useInvalidateLedger();
  const wasCredited = useRef<boolean | null>(null);

  useEffect(() => {
    if (!q.data) return;
    const credited = q.data.status === "credited";
    if (wasCredited.current === false && credited) {
      haptic.success();
      invalidate();
    }
    wasCredited.current = credited;
  }, [q.data, invalidate]);

  if (q.isPending)
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading deposit">
        <Skeleton className="h-12 rounded-md" />
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-72 rounded-lg" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  return (
    <PaymentView
      d={q.data}
      checkedAt={q.dataUpdatedAt}
      refreshing={q.isFetching}
      recheck={q.refetch}
      onRefresh={() => {
        haptic.tap();
        q.refetch();
      }}
      onNew={onNew}
      onDone={onDone}
    />
  );
}

function PaymentView({
  d,
  checkedAt,
  refreshing,
  recheck,
  onRefresh,
  onNew,
  onDone,
}: {
  d: Deposit;
  checkedAt: number;
  refreshing: boolean;
  recheck: () => unknown;
  onRefresh: () => void;
  onNew: () => void;
  onDone: () => void;
}) {
  const s = depositStatus(d.status);
  const token = tokenByCode(d.pay_currency);
  const network = token ? networkInfo(token.network) : null;
  const coin = token?.currency ?? d.pay_currency.toUpperCase();
  const awaiting = AWAITING.has(d.status);
  const timer = useCountdown(awaiting ? d.expires_at : null);
  // past the deadline the address must not be shown, even before the server flips the status;
  // but only the server may call it expired, so until then it reads "Time's up" and we re-check
  const timedOut = awaiting && !!d.expires_at && timer.left === 0;
  const failed = s.tone === "bad" || timedOut || d.status === "cancelled";
  const showPay = !failed && awaiting && !!d.address;
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function cancel() {
    setCancelling(true);
    try {
      qc.setQueryData(["deposit", d.id], await API.cancelDeposit(d.id));
      haptic.success();
      toast.success("Deposit cancelled");
      setConfirmCancel(false);
    } catch (e) {
      haptic.error();
      if (apiErrorCode(e) === "DEPOSIT_NOT_CANCELLABLE") {
        toast.error("It can't be cancelled now", { description: "A payment may be in progress." });
        setConfirmCancel(false);
      } else {
        const x = describeError(e);
        toast.error(x.title, { description: x.detail });
      }
      recheck();
    } finally {
      setCancelling(false);
      qc.invalidateQueries({ queryKey: qk.deposits });
    }
  }

  // ask the server as soon as the clock runs out instead of waiting for the next 30s tick
  useEffect(() => {
    if (timedOut) recheck();
  }, [timedOut, recheck]);

  if (d.status === "credited")
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.2, 0, 0, 1.2] }}
          className="grid size-18 place-items-center rounded-full bg-primary/12 text-primary"
        >
          <Icon icon={CheckmarkCircle02Icon} size={40} />
        </motion.div>
        <h3 className="mt-4 text-h1">Money added</h3>
        <div className="mt-2 text-display">
          <Amount value={d.credited_amount} unit={d.asset} />
        </div>
        <p className="mt-1 text-body-sm text-muted-foreground">is now in your balance.</p>
        <div className="mt-7 flex w-full flex-col gap-2">
          <Button as="a" href="/agents" size="lg" block onClick={onDone}>
            Start an agent
          </Button>
          <Button variant="secondary" size="lg" block onClick={onDone}>
            Done
          </Button>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <StatusBar label={timedOut ? "Time's up" : s.label} tone={timedOut ? "pending" : s.tone} checkedAt={checkedAt} refreshing={refreshing} onRefresh={onRefresh} />
      <Progress stage={stageOf(d.status)} failed={failed} done={false} />

      {failed ? (
        <div className="flex flex-col items-center rounded-lg bg-surface-raised px-5 py-7 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-destructive/12 text-destructive">
            <Icon icon={CancelCircleIcon} size={28} />
          </span>
          <h3 className="mt-3 text-h2">
            {timedOut ? "Time's up" : d.status === "expired" ? "This deposit has expired" : d.status === "cancelled" ? "Deposit cancelled" : s.label}
          </h3>
          <p className="mt-1 text-body-sm text-muted-foreground">
            {timedOut
              ? "Checking status. Don't send to this address."
              : d.status === "expired" || d.status === "cancelled"
                ? "Don't send to this address. Late payments can still be credited."
                : (d.last_error ?? s.hint)}
          </p>
          <Button className="mt-5" onClick={onNew}>
            Start a new deposit
          </Button>
        </div>
      ) : d.status === "creation_unknown" ? (
        <div className="rounded-lg bg-warning/10 p-4" role="status">
          <div className="flex items-center gap-3">
            <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-warning border-t-transparent" aria-hidden />
            <div className="text-body-sm font-semibold">Confirming payment…</div>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-body-sm text-foreground/85">
            <Icon icon={Alert02Icon} size={16} className="mt-0.5 shrink-0 text-warning" />
            Don&apos;t send any money yet. The address and amount will show here once it&apos;s confirmed.
          </p>
          {/* dev only: the server's reason helps debug a stuck deposit; never shown to users */}
          {process.env.NODE_ENV === "development" && d.last_error && <p className="mt-2 font-mono text-caption text-muted-foreground">{d.last_error}</p>}
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-warning/20 pt-2 text-caption text-muted-foreground">
            <span>
              Deposit ID <span className="font-mono text-foreground">{shortAddr(d.id, 4)}</span>
            </span>
            <CopyButton text={d.id} />
          </div>
        </div>
      ) : !awaiting ? (
        <div className="flex items-start gap-3 rounded-lg bg-surface-raised p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/12 text-warning">
            <Icon icon={HourglassIcon} />
          </span>
          <div>
            <div className="text-body-sm font-semibold">{s.label}</div>
            {s.hint && <p className="mt-0.5 text-body-sm text-muted-foreground">{s.hint}</p>}
          </div>
        </div>
      ) : !d.address ? (
        <div className="flex items-center gap-3 rounded-lg bg-surface-raised p-4" role="status">
          <span className="size-5 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
          <div className="text-body-sm text-muted-foreground">Getting your deposit address…</div>
        </div>
      ) : (
        <>
          {d.expires_at && <Deadline left={timer.left} text={timer.text} />}

          <PayDetails d={d} coin={coin} token={token} networkName={network?.name} />

          {/* only a waiting deposit with no payment seen yet can be cancelled */}
          {d.status === "waiting" && (
            <Button variant="secondary" block onClick={() => setConfirmCancel(true)}>
              Cancel deposit
            </Button>
          )}
          <ConfirmDialog
            open={confirmCancel}
            onClose={() => setConfirmCancel(false)}
            title="Cancel this deposit?"
            description={<p>Only cancel if you haven&apos;t sent funds.</p>}
            confirmLabel="Cancel deposit"
            cancelLabel="Keep it"
            busy={cancelling}
            onConfirm={cancel}
          />
        </>
      )}

      {!showPay && (
        <div className="rounded-lg bg-surface-raised px-4">
          <Row label="Deposit">{`$${fmt(d.requested_usd)}`}</Row>
        </div>
      )}
      <p className="text-center text-caption text-muted-foreground">Safe to close · tracked in Wallet</p>
    </div>
  );
}

/** What to send and where, as the steps a wallet asks for: amount, address, then memo if there is one. */
function PayDetails({ d, coin, token, networkName }: { d: Deposit; coin: string; token: ReturnType<typeof tokenByCode>; networkName?: string }) {
  const [qr, setQr] = useState(false);
  const address = d.address ?? "";
  return (
    <div className="divide-y divide-border rounded-lg bg-surface-raised">
      <PayStep n={1} title="Send exactly">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 text-h1 tabular-nums">
              {token && <TokenIcon token={token} size={24} />}
              <span className="break-all">{d.pay_amount ?? "—"}</span>
              <span className="text-body font-medium text-muted-foreground">{coin}</span>
            </div>
            <div className="mt-0.5 text-caption text-muted-foreground">
              Worth about ${fmt(d.requested_usd)}. Your wallet&apos;s network fee comes on top.
            </div>
          </div>
          {d.pay_amount && <CopyButton text={d.pay_amount} />}
        </div>
      </PayStep>

      <PayStep n={2} title={networkName ? `To this ${networkName} address` : "To this address"}>
        {/* groups of four are easier to check against the wallet; Copy and QR carry the raw address */}
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 font-mono text-body-sm leading-6" title={address}>
          {address.match(/.{1,4}/g)?.map((g, i) => (
            <span key={i} className={i === 0 || i === Math.ceil(address.length / 4) - 1 ? "font-semibold text-foreground" : "text-foreground/80"}>
              {g}
            </span>
          ))}
        </div>
        <div className="mt-2.5 flex gap-2">
          <CopyButton text={address} label="Copy address" />
          {d.qrDataUrl && (
            <button
              type="button"
              onClick={() => setQr((v) => !v)}
              aria-expanded={qr}
              className="hit-area inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-label text-foreground"
            >
              <Icon icon={QrCodeIcon} size={16} /> {qr ? "Hide QR" : "Show QR"}
            </button>
          )}
        </div>
        <AnimatePresence initial={false}>
          {qr && d.qrDataUrl && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
              <div className="mt-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={d.qrDataUrl} alt={`QR code of the ${coin} deposit address`} className="size-36 shrink-0 rounded-md bg-white p-2" />
                <p className="text-caption text-muted-foreground">The QR holds the address only. Type the exact amount{d.extra_id ? " and memo" : ""} in your wallet yourself.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PayStep>

      {d.extra_id && (
        <PayStep n={3} title="Add this memo" warn>
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 break-all font-mono text-h2">{d.extra_id}</span>
            <CopyButton text={d.extra_id} />
          </div>
          <p className="mt-1.5 text-caption text-warning">Required, or the payment can&apos;t be matched.</p>
        </PayStep>
      )}

      <p className="flex items-center gap-2 px-4 py-3 text-caption text-foreground/85">
        <Icon icon={Alert02Icon} size={14} className="shrink-0 text-warning" />
        Send only {coin}
        {networkName ? ` on ${networkName}` : ""}. Other tokens or networks are lost.
      </p>
    </div>
  );
}

function PayStep({ n, title, warn, children }: { n: number; title: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <section className="p-4">
      <h4 className="mb-2 flex items-center gap-2 text-label text-muted-foreground">
        <span className={`grid size-5 place-items-center rounded-full text-caption font-bold ${warn ? "bg-warning text-primary-foreground" : "bg-foreground text-background"}`}>{n}</span>
        {title}
      </h4>
      {children}
    </section>
  );
}

function StatusBar({
  label,
  tone,
  checkedAt,
  refreshing,
  onRefresh,
}: {
  label: string;
  tone: Parameters<typeof Pill>[0]["tone"];
  checkedAt: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Pill tone={tone}>{label}</Pill>
        <div className="mt-1 px-0.5 text-caption text-muted-foreground">Checked {fmtAgo(checkedAt)}</div>
      </div>
      <Button size="sm" variant="secondary" loading={refreshing} icon={<Icon icon={Refresh01Icon} size={16} />} onClick={onRefresh}>
        Refresh status
      </Button>
    </div>
  );
}

function Progress({ stage, failed, done }: { stage: number; failed: boolean; done: boolean }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Deposit progress">
      {STAGES.map((label, i) => (
        <li key={label}>
          <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
            <motion.div
              className={`h-full rounded-full ${failed && i === stage ? "bg-destructive" : "bg-primary"}`}
              initial={{ width: 0 }}
              animate={{ width: i < stage || (i === stage && (done || failed)) ? "100%" : i === stage ? "50%" : "0%" }}
              transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
            />
          </div>
          <div className={`mt-1.5 text-caption ${i <= stage ? "text-foreground" : "text-muted-foreground"}`}>{label}</div>
        </li>
      ))}
    </ol>
  );
}

/** The time limit as one line: the countdown and why it matters. */
function Deadline({ left, text }: { left: number; text: string }) {
  const urgent = left < 5 * 60;
  const color = urgent ? "text-destructive" : "text-warning";
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 ${urgent ? "bg-destructive/10" : "bg-warning/10"}`}>
      <Icon icon={Timer02Icon} size={18} className={`shrink-0 ${color}`} />
      <span className={`text-h2 tabular-nums ${color}`} role="timer" aria-live="off">
        {text}
      </span>
      <span className="text-body-sm text-muted-foreground">left</span>
      <span className="ml-auto text-caption text-foreground/85">Time left</span>
    </div>
  );
}
