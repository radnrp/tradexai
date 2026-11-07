import type { FeedbackEligibility } from "./api/types";
import { t as tr, type Key } from "./i18n/index.ts";
import type { Tone } from "./labels";

// In-app feedback (contract 2026-10-30): a 1–5 rating, 10–2000 characters and a separate, opt-in consent to publish. The server
// normalises and checks everything again; these only spare a round trip.

export const FEEDBACK_MIN = 10;
export const FEEDBACK_MAX = 2000;

/** The text as the server keeps it: NFC, trimmed. */
export const cleanFeedback = (text: string) => text.normalize("NFC").trim();

/** What stops a submission, or null. Lengths are counted like the server's (UTF-16 units). */
export function feedbackProblem(rating: number, text: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return tr("Choose a rating");
  const t = cleanFeedback(text);
  if (t.length < FEEDBACK_MIN) return tr("At least {n} characters", { n: FEEDBACK_MIN });
  if (t.length > FEEDBACK_MAX) return tr("At most {n} characters", { n: FEEDBACK_MAX });
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t)) return tr("Remove special characters");
  return null;
}

/** While the 7-day cooldown runs, when the next one can be sent; null when one can be sent now. Never counted locally. */
export function feedbackCooldown(e: Pick<FeedbackEligibility, "nextEligibleAt"> | null | undefined, now: number): string | null {
  const at = e?.nextEligibleAt;
  return at && Date.parse(at) > now ? at : null;
}

const STATUS: Record<string, { label: Key; tone: Tone }> = {
  pending: { label: "In review", tone: "pending" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "idle" },
};
export const feedbackStatus = (s: string): { label: string; tone: Tone } => {
  const v = STATUS[s];
  return v ? { label: tr(v.label), tone: v.tone } : { label: s.replace(/_/g, " "), tone: "idle" };
};

/** The rating popup's memory on this device, per user: app opens since it last showed, and when it last showed (or first open). */
export type PromptMemo = { opens: number; since: number };

export const PROMPT_EVERY_OPENS = 5;
export const PROMPT_EVERY_MS = 3 * 24 * 3_600_000;

/** One more app open; due on the 5th open, or 3 days on, since the popup last showed (counted from the first open before that). */
export function countOpen(m: PromptMemo | null, now: number): { memo: PromptMemo; due: boolean } {
  const memo = m && Number.isFinite(m.opens) && Number.isFinite(m.since) ? { opens: m.opens + 1, since: m.since } : { opens: 1, since: now };
  return { memo, due: memo.opens >= PROMPT_EVERY_OPENS || now - memo.since >= PROMPT_EVERY_MS };
}

/** Once it has shown (answered or not), both counts start over. */
export const promptShown = (now: number): PromptMemo => ({ opens: 0, since: now });

/** Never sent any feedback: the server sets nextEligibleAt from the last one, so it's null only before the first. */
export const neverSentFeedback = (e: Pick<FeedbackEligibility, "nextEligibleAt"> | null | undefined) => !!e && e.nextEligibleAt == null;
