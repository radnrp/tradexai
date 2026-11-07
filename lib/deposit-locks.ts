import type { DepositLocks } from "./api/types";
import { t } from "./i18n/index.ts";

// Each deposit's principal is locked for withdrawal 7 days from its credit (contract 2026-10-27). The countdown is the
// device's; only the server decides when money is free, so a passed time means "refetch", never "withdrawable".

/** "6d 23h", "5h 12m", "4m 10s" until `until`; null once it has passed. */
export function timeLeft(until: string, now: number): string | null {
  const s = Math.floor((Date.parse(until) - now) / 1000);
  if (!(s > 0)) return null;
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d) return t("{d}d {h}h", { d, h });
  if (h) return t("{h}h {m}m", { h, m });
  return t("{m}m {s}s", { m, s: s % 60 });
}

/** Every deposit on its own clock, soonest unlock first; a new deposit never moves an older one's time. */
export const lockRows = (l: Pick<DepositLocks, "items">) => [...l.items].sort((a, b) => Date.parse(a.unlockAt) - Date.parse(b.unlockAt));
