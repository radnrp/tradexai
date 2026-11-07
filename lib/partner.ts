import type { ReferralEarning, ReferralUser, Referrals } from "./api/types";
import { t, type Key } from "./i18n/index.ts";
import type { Tone } from "./labels";
import { fmt, trimZeros } from "./money.ts";

// The invite program (contract 2026-10-27): tiers by qualified direct invites, a share of friends' collected trade fees, and a
// one-time 1 USDT reward per qualified invite. Every state here is the server's; nothing is promoted from amounts seen in the app.

/** Tiers apply only while the server says the program is active; an older server (no field) or a prepared one is the flat rate. */
export const programActive = (r: Pick<Referrals, "program">) => r.program?.active === true;
export const bountyActive = (r: Pick<Referrals, "program" | "bounty">) => programActive(r) && r.bounty?.enabled === true;

/** "30%" from bps. */
export const sharePct = (bps: number) => `${bps / 100}%`;

type Tier = NonNullable<Referrals["tier"]>;

/** The way from this tier's minimum to the next one's, 0–1 (display only); null at the top tier or without tiers. */
export function tierProgress(tier: Tier | null | undefined): { ratio: number; remaining: number; next: NonNullable<Tier["next"]> } | null {
  const next = tier?.next;
  if (!tier || !next) return null;
  const from = tier.minimum ?? 0;
  const span = next.minimum - from;
  const ratio = span > 0 ? Math.min(1, Math.max(0, (tier.qualifiedCount - from) / span)) : 0;
  return { ratio, remaining: next.remaining, next };
}

const QUALIFICATION: Record<string, { label: Key; tone: Tone }> = {
  qualified: { label: "Qualified", tone: "ok" },
  awaiting_settled_trade: { label: "Awaiting a settled funded trade", tone: "pending" },
  awaiting_funding: { label: "Awaiting qualifying deposit", tone: "idle" },
};
export const qualificationLabel = (s: string) => {
  const q = QUALIFICATION[s];
  return q ? { label: t(q.label), tone: q.tone } : { label: s.replace(/_/g, " "), tone: "idle" as Tone };
};

/** A qualified friend's reward: booked, or still on its way (the worker pays it; there's nothing to claim). */
export function rewardState(u: Pick<ReferralUser, "qualified" | "bountyPaid">): "paid" | "pending" | null {
  if (!u.qualified) return null;
  return u.bountyPaid ? "paid" : "pending";
}

/** Where a booked earning came from, at that event's own rate. Old rows have no fee recorded, so none is shown or guessed. */
export function earningNote(e: ReferralEarning): string | null {
  if (e.type === "bounty") return t("One-time reward");
  if (e.commissionBps == null) return null;
  const rate = sharePct(e.commissionBps);
  // fees can be fractions of a cent: keep up to 8 digits, but at least 2
  if (e.grossFee != null) return t("{rate} of a {fee} {asset} fee", { rate, fee: fmt(e.grossFee, Math.max(2, decimals(e.grossFee))), asset: e.asset });
  return e.policyVersion === 1 ? t("{rate} · earlier program", { rate }) : rate;
}

const decimals = (v: string) => (trimZeros(v).split(".")[1] ?? "").length;
