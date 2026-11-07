"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  ChartLineData01Icon,
  HourglassIcon,
  QrCodeIcon,
  Refresh01Icon,
  WalletRemove01Icon,
} from "@hugeicons/core-free-icons";
import type { RecommendedCta } from "@/lib/api/types";
import { haptic } from "@/lib/telegram";
import { ctaCopy } from "@/lib/trader";
import { t as tr } from "@/lib/i18n";
import { useFundXeno, useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { useOpenWithdraw } from "@/components/withdraw/withdraw-sheet";
import { Icon } from "@/components/ui/icon";

const KEY = "txai.cta.";
const SNOOZE_MS = 24 * 3_600_000;

// Each state's colours (deep enough for white text) and its icon; adding capital shows the coin pile instead of an icon.
const VIOLET = "[--cta-from:#5b7cff] [--cta-to:#7a4fe6]";
const GREEN = "[--cta-from:#16a34a] [--cta-to:#075e2d]";
const LOOK: Record<string, { colors: string; icon?: IconSvgElement }> = {
  continue_deposit: { colors: "[--cta-from:#e39a12] [--cta-to:#b9580c]", icon: QrCodeIcon },
  deposit_processing: { colors: "[--cta-from:#3b82f6] [--cta-to:#1e40af]", icon: HourglassIcon },
  track_withdrawal: { colors: "[--cta-from:#14b8a6] [--cta-to:#0f5f6e]", icon: ArrowUp02Icon },
  view_trader_status: { colors: "[--cta-from:#f97316] [--cta-to:#b8360c]", icon: Alert02Icon },
  restore_capital: { colors: "[--cta-from:#ef4444] [--cta-to:#991b3b]", icon: WalletRemove01Icon },
  review_performance: { colors: "[--cta-from:#64748b] [--cta-to:#2b3646]", icon: ChartLineData01Icon },
  retry_deposit: { colors: "[--cta-from:#ec4899] [--cta-to:#9d174d]", icon: Refresh01Icon },
  fund_after_trial: { colors: VIOLET },
  fund_profitable_trial: { colors: VIOLET },
  fund_trial: { colors: VIOLET },
  add_after_withdrawal: { colors: GREEN },
  add_to_profitable_account: { colors: GREEN },
  add_capital: { colors: GREEN },
  continue_with_real_funds: { colors: VIOLET },
  fund_to_unlock_trial_profit: { colors: VIOLET },
};

/**
 * The one next step GET /trader recommends (engagement.recommendedCta), worded here, as a slim banner fixed above the bottom
 * nav whose colour and icon follow the state. Opening a deposit or withdrawal only shows that one: a new payment is made only from
 * the deposit form, by the user. Every banner has a ✕: a dismissible step then stays hidden for a day on this device, per
 * account and code; a status the server won't let be dismissed (a deposit, a withdrawal, the agent) shrinks to a small badge
 * instead, so it stays in reach, and a tap opens it again. A new code shows in full again.
 */
export function NextStepCard({ cta, userId }: { cta: RecommendedCta; userId: string }) {
  const key = `${KEY}${userId}.${cta.code}`;
  return <NextStep key={key} cta={cta} storageKey={key} />;
}

function NextStep({ cta, storageKey }: { cta: RecommendedCta; storageKey: string }) {
  const router = useRouter();
  const openDeposit = useOpenDeposit();
  const fundXeno = useFundXeno();
  const openWithdraw = useOpenWithdraw();
  const [closed, setClosed] = useState(() => {
    try {
      return Date.now() - Number(localStorage.getItem(storageKey) ?? 0) < SNOOZE_MS;
    } catch {
      return false;
    }
  });
  const copy = ctaCopy(cta.code);
  const look = LOOK[cta.code];
  const actions: Record<string, () => void> = {
    open_deposit: () => openDeposit(cta.targetId ?? undefined),
    open_withdrawal: () => openWithdraw(cta.targetId ?? undefined),
    // a new deposit is the "fund XENO" step, so its tap is counted; opening an existing payment isn't
    open_deposit_create: fundXeno,
    open_trader_status: () => router.push("/agents"),
    open_statement: () => router.push("/statements"),
  };
  const act = actions[cta.action];
  if (!copy || !look || !act || (closed && cta.dismissible)) return null;

  const run = () => {
    haptic.tap();
    act();
  };
  const setStored = (on: boolean) => {
    setClosed(on);
    try {
      if (on) localStorage.setItem(storageKey, String(Date.now()));
      else localStorage.removeItem(storageKey);
    } catch {}
  };
  const art = (size: string) => (look.icon ? <Icon icon={look.icon} size={20} strokeWidth={1.8} /> : <CoinStack className={size} />);

  if (closed)
    return (
      <FixedBanner>
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={tr("{title}. Show", { title: copy.title })}
            onClick={() => {
              haptic.tap();
              setStored(false);
            }}
            className={`cta-surface pointer-events-auto grid size-11 place-items-center rounded-full text-white ring-1 ring-white/30 shadow-[0_8px_20px_-10px_var(--cta-from)] active:scale-95 ${look.colors}`}
          >
            {art("h-7 w-9")}
          </button>
        </div>
      </FixedBanner>
    );

  // one slim row, so it stays a hint at the bottom rather than the focus of the screen
  return (
    <FixedBanner>
      <div
        className={`cta-surface pointer-events-auto flex items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-white shadow-[0_10px_24px_-16px_var(--cta-from)] ${look.colors}`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/18 ring-1 ring-white/25">{art("h-8 w-10")}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body-sm font-bold">{copy.title}</div>
          <p className="line-clamp-2 text-caption leading-snug text-white/85">{copy.text}</p>
        </div>
        <button
          type="button"
          aria-label={copy.button}
          onClick={run}
          className="hit-area h-8 shrink-0 whitespace-nowrap rounded-full bg-white px-3.5 text-label font-bold text-[var(--cta-to)] active:brightness-95"
        >
          {copy.short}
        </button>
        <button
          type="button"
          aria-label={tr(cta.dismissible ? "Not now" : "Minimize")}
          onClick={() => {
            haptic.select();
            setStored(true);
          }}
          className="hit-area -ms-1 grid size-6 shrink-0 place-items-center rounded-full text-white/75 active:text-white"
        >
          <Icon icon={Cancel01Icon} size={14} />
        </button>
      </div>
    </FixedBanner>
  );
}

/**
 * Pinned right above the bottom nav while the page scrolls under it. Portalled to <body>, since the page's own enter
 * animation can transform <main> and pin a fixed child to it instead of the screen; its height goes into --cta-space so
 * the end of the page still clears it. Only the banner or badge itself takes taps (pointer-events-auto); the rest of the
 * row passes them through to the page.
 */
function FixedBanner({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty("--cta-space", `${el.offsetHeight}px`));
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--cta-space");
    };
  }, []);

  return createPortal(
    <div ref={ref} className="above-nav pointer-events-none fixed inset-x-0 z-30 pb-2">
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
        className="mx-auto max-w-150 px-4 min-[390px]:px-5"
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

/** A small pile of gold coins for the banner; decorative only. */
function CoinStack({ className }: { className: string }) {
  // drawn bottom-up so each coin sits on the one below; the right pile first, so the left one overlaps it
  const coins = [
    [52, 46],
    [52, 39.5],
    [26, 48],
    [26, 41.5],
    [26, 35],
    [26, 28.5],
  ];
  return (
    <svg viewBox="0 0 76 60" className={className} aria-hidden>
      <defs>
        <linearGradient id="cta-coin-top" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0a8" />
          <stop offset="0.55" stopColor="#ffcf4a" />
          <stop offset="1" stopColor="#f2a516" />
        </linearGradient>
        <linearGradient id="cta-coin-side" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d18a10" />
          <stop offset="0.5" stopColor="#f6b630" />
          <stop offset="1" stopColor="#b8730a" />
        </linearGradient>
      </defs>
      <ellipse cx="40" cy="55" rx="34" ry="4" fill="rgb(0 0 0 / 0.18)" />
      {coins.map(([cx, cy]) => (
        <g key={`${cx}:${cy}`}>
          <path d={`M${cx - 15} ${cy}v5a15 5.5 0 0 0 30 0v-5z`} fill="url(#cta-coin-side)" />
          <ellipse cx={cx} cy={cy} rx="15" ry="5.5" fill="url(#cta-coin-top)" stroke="#fff6d0" strokeOpacity="0.7" strokeWidth="0.8" />
          <ellipse cx={cx} cy={cy} rx="9.5" ry="3.2" fill="none" stroke="#c98a1b" strokeOpacity="0.5" strokeWidth="0.9" />
        </g>
      ))}
    </svg>
  );
}
