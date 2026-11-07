import type { NotificationContext } from "./api/types";

// Direct notification links (contract 2026-10-26): a bot message button opens t.me/<bot>?startapp=ntf_<token>_<target>. The page
// comes from the link; the server checks the token after sign-in and names the deposit. The app has no notification settings.

export type NoticeTarget = "home" | "statement" | "deposit" | "feedback";
type NoticePath = "/" | "/statements" | "/feedback";

const NOTICE = /^ntf_([a-f0-9]{32})_(home|statement|deposit|feedback)$/;
const PATH: Record<NoticeTarget, NoticePath> = { home: "/", statement: "/statements", deposit: "/", feedback: "/feedback" };
const isTarget = (v: string): v is NoticeTarget => v === "home" || v === "statement" || v === "deposit" || v === "feedback";

/** The target a notification start param names; null for anything else (a referral code, a campaign, a malformed link). */
export function noticeTarget(startParam: string | null | undefined): NoticeTarget | null {
  const m = startParam?.match(NOTICE);
  return m ? (m[2] as NoticeTarget) : null;
}

/** `deposit.id`: an existing payment to reopen (its status and expiry are reread from the API), or null for a new deposit. */
export type NoticeLanding = { path: NoticePath; deposit: { id: string | null } | null };

/**
 * Where a notification link lands. ctx is the server's answer: null when it turned the link down (404, expired or not this
 * user's), which goes back to Home; undefined when it couldn't be asked, so the page still follows the link but no deposit opens.
 */
export function noticeLanding(target: NoticeTarget, ctx: NotificationContext | null | undefined): NoticeLanding {
  if (ctx === undefined) return { path: PATH[target], deposit: null };
  if (ctx === null || !isTarget(ctx.target)) return { path: "/", deposit: null };
  return { path: PATH[ctx.target], deposit: ctx.target === "deposit" ? { id: ctx.depositId } : null };
}

/**
 * What a deposit link opens once Home's numbers have been read again: the payment it names, a payment already under way rather
 * than a second one, or a new deposit. An old trial-profit reminder opens nothing once that lock is gone (or can't be checked),
 * and fills in what's still missing otherwise. `t` undefined: the numbers couldn't be read. Null: open nothing.
 */
export function noticeDeposit(
  deposit: { id: string | null },
  noticeKind: string,
  t: { pending: { id: string } | null; lock: { amount: string } | null } | undefined,
): { id?: string; amount?: string } | null {
  if (deposit.id) return { id: deposit.id };
  if (noticeKind === "trial_profit_unlock") {
    if (!t?.lock) return null;
    return t.pending ? { id: t.pending.id } : { amount: t.lock.amount };
  }
  return t?.pending ? { id: t.pending.id } : {};
}
