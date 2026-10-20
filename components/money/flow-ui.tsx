"use client";
import { MinusSignIcon, PlusSignIcon, Tick02Icon, ArrowRight02Icon } from "@hugeicons/core-free-icons";
import { add, cmp, isAmount, normalizeAmountInput, sub, trimZeros } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { Icon } from "@/components/ui/icon";

// Shared pieces of the deposit and withdraw sheets. Same layout, different direction color:
// money in is green, money out is blue, so the two can never be mistaken for each other.
export type Direction = "in" | "out";

export const TONE: Record<Direction, { soft: string; solid: string; focusWithin: string; border: string }> = {
  in: { soft: "bg-primary/12 text-primary", solid: "bg-primary text-primary-foreground", focusWithin: "focus-within:border-primary", border: "border-primary" },
  out: { soft: "bg-info/12 text-info", solid: "bg-info text-primary-foreground", focusWithin: "focus-within:border-info", border: "border-info" },
};

type IconSvg = Parameters<typeof Icon>[0]["icon"];

/** Round badge for the sheet header: arrow down for money in, arrow up for money out. */
export function DirectionBadge({ dir, icon }: { dir: Direction; icon: IconSvg }) {
  return (
    <span className={`grid size-10 shrink-0 place-items-center rounded-full ${TONE[dir].soft}`}>
      <Icon icon={icon} />
    </span>
  );
}

type End = { caption: string; title: string; icon: React.ReactNode };

/** Says in one glance which way the money goes. */
export function FlowBar({ dir, from, to }: { dir: Direction; from: End; to: End }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-surface-raised p-2.5">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface">{from.icon}</span>
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">{from.caption}</div>
          <div className="truncate text-label text-foreground">{from.title}</div>
        </div>
      </div>
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${TONE[dir].solid}`}>
        <Icon icon={ArrowRight02Icon} size={16} strokeWidth={2} />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5 text-right">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">{to.caption}</div>
          <div className="truncate text-label text-foreground">{to.title}</div>
        </div>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface">{to.icon}</span>
      </div>
    </div>
  );
}

/** Numbered form section: icon turns into a check once it's filled in. */
export function Step({
  n,
  icon,
  title,
  body,
  done,
  disabled,
  dir = "in",
  children,
}: {
  n: number;
  icon: IconSvg;
  title: string;
  body?: string;
  done?: boolean;
  disabled?: boolean;
  dir?: Direction;
  children: React.ReactNode;
}) {
  return (
    <section className={`transition-opacity duration-200 ${disabled ? "opacity-50" : ""}`}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={`grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-200 ${done ? TONE[dir].soft : "bg-surface-raised text-foreground"}`}>
          <Icon icon={done ? Tick02Icon : icon} size={16} strokeWidth={done ? 2 : 1.5} />
        </span>
        <div className="min-w-0">
          <h3 className="text-body-sm font-semibold">
            <span className="text-muted-foreground">{n}. </span>
            {title}
          </h3>
          {body && <p className="text-caption text-muted-foreground">{body}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

/** Big centered amount with −/+ steppers and quick picks; the digits shrink as the number grows. */
export function AmountDial({
  dir,
  label,
  value,
  onChange,
  decimals,
  step,
  prefix,
  unit,
  quick,
  footer,
  invalid,
  disabled,
}: {
  dir: Direction;
  label: string;
  value: string;
  onChange: (v: string) => void;
  decimals: number;
  step: string;
  prefix?: string;
  unit?: string;
  quick: { label: string; value: string }[];
  footer?: React.ReactNode;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const bump = (up: boolean) => {
    haptic.select();
    const base = value && isAmount(value, 18, decimals) ? value : "0";
    onChange(up ? trimZeros(add(base, step)) : cmp(base, step) > 0 ? trimZeros(sub(base, step)) : "");
  };
  const size = value.length > 9 ? "text-[26px]" : value.length > 6 ? "text-[32px]" : "text-[40px]";

  return (
    <div>
      <div className={`rounded-lg border bg-surface-raised px-3 pb-3 pt-2.5 transition-colors ${invalid ? "border-destructive" : TONE[dir].focusWithin}`}>
        <div className="text-center text-caption text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <StepButton label="Less" icon={MinusSignIcon} disabled={disabled || !value} onClick={() => bump(false)} />
          <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1 font-semibold tracking-tight tabular-nums">
            {prefix && <span className={`text-muted-foreground ${size}`}>{prefix}</span>}
            <input
              inputMode="decimal"
              autoComplete="off"
              aria-label={label}
              aria-invalid={invalid || undefined}
              disabled={disabled}
              value={value}
              placeholder="0"
              onChange={(e) => {
                const v = normalizeAmountInput(e.target.value);
                if ((v.split(".")[1] ?? "").length <= decimals && v.length <= 18) onChange(v);
              }}
              style={{ width: `${Math.max(1, value.length || 1)}ch` }}
              className={`min-w-0 bg-transparent text-foreground outline-none placeholder:text-subtle ${size}`}
            />
            {unit && <span className="text-body font-medium text-muted-foreground">{unit}</span>}
          </label>
          <StepButton label="More" icon={PlusSignIcon} disabled={disabled} onClick={() => bump(true)} />
        </div>
        {footer && <div className="mt-2 flex justify-center">{footer}</div>}
      </div>
      <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto py-0.5">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            disabled={disabled}
            onClick={() => {
              haptic.select();
              onChange(q.value);
            }}
            className={`hit-area h-9 flex-1 shrink-0 rounded-full px-3 text-label tabular-nums transition-colors disabled:opacity-40 ${
              value === q.value ? "bg-foreground text-background" : "bg-surface-raised text-muted-foreground"
            }`}
          >
            {q.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepButton({ label, icon, disabled, onClick }: { label: string; icon: IconSvg; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="hit-area grid size-10 shrink-0 place-items-center rounded-full bg-surface text-foreground transition-transform active:scale-95 disabled:opacity-30"
    >
      <Icon icon={icon} size={18} strokeWidth={2} />
    </button>
  );
}
