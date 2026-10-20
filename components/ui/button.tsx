"use client";
import Link from "next/link";
import { motion, type HTMLMotionProps } from "motion/react";
import { haptic } from "@/lib/telegram";

const MotionLink = motion.create(Link);

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outgoing";
const styles: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground active:brightness-90",
  secondary: "bg-surface-raised text-foreground active:brightness-125",
  ghost: "text-muted-foreground active:text-foreground",
  danger: "bg-destructive/12 text-destructive active:bg-destructive/20",
  // withdraw flow only: money-out actions read blue, never the green of money in
  outgoing: "bg-info text-primary-foreground active:brightness-90",
};

type Common = { variant?: Variant; size?: "sm" | "md" | "lg"; loading?: boolean; icon?: React.ReactNode; block?: boolean };
type AsButton = Common & HTMLMotionProps<"button"> & { as?: "button" };
type AsLink = Common & HTMLMotionProps<"a"> & { as: "a" };

const tap = { scale: 0.98, transition: { duration: 0.12 } };

/** Pill buttons (design.md §8.1–8.2). The label never changes width while loading. */
export function Button(props: AsButton | AsLink) {
  const { variant = "primary", size = "md", loading, icon, block, className = "", children, as, ...rest } = props;
  const sizing = { sm: "hit-area h-10 px-4 gap-1.5", md: "h-12 px-5 gap-2", lg: "h-13 px-6 gap-2" }[size];
  const cls = `inline-flex select-none items-center justify-center rounded-full text-button transition-[filter,background-color,color] duration-150 disabled:pointer-events-none disabled:opacity-40 ${sizing} ${styles[variant]} ${block ? "w-full" : ""} ${className}`;
  const inner = (
    <>
      {loading ? <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : icon}
      <span>{children as React.ReactNode}</span>
    </>
  );
  if (as === "a" && typeof (rest as { href?: string }).href === "string" && (rest as { href: string }).href.startsWith("/")) {
    const { href, ...a } = rest as HTMLMotionProps<"a"> & { href: string };
    return (
      <MotionLink href={href} whileTap={tap} className={cls} {...a}>
        {inner}
      </MotionLink>
    );
  }
  if (as === "a")
    return (
      <motion.a whileTap={tap} className={cls} {...(rest as HTMLMotionProps<"a">)}>
        {inner}
      </motion.a>
    );
  const b = rest as HTMLMotionProps<"button">;
  return (
    <motion.button
      whileTap={tap}
      type={b.type ?? "button"}
      aria-busy={loading || undefined}
      {...b}
      disabled={b.disabled || loading}
      onClick={(e) => {
        haptic.tap();
        b.onClick?.(e);
      }}
      className={cls}
    >
      {inner}
    </motion.button>
  );
}

/** Round 44px icon button, e.g. header actions. */
export function IconButton({ label, children, className = "", ...rest }: HTMLMotionProps<"button"> & { label: string }) {
  return (
    <motion.button
      type="button"
      whileTap={tap}
      aria-label={label}
      {...rest}
      onClick={(e) => {
        haptic.tap();
        rest.onClick?.(e);
      }}
      className={`grid size-11 shrink-0 place-items-center rounded-full bg-surface-raised text-foreground disabled:opacity-40 ${className}`}
    >
      {children as React.ReactNode}
    </motion.button>
  );
}
