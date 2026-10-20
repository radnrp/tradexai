"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Alert02Icon, AlertCircleIcon, ArrowLeft01Icon, ArrowRight01Icon, InformationCircleIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { ApiError } from "@/lib/api/session";
import { fmt, sign } from "@/lib/money";
import type { Tone } from "@/lib/labels";
import { describeError } from "@/lib/labels";
import { tg } from "@/lib/telegram";
import { Button, IconButton } from "./button";
import { Icon } from "./icon";

/** Standard card: surface, radius 20, no shadow. `hero` is the one gradient summary card per screen. */
export function Card({ className = "", hero, children, ...rest }: React.HTMLAttributes<HTMLDivElement> & { hero?: boolean }) {
  return (
    <div className={`${hero ? "hero-gradient rounded-xl text-white" : "rounded-lg bg-surface"} ${className}`} {...rest}>
      {children}
    </div>
  );
}

const toneCls: Record<Tone, string> = {
  ok: "bg-primary/12 text-primary",
  pending: "bg-warning/12 text-warning",
  bad: "bg-destructive/12 text-destructive",
  info: "bg-info/14 text-info",
  idle: "bg-surface-raised text-muted-foreground",
};
export const dotCls: Record<Tone, string> = { ok: "bg-primary", pending: "bg-warning", bad: "bg-destructive", info: "bg-info", idle: "bg-muted-foreground" };

/** Status always pairs a dot with words — color is never the only signal. */
export function Pill({ tone = "idle", children, live }: { tone?: Tone; children: React.ReactNode; live?: boolean }) {
  return (
    <span className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-label ${toneCls[tone]}`}>
      <span className="relative flex size-1.5">
        {(live ?? tone === "pending") && <span className={`absolute inset-0 rounded-full ${dotCls[tone]} animate-ping-soft`} />}
        <span className={`relative size-1.5 rounded-full ${dotCls[tone]}`} />
      </span>
      {children}
    </span>
  );
}

/** Money display: exact server string, rounded only for display. */
export function Amount({
  value,
  dp = 2,
  unit,
  signed,
  colored,
  className = "",
}: {
  value: string | null | undefined;
  dp?: number;
  unit?: string;
  signed?: boolean;
  colored?: boolean;
  className?: string;
}) {
  const s = sign(value);
  const color = colored ? (s > 0 ? "text-primary" : s < 0 ? "text-destructive" : "") : "";
  return (
    <span className={`tabular-nums ${color} ${className}`} title={value ?? undefined}>
      {fmt(value, dp, { sign: signed })}
      {unit && value != null && <span className="ml-1 text-[0.7em] font-medium opacity-70">{unit}</span>}
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton animate-shimmer rounded-md ${className}`} />;
}

/** Root-screen title (L0): left aligned H1. */
export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4 pb-5 pt-5">
      <div className="min-w-0">
        <h1 className="text-h1">{title}</h1>
        {subtitle && <p className="mt-1 text-body-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/** Focused-flow header (L1): short centered title, one optional action opposite Back. */
export function FlowHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  const router = useRouter();
  // Telegram's own BackButton is the back control; ours is only for clients that lack it (design.md §6.2).
  const nativeBack = tg()?.isVersionAtLeast("6.1");
  return (
    <header className="grid h-14 grid-cols-[44px_1fr_44px] items-center gap-2 pt-2">
      {nativeBack ? (
        <span />
      ) : (
        <IconButton label="Back" onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}>
          <Icon icon={ArrowLeft01Icon} />
        </IconButton>
      )}
      <h1 className="truncate text-center text-body font-semibold">{title}</h1>
      {action ?? <span />}
    </header>
  );
}

/** Root screens fade in; focused flows push in from the right (design.md §11). */
export function Page({ children, nav = true }: { children: React.ReactNode; nav?: boolean }) {
  return (
    <motion.main
      initial={nav ? { opacity: 0 } : { opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: nav ? 0.18 : 0.24, ease: [0.2, 0, 0, 1] }}
      className={`pt-safe mx-auto w-full max-w-150 px-4 min-[390px]:px-5 ${nav ? "pb-nav" : "pb-10"}`}
    >
      {children}
    </motion.main>
  );
}

export function SectionTitle({ children, href, linkLabel = "See all" }: { children: React.ReactNode; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between px-1">
      <h2 className="text-h2">{children}</h2>
      {href && (
        <Link href={href} className="hit-area flex items-center gap-0.5 text-label text-muted-foreground active:text-foreground">
          {linkLabel}
          <Icon icon={ArrowRight01Icon} size={16} />
        </Link>
      )}
    </div>
  );
}

export function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-label text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-h2 tabular-nums">{children}</div>
      {hint && <div className="mt-1 text-caption text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Row({ label, children, strong }: { label: React.ReactNode; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex min-h-11 items-center justify-between gap-4 py-2.5 text-body-sm ${strong ? "font-semibold" : ""}`}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </div>
  );
}

export function Notice({ tone = "info", title, children }: { tone?: "info" | "warn" | "bad"; title?: string; children: React.ReactNode }) {
  const icon = tone === "info" ? InformationCircleIcon : tone === "warn" ? Alert02Icon : AlertCircleIcon;
  const c = { info: "bg-info/8 text-info", warn: "bg-warning/8 text-warning", bad: "bg-destructive/8 text-destructive" }[tone];
  return (
    <div className={`flex gap-3 rounded-md p-3.5 ${c}`} role={tone === "bad" ? "alert" : undefined}>
      <Icon icon={icon} size={18} className="mt-px shrink-0" />
      <div className="text-body-sm text-foreground/85">
        {title && <div className="mb-0.5 font-semibold text-foreground">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-surface px-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-surface-raised text-foreground">{icon}</div>
      <div className="mt-4 text-body font-semibold">{title}</div>
      {body && <p className="mt-1.5 max-w-70 text-body-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** What happened + what to do. A 404 can't be fixed by retrying, so it offers the way home instead. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { title, detail } = describeError(error);
  const notFound = error instanceof ApiError && error.status === 404;
  return (
    <div className="flex flex-col items-center rounded-lg bg-surface px-6 py-8 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-destructive/12 text-destructive">
        <Icon icon={AlertCircleIcon} size={24} />
      </div>
      <div className="mt-3 text-body font-semibold">{title}</div>
      {detail && <p className="mt-1 max-w-75 text-body-sm text-muted-foreground">{detail}</p>}
      {notFound ? (
        <Button as="a" href="/" variant="secondary" size="sm" className="mt-5">
          Back to home
        </Button>
      ) : (
        onRetry && (
          <Button variant="secondary" size="sm" className="mt-5" icon={<Icon icon={Refresh01Icon} size={16} />} onClick={onRetry}>
            Try again
          </Button>
        )
      )}
    </div>
  );
}

/** Mirrors a list row (icon, two lines, trailing amount) so loading doesn't shift layout. */
export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-lg bg-surface px-4" aria-busy aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
