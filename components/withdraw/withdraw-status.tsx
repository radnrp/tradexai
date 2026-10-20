"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "motion/react";
import { toast } from "sonner";
import { ArrowUp02Icon, CancelCircleIcon, CheckmarkCircle02Icon, HourglassIcon, LinkSquare02Icon, SentIcon, ShieldKeyIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { ApiError } from "@/lib/api/session";
import type { Withdrawal } from "@/lib/api/types";
import { BOT_USERNAME } from "@/lib/env";
import { fmtDateTime, shortAddr } from "@/lib/format";
import { describeError, WITHDRAWAL_FINAL, withdrawalStatus } from "@/lib/labels";
import { fmt, trimZeros } from "@/lib/money";
import { pollUntil, useInvalidateLedger } from "@/lib/queries";
import { haptic, openExternal } from "@/lib/telegram";
import { TONE } from "@/components/money/flow-ui";
import { Button } from "@/components/ui/button";
import { useCountdown } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { ErrorState, Notice, Pill, Row, Skeleton } from "@/components/ui/primitives";

const STAGES = ["Code", "Approved", "Sent", "Arrived"];
const stageOf = (s: string) => ({ awaiting_otp: 0, queued: 1, signed: 2, broadcast: 2, confirmed: 3 })[s] ?? 0;
const ENDED = new Set(["expired", "cancelled", "failed"]);
const usdt = (v: string | null | undefined) => `${trimZeros(fmt(v, 8))} USDT`;

export function WithdrawStatus({ id, onNew, onDone }: { id: string; onNew: () => void; onDone: () => void }) {
  const q = useQuery({ queryKey: ["withdrawal", id], queryFn: () => API.withdrawal(id), refetchInterval: pollUntil(WITHDRAWAL_FINAL, 10_000) });
  const invalidate = useInvalidateLedger();
  const prev = useRef<string | null>(null);

  useEffect(() => {
    const s = q.data?.status;
    if (!s) return;
    if (prev.current && prev.current !== s && WITHDRAWAL_FINAL.has(s)) invalidate();
    prev.current = s;
  }, [q.data?.status, invalidate]);

  if (q.isPending)
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading withdrawal">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const w = q.data;
  return w.status === "awaiting_otp" ? <CodeStep w={w} /> : <Result w={w} onNew={onNew} onDone={onDone} />;
}

/** "Sending 99 USDT to 0x12…abcd": what the code is about to approve. */
function Sending({ w }: { w: Withdrawal }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-raised p-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${TONE.out.soft}`}>
        <Icon icon={ArrowUp02Icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-label text-muted-foreground">You&apos;re sending</div>
        <div className="text-body font-semibold tabular-nums">{usdt(w.net_amount)}</div>
      </div>
      <div className="min-w-0 text-right">
        <div className="text-label text-muted-foreground">To</div>
        <div className="font-mono text-label">{shortAddr(w.address, 4)}</div>
      </div>
    </div>
  );
}

function CodeStep({ w }: { w: Withdrawal }) {
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [deliveryFailed, setDeliveryFailed] = useState(w.deliveryStatus === "failed" || w.otp_delivery === "failed");
  const [lastSent, setLastSent] = useState(() => new Date(w.created_at).getTime());
  const [now, setNow] = useState(() => Date.now());
  const expiry = useCountdown(w.otp_expires_at);
  const input = useRef<HTMLInputElement>(null);
  const cooldown = Math.max(0, 60 - Math.floor((now - lastSent) / 1000));
  const expired = !!w.otp_expires_at && expiry.left === 0;

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function confirm() {
    setBusy(true);
    try {
      const res = await API.confirmOtp(w.id, code);
      haptic.success();
      qc.setQueryData(["withdrawal", w.id], res);
      toast.success("Code accepted", { description: "Processing withdrawal." });
    } catch (e) {
      haptic.error();
      setCode("");
      const d = describeError(e);
      toast.error(e instanceof ApiError && e.status === 400 ? "That code didn't work" : d.title, { description: d.detail });
      input.current?.focus();
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ["withdrawal", w.id] });
    }
  }

  async function resend() {
    setResending(true);
    try {
      const res = await API.resendOtp(w.id);
      const sentAt = Date.now();
      setLastSent(sentAt);
      setNow(sentAt);
      setDeliveryFailed(res.deliveryStatus === "failed");
      if (res.deliveryStatus === "failed") haptic.warn();
      else toast.success("New code sent", { description: "Previous code is invalid." });
      qc.setQueryData(["withdrawal", w.id], res);
    } catch (e) {
      const d = describeError(e);
      toast.error(d.title, { description: d.detail });
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Sending w={w} />

      <div className="rounded-lg bg-surface-raised p-3.5">
        <div className="flex items-center gap-2.5">
          <span className={`grid size-8 shrink-0 place-items-center rounded-full ${TONE.out.soft}`}>
            <Icon icon={ShieldKeyIcon} size={16} />
          </span>
          <div>
            <h3 className="text-body-sm font-semibold">Enter the bot code</h3>
            <p className="text-caption text-muted-foreground">6-digit code from the bot</p>
          </div>
        </div>

        {deliveryFailed && (
          <div className="mt-3">
            <Notice tone="warn" title="The bot couldn't send it">
              Start the bot, then tap Resend.
            </Notice>
          </div>
        )}

        <label className="relative mt-3 block" onClick={() => input.current?.focus()}>
          <span className="sr-only">6-digit code</span>
          <input
            ref={input}
            autoFocus
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            disabled={busy || expired}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="absolute inset-0 opacity-0"
          />
          <div className="grid grid-cols-6 gap-2" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <motion.div
                key={i}
                animate={{ scale: code.length === i ? 1.04 : 1 }}
                transition={{ duration: 0.14 }}
                className={`grid h-13 place-items-center rounded-md border bg-surface text-h1 tabular-nums transition-colors ${
                  code.length === i && !busy && !expired ? TONE.out.border : code[i] ? "border-foreground/20" : ""
                }`}
              >
                {code[i] ?? ""}
              </motion.div>
            ))}
          </div>
        </label>

        <div className="mt-3 flex items-center justify-between text-label tabular-nums">
          <span className={expiry.left < 60 ? "text-warning" : "text-muted-foreground"}>
            {w.otp_expires_at ? (expired ? "Expired, checking…" : `Expires in ${expiry.text}`) : ""}
          </span>
          <button onClick={resend} disabled={cooldown > 0 || resending} className="hit-area font-semibold text-foreground disabled:text-muted-foreground">
            {resending ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="outgoing" size="lg" block loading={busy} disabled={code.length !== 6 || expired} onClick={confirm}>
          Confirm withdrawal
        </Button>
        {BOT_USERNAME && (
          <Button variant="ghost" block icon={<Icon icon={SentIcon} size={18} />} onClick={() => openExternal(`https://t.me/${BOT_USERNAME}`)}>
            Open the bot
          </Button>
        )}
      </div>
      <p className="text-center text-caption text-muted-foreground">5 wrong attempts cancel it</p>
    </div>
  );
}

function Result({ w, onNew, onDone }: { w: Withdrawal; onNew: () => void; onDone: () => void }) {
  const s = withdrawalStatus(w.status);
  const stage = stageOf(w.status);
  const ended = ENDED.has(w.status);
  const done = w.status === "confirmed";

  return (
    <div className="flex flex-col gap-4">
      {done ? (
        <div className="flex flex-col items-center py-2 text-center">
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.2, 0, 0, 1.2] }}
            className="grid size-18 place-items-center rounded-full bg-primary/12 text-primary"
          >
            <Icon icon={CheckmarkCircle02Icon} size={40} />
          </motion.div>
          <h3 className="mt-4 text-h1">Money sent</h3>
          <div className="mt-1 text-display tabular-nums">{usdt(w.net_amount)}</div>
          <p className="mt-1 text-body-sm text-muted-foreground">arrived in your wallet {fmtDateTime(w.confirmed_at)}</p>
        </div>
      ) : ended ? (
        <div className="flex flex-col items-center rounded-lg bg-surface-raised px-5 py-7 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-destructive/12 text-destructive">
            <Icon icon={CancelCircleIcon} size={28} />
          </span>
          <h3 className="mt-3 text-h2">Withdrawal {s.label.toLowerCase()}</h3>
          {s.hint && <p className="mt-1 text-body-sm text-muted-foreground">{s.hint}</p>}
          <Button variant="outgoing" className="mt-5" onClick={onNew}>
            Start a new withdrawal
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <Pill tone={s.tone}>{s.label}</Pill>
          </div>
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Withdrawal progress">
            {STAGES.map((label, i) => (
              <li key={label}>
                <div className="h-1 overflow-hidden rounded-full bg-surface-raised">
                  <motion.div
                    className="h-full rounded-full bg-info"
                    initial={{ width: 0 }}
                    animate={{ width: i < stage ? "100%" : i === stage ? "50%" : "0%" }}
                    transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
                  />
                </div>
                <div className={`mt-1.5 text-caption ${i <= stage ? "text-foreground" : "text-muted-foreground"}`}>{label}</div>
              </li>
            ))}
          </ol>
          <div className="flex items-start gap-3 rounded-lg bg-surface-raised p-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${TONE.out.soft}`}>
              <Icon icon={HourglassIcon} size={18} />
            </span>
            <div>
              <div className="text-body-sm font-semibold">{s.label}</div>
              {s.hint && <p className="mt-0.5 text-body-sm text-muted-foreground">{s.hint}</p>}
            </div>
          </div>
        </>
      )}

      <div className="divide-y divide-border rounded-lg bg-surface-raised px-4">
        <Row label="From balance">{usdt(w.amount)}</Row>
        <Row label="Fee">{usdt(w.fee)}</Row>
        <Row label="You receive" strong>
          {usdt(w.net_amount)}
        </Row>
        <Row label="Date">{fmtDateTime(w.created_at)}</Row>
      </div>
      <div className="rounded-lg bg-surface-raised p-3">
        <div className="text-caption text-muted-foreground">To this wallet</div>
        <div className="mt-1 break-all font-mono text-body-sm">{w.address}</div>
      </div>

      {w.tx_hash && (
        <Button variant="secondary" block icon={<Icon icon={LinkSquare02Icon} size={18} />} onClick={() => openExternal(`https://bscscan.com/tx/${w.tx_hash}`)}>
          View on BscScan
        </Button>
      )}
      {!ended && (
        <Button variant="secondary" size="lg" block onClick={onDone}>
          {done ? "Done" : "Close"}
        </Button>
      )}
      {!done && !ended && <p className="text-center text-caption text-muted-foreground">Safe to close · tracked in Wallet</p>}
    </div>
  );
}
