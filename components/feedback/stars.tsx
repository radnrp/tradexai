"use client";
import { haptic } from "@/lib/telegram";
import { t } from "@/lib/i18n";

const PATH = "M12 2.8l2.8 5.7 6.3.9-4.55 4.43 1.07 6.27L12 17.15 6.38 20.1l1.07-6.27L2.9 9.4l6.3-.9z";

function Star({ on, size }: { on: boolean; size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden className={on ? "text-warning" : "text-subtle"}>
      <path d={PATH} fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

/** A 1–5 rating, read only. */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex shrink-0 gap-0.5" role="img" aria-label={t("{n} out of 5", { n: value })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} on={n <= value} size={size} />
      ))}
    </span>
  );
}

/** Picks a 1–5 rating; 0 means none yet. */
export function StarPicker({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={t("Rating")} className="flex justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t("{n} out of 5", { n })}
          disabled={disabled}
          onClick={() => {
            haptic.select();
            onChange(n);
          }}
          className="hit-area grid size-11 place-items-center rounded-full transition-transform duration-100 active:scale-90 disabled:opacity-40"
        >
          <Star on={n <= value} size={30} />
        </button>
      ))}
    </div>
  );
}
