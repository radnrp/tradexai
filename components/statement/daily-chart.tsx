"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { fmtDayUtc } from "@/lib/format";
import { cmp } from "@/lib/money";
import { haptic } from "@/lib/telegram";
import { t } from "@/lib/i18n";
import { Amount } from "@/components/ui/primitives";
import type { DayNet } from "./data";

const MAX_BARS = 30;

/** Personal profit (up, green) and loss (down, red) per day around a zero line; tap a bar to read it. */
export function DailyPnlChart({ days }: { days: DayNet[] }) {
  const shown = days.slice(-MAX_BARS);
  const [sel, setSel] = useState<number | null>(null);
  const cur = shown[sel ?? shown.length - 1];
  if (!shown.length) return <p className="py-8 text-center text-body-sm text-muted-foreground">{t("No finished trades in this period.")}</p>;

  const max = Math.max(...shown.map((d) => Math.abs(Number(d.net))), 1e-9);
  const green = days.filter((d) => cmp(d.net, "0") > 0).length;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-muted-foreground">{fmtDayUtc(cur.day)}</span>
        <Amount value={cur.net} signed colored unit="USDT" className="text-body font-semibold" />
      </div>
      <div dir="ltr" className="relative mt-3 flex h-32 items-stretch gap-0.75" role="list" aria-label={t("Profit or loss per day")}>
        <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
        {shown.map((d, i) => {
          const v = Number(d.net);
          const h = `${(Math.abs(v) / max) * 50}%`;
          const active = i === (sel ?? shown.length - 1);
          return (
            <button
              key={d.day}
              type="button"
              role="listitem"
              aria-label={t("{day}: {net} USDT", { day: fmtDayUtc(d.day), net: d.net })}
              onClick={() => {
                haptic.select();
                setSel(i);
              }}
              className="relative flex-1"
            >
              <motion.span
                initial={{ height: 0 }}
                animate={{ height: h }}
                transition={{ duration: 0.4, delay: i * 0.01, ease: [0.2, 0, 0, 1] }}
                className={`absolute inset-x-0 rounded-[3px] ${v >= 0 ? "bottom-1/2 bg-primary" : "top-1/2 bg-destructive"} ${active ? "" : "opacity-55"}`}
                style={{ minHeight: v === 0 ? 0 : 2 }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-between text-caption text-muted-foreground tabular-nums">
        <span>
          {t("{green} of {days} days in profit", { green, days: days.length })}
        </span>
        {days.length > MAX_BARS && <span>{t("Last {n} days shown", { n: MAX_BARS })}</span>}
      </div>
    </div>
  );
}
