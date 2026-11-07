"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDown01Icon, LockIcon } from "@hugeicons/core-free-icons";
import type { DepositLocks } from "@/lib/api/types";
import { lockRows, timeLeft } from "@/lib/deposit-locks";
import { fmtDateTime } from "@/lib/format";
import { qk } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { t as tr } from "@/lib/i18n";
import { Icon } from "@/components/ui/icon";
import { Amount, Card } from "@/components/ui/primitives";

/**
 * Recent deposits whose principal can't be withdrawn yet, each on its own 7-day clock (GET /trader `depositLocks`). A schedule,
 * not a balance: Withdrawable is the server's figure and already accounts for it. When a clock runs out the account is reread;
 * the device clock itself never frees anything.
 */
export function DepositLocksCard({ locks }: { locks: DepositLocks }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const rows = lockRows(locks);
  const next = locks.nextUnlockAt ?? rows[0]?.unlockAt ?? null;
  const nextLeft = next ? timeLeft(next, now) : null;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);
  // ask the server again once the next lock is due; it drops the row when it really unlocks
  useEffect(() => {
    if (!next) return;
    const ms = Math.min(Math.max(Date.parse(next) - Date.now() + 1_500, 1_500), 2 ** 31 - 1);
    const t = setTimeout(() => qc.invalidateQueries({ queryKey: qk.trader }), ms);
    return () => clearTimeout(t);
  }, [next, qc]);

  return (
    <Card className="mt-3 px-4">
      <button
        type="button"
        onClick={() => {
          haptic.select();
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="flex min-h-16 w-full items-center gap-3 py-3 text-start"
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-info/14 text-info">
          <Icon icon={LockIcon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-body-sm font-semibold">{tr("Locked deposit principal")}</div>
          <div className="truncate text-label font-normal text-muted-foreground rtl:whitespace-normal">
            {nextLeft ? tr("Next unlock in {left}", { left: nextLeft }) : tr("Unlocking now")}
          </div>
        </div>
        <Amount value={locks.lockedPrincipal} unit={locks.asset} className="shrink-0 text-body-sm font-semibold" />
        <Icon icon={ArrowDown01Icon} size={18} className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
            <ul className="divide-y divide-border border-t border-border">
              {rows.map((r) => {
                const left = timeLeft(r.unlockAt, now);
                return (
                  <li key={r.depositId} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <Amount value={r.amount} unit={locks.asset} className="text-body-sm font-semibold" />
                      <div className="text-caption text-muted-foreground">{tr("Added {at}", { at: fmtDateTime(r.creditedAt) })}</div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="text-body-sm font-medium tabular-nums">{left ?? tr("Unlocking")}</div>
                      <div className="text-caption text-muted-foreground">{fmtDateTime(r.unlockAt)}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="border-t border-border py-3 text-caption text-muted-foreground">
              {tr("Each deposit can be withdrawn {days} days after it's added and trades the whole time. Profits and referral income aren't locked.", { days: locks.durationDays })}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
