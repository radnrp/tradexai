"use client";
import { useEffect, useId, useState } from "react";
import { motion } from "motion/react";
import { Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { normalizeAmountInput } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { Icon } from "./icon";

/** Pill segmented control (design.md §8.4): neutral selected pill that slides, never green. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  layoutId,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  layoutId: string;
}) {
  return (
    <div role="tablist" className="flex rounded-full bg-surface-raised p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) haptic.select();
              onChange(o.value);
            }}
            className={`relative h-9 flex-1 whitespace-nowrap rounded-full px-3 text-label transition-colors duration-200 ${active ? "text-foreground" : "text-muted-foreground"}`}
          >
            {active && <motion.span layoutId={layoutId} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }} className="absolute inset-0 rounded-full bg-foreground/12" />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Label above, error replaces hint below; the input picks up the error border through the group. */
export function Field({
  label,
  hint,
  error,
  children,
  aside,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: (id: string) => React.ReactNode;
  aside?: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="group/field" data-invalid={error ? "" : undefined}>
      <div className="mb-2 flex items-center justify-between px-1">
        <label htmlFor={id} className="text-label text-muted-foreground">
          {label}
        </label>
        {aside}
      </div>
      {children(id)}
      {error ? (
        <p role="alert" className="mt-2 px-1 text-label text-destructive">
          {error}
        </p>
      ) : (
        hint && <p className="mt-2 px-1 text-label font-normal text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

export const inputCls =
  "h-13 w-full rounded-md border bg-surface px-4 text-[16px] text-foreground outline-none transition-colors placeholder:text-subtle focus:border-primary focus:ring-3 focus:ring-primary/12 group-data-invalid/field:border-destructive";

/** Financial amount: decimal keypad, tabular digits, asset at the end of the field. */
export function AmountInput({
  id,
  value,
  onChange,
  unit,
  placeholder = "0.00",
  maxDecimals = 8,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  unit: string;
  placeholder?: string;
  maxDecimals?: number;
}) {
  return (
    <div className="flex h-18 items-center gap-3 rounded-lg border bg-surface px-4 transition-colors focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/12 group-data-invalid/field:border-destructive">
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          const v = normalizeAmountInput(e.target.value);
          const [, dec = ""] = v.split(".");
          if (dec.length <= maxDecimals) onChange(v);
        }}
        className="min-w-0 flex-1 bg-transparent text-[30px] font-semibold tracking-tight tabular-nums outline-none placeholder:text-subtle"
      />
      <span className="shrink-0 rounded-full bg-surface-raised px-3 py-1.5 text-label text-foreground">{unit}</span>
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => {
        haptic.select();
        onClick();
      }}
      className={`hit-area h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-label transition-colors ${
        active ? "bg-foreground text-background" : "bg-surface-raised text-muted-foreground active:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  haptic.success();
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1600);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      onClick={() => copyText(text).then(() => setDone(true))}
      aria-label={done ? "Copied" : label}
      className="hit-area inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-raised px-3 text-label text-foreground"
    >
      <motion.span key={String(done)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }} className="flex">
        <Icon icon={done ? Tick02Icon : Copy01Icon} size={16} className={done ? "text-primary" : ""} />
      </motion.span>
      {done ? "Copied" : label}
    </button>
  );
}

/** mm:ss until `until`. The timer reaching zero is cosmetic — status always comes from the server. */
export function useCountdown(until: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  // shortcut: uses the device clock; no server-time skew correction (API exposes no Date header via CORS).
  const left = until ? Math.max(0, Math.floor((new Date(until).getTime() - now) / 1000)) : 0;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  return { left, text: left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : `${mm}:${ss}` };
}
