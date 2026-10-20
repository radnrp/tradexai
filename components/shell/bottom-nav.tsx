"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ChartLineData01Icon, GiftIcon, Home01Icon, Robot01Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { haptic } from "@/lib/telegram";
import { Icon } from "@/components/ui/icon";

const TABS = [
  { href: "/", label: "Home", icon: Home01Icon },
  { href: "/agents", label: "Agents", icon: Robot01Icon },
  { href: "/wallet", label: "Wallet", icon: Wallet01Icon },
  { href: "/statements", label: "Statement", icon: ChartLineData01Icon },
  { href: "/referrals", label: "Invite", icon: GiftIcon },
];
export const TAB_ROOTS = TABS.map((t) => t.href);

/** Shown on the five root screens only (L0); focused flows get the full screen and a Back. */
export function BottomNav() {
  const pathname = usePathname();
  if (!TAB_ROOTS.includes(pathname)) return null;
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background">
      <ul className="mx-auto flex h-16 max-w-150 items-stretch">
        {TABS.map(({ href, label, icon }) => {
          const active = pathname === href;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                onClick={() => !active && haptic.select()}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-caption font-medium transition-colors duration-200 ${active ? "text-foreground" : "text-muted-foreground"}`}
              >
                <motion.span key={String(active)} initial={active ? { scale: 0.94 } : false} animate={{ scale: 1 }} transition={{ duration: 0.18 }} className="flex">
                  <Icon icon={icon} strokeWidth={active ? 2 : 1.5} />
                </motion.span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
