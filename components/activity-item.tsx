"use client";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDataTransferHorizontalIcon, ArrowDown02Icon, ArrowUp02Icon, Coins01Icon, Invoice01Icon } from "@hugeicons/core-free-icons";
import type { ActivityJournal } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";
import { accountLabel, journalKind } from "@/lib/labels";
import { cmp } from "@/lib/money";
import { Icon } from "@/components/ui/icon";
import { Amount } from "@/components/ui/primitives";

const ICON = { deposit: ArrowDown02Icon, withdrawal: ArrowUp02Icon, trade_fee: Invoice01Icon } as const;

/** Lines are per-account movements; an internal transfer nets to zero but is still real activity. */
export function ActivityItem({ j, names }: { j: ActivityJournal; names: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const icon = ICON[j.kind as keyof typeof ICON] ?? (j.kind.startsWith("trade") ? Coins01Icon : ArrowDataTransferHorizontalIcon);
  const internal = cmp(j.net_amount, "0") === 0;
  return (
    <div>
      <button className="flex min-h-16 w-full items-center gap-3 py-3 text-left" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-foreground">
          <Icon icon={icon} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-sm font-medium">{journalKind(j.kind)}</div>
          <div className="text-label font-normal text-muted-foreground">{fmtDateTime(j.created_at)}</div>
        </div>
        {internal ? (
          <span className="text-label text-muted-foreground">Internal move</span>
        ) : (
          <Amount value={j.net_amount} unit="USDT" signed colored className="text-body-sm font-semibold" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden pb-3 pl-13"
          >
            {j.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 py-1 text-label font-normal">
                <span className="truncate text-muted-foreground">{accountLabel(l.accountId, names)}</span>
                <Amount value={l.amount} unit="USDT" signed dp={2} />
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}
