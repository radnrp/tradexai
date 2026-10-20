"use client";
import { motion } from "motion/react";
import type { Row } from "@/lib/api/types";
import { fmtDateTime, pick } from "@/lib/format";
import { fmt } from "@/lib/money";

/**
 * Hourly observed equity. Missing values and gaps break the line — nothing is interpolated or
 * zero-filled. Number() here is display-only scaling.
 */
export function EquityChart({ rows, unit }: { rows: Row[]; unit: string }) {
  const pts = rows
    .map((r) => ({
      t: new Date(pick<string>(r, ["captured_at", "capturedAt", "bucket"]) ?? 0).getTime(),
      v: pick<string>(r, ["equity", "booked_equity", "bookedEquity"]) ?? null,
      bucket: new Date(pick<string>(r, ["bucket", "captured_at", "capturedAt"]) ?? 0).getTime(),
    }))
    .filter((p) => p.t > 0)
    .sort((a, b) => a.t - b.t);
  const vals = pts.filter((p) => p.v != null).map((p) => Number(p.v));
  if (vals.length < 2) return <p className="py-8 text-center text-body-sm text-muted-foreground">Not enough data yet.</p>;

  const W = 320, H = 120, P = 6;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (t: number) => P + ((t - t0) / Math.max(1, t1 - t0)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - min) / Math.max(1e-9, max - min)) * (H - 2 * P);

  // new segment on null value or when consecutive hourly buckets are more than an hour apart
  const segs: string[] = [];
  let cur = "";
  pts.forEach((p, i) => {
    const gap = i > 0 && p.bucket - pts[i - 1].bucket > 3_600_000 * 1.5;
    if (p.v == null || gap) {
      if (cur) segs.push(cur);
      cur = "";
      if (p.v == null) return;
    }
    cur += `${cur ? "L" : "M"}${x(p.t).toFixed(1)},${y(Number(p.v)).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const last = [...pts].reverse().find((p) => p.v != null)!;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full overflow-visible" role="img" aria-label="Equity history">
        {segs.map((d, i) => (
          <motion.path key={i} d={d} fill="none" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.9, ease: "easeOut" }} />
        ))}
        <circle cx={x(last.t)} cy={y(Number(last.v))} r="3.5" fill="var(--color-primary)" />
      </svg>
      <figcaption className="mt-2 flex justify-between gap-2 text-caption text-muted-foreground tabular-nums">
        <span>{fmtDateTime(t0)}</span>
        <span>
          Low {fmt(String(min))}, high {fmt(String(max))} {unit}
        </span>
        <span>{fmtDateTime(t1)}</span>
      </figcaption>
    </figure>
  );
}
