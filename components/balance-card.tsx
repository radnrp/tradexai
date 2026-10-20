"use client";
import Link from "next/link";
import { useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { motion } from "motion/react";
import { Add01Icon, ArrowDown02Icon, ArrowUp02Icon, GiftIcon, Refresh01Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import type { Wallet } from "@/lib/api/types";
import { add, cmp, fmt } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { useOpenWithdraw } from "@/components/withdraw/withdraw-sheet";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/primitives";

// no href: the action opens its bottom sheet instead of a page
const ACTIONS: { href?: string; sheet?: "deposit" | "withdraw"; label: string; icon: typeof ArrowDown02Icon }[] = [
  { sheet: "deposit", label: "Deposit", icon: ArrowDown02Icon },
  { sheet: "withdraw", label: "Withdraw", icon: ArrowUp02Icon },
  { href: "/agents#choose", label: "New agent", icon: Add01Icon },
  { href: "/referrals", label: "Invite", icon: GiftIcon },
];
const HIDE_KEY = "txai.hideBalance";

/** Where the money sits: free cash, capital inside agents, and reserves (positive balances only). */
export function balanceSplit(wallet: Wallet) {
  let inAgents = "0";
  let reserved = "0";
  for (const a of wallet.accounts) {
    if (cmp(a.balance, "0") <= 0) continue;
    const [owner, , kind] = a.id.split(":");
    if (owner === "agent") inAgents = add(inAgents, a.balance);
    else if (owner === "user" && kind !== "available") reserved = add(reserved, a.balance);
  }
  return { inAgents, reserved, total: add(add(wallet.available, inAgents), reserved) };
}

/** Dashboard hero: the one gradient card, total balance and the four quick actions. */
export function BalanceCard({ wallet }: { wallet: UseQueryResult<Wallet> }) {
  // only rendered client-side after sign-in, so storage is readable on first render
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    haptic.select();
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? "0" : "1");
      } catch {}
      return !h;
    });
  };
  const mask = (s: string) => (hidden ? "••••" : s);
  const openDeposit = useOpenDeposit();
  const openWithdraw = useOpenWithdraw();

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}>
      <Card hero className="p-5">
        <div className="flex items-center gap-1.5 text-label text-white/75">
          Total balance
          <button type="button" onClick={toggle} aria-label={hidden ? "Show balance" : "Hide balance"} aria-pressed={hidden} className="hit-area grid size-6 place-items-center rounded-full">
            <Icon icon={hidden ? ViewOffSlashIcon : ViewIcon} size={16} />
          </button>
        </div>

        {wallet.isPending ? (
          <div className="mt-2 space-y-2" aria-busy aria-label="Loading balance">
            <div className="h-9.5 w-48 animate-pulse rounded-md bg-white/10" />
            <div className="h-4 w-36 animate-pulse rounded-md bg-white/10" />
          </div>
        ) : wallet.isError ? (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-body-sm text-white/85">Couldn&apos;t load balance</p>
            <button type="button" onClick={() => wallet.refetch()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/12 px-3 text-label">
              <Icon icon={Refresh01Icon} size={16} /> Retry
            </button>
          </div>
        ) : (
          <Figures wallet={wallet.data} mask={mask} />
        )}

        <nav className="mt-6 grid grid-cols-4 gap-2" aria-label="Quick actions">
          {ACTIONS.map(({ href, sheet, label, icon }, i) => {
            const cls = "group flex w-full flex-col items-center gap-2 text-label text-white";
            const inner = (
              <>
                <span className="grid size-12 place-items-center rounded-full bg-white/12 transition-transform duration-100 group-active:scale-95">
                  <Icon icon={icon} size={22} />
                </span>
                {label}
              </>
            );
            return (
              <motion.div key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 + i * 0.03, duration: 0.2 }}>
                {href ? (
                  <Link href={href} onClick={() => haptic.tap()} className={cls}>
                    {inner}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      haptic.tap();
                      if (sheet === "withdraw") openWithdraw();
                      else openDeposit();
                    }}
                    className={cls}
                  >
                    {inner}
                  </button>
                )}
              </motion.div>
            );
          })}
        </nav>
      </Card>
    </motion.div>
  );
}

function Figures({ wallet, mask }: { wallet: Wallet; mask: (s: string) => string }) {
  const { inAgents, reserved, total } = balanceSplit(wallet);
  return (
    <>
      <div className="mt-2 flex items-baseline gap-2">
        {/* digits crossfade with a 4px lift when the balance changes */}
        <motion.span key={mask(total)} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="text-display tabular-nums" title={total}>
          {mask(fmt(total))}
        </motion.span>
        <span className="text-body-sm font-medium text-white/75">{wallet.asset}</span>
      </div>
      <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-label text-white/75">
        <div className="flex gap-1">
          <dt>Available</dt>
          <dd className="font-semibold text-white tabular-nums">{mask(fmt(wallet.available))} {wallet.asset}</dd>
        </div>
        {cmp(inAgents, "0") > 0 && (
          <div className="flex gap-1">
            <dt>In agents</dt>
            <dd className="font-semibold text-white tabular-nums">{mask(fmt(inAgents))} {wallet.asset}</dd>
          </div>
        )}
        {cmp(reserved, "0") > 0 && (
          <div className="flex gap-1">
            <dt>On hold</dt>
            <dd className="font-semibold text-white tabular-nums">{mask(fmt(reserved))} {wallet.asset}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
