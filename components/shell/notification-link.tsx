"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import { ApiError } from "@/lib/api/session";
import type { NotificationContext } from "@/lib/api/types";
import { noticeDeposit, noticeLanding, noticeTarget } from "@/lib/notice-link";
import { qk } from "@/lib/queries";
import { tg } from "@/lib/telegram";
import { trialProfitLock } from "@/lib/trader";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";

// One app open lands its link once: a WebView reload keeps the same auth_date and start param, so it isn't replayed.
const HANDLED = "txai.notice";
let handled = false;

function firstTime(key: string) {
  if (handled) return false;
  handled = true;
  try {
    if (sessionStorage.getItem(HANDLED) === key) return false;
    sessionStorage.setItem(HANDLED, key);
  } catch {}
  return true;
}

/** The server's check: null when it turned the link down, undefined when it couldn't be reached (network or 5xx, after retries). */
async function check(startParam: string): Promise<NotificationContext | null | undefined> {
  for (let n = 0; n < 3; n++) {
    try {
      return await API.notificationContext(startParam);
    } catch (e) {
      if (!(e instanceof ApiError && e.uncertain)) return null;
      if (n < 2) await new Promise((r) => setTimeout(r, 1_000 * 2 ** n));
    }
  }
  return undefined;
}

/**
 * Lands a bot message button (t.me/<bot>?startapp=ntf_…) after sign-in. The page comes from the link, so Statement or Feedback
 * opens at once; then the server checks it: a link it turns down goes back to Home, a deposit link opens that payment (status
 * and expiry reread by the sheet), one already under way, or a new deposit, decided on Home's numbers read again (an old
 * trial-profit reminder never reopens a lock that's gone). Once the user has moved to another page, nothing moves them.
 */
export function NotificationLink() {
  const router = useRouter();
  const openDeposit = useOpenDeposit();
  const qc = useQueryClient();
  useEffect(() => {
    const app = tg();
    const start = app?.initDataUnsafe.start_param;
    const target = noticeTarget(start);
    if (!app || !start || !target || !firstTime(`${app.initDataUnsafe.auth_date ?? ""}:${start}`)) return;
    const from = location.pathname;
    const first = noticeLanding(target, undefined).path;
    if (first !== from) router.replace(first);
    void check(start).then(async (ctx) => {
      const here = location.pathname;
      // still where the link put us (or that navigation hasn't committed yet)
      if (here !== first && here !== from) return;
      const land = noticeLanding(target, ctx);
      if (land.path !== here) router.replace(land.path);
      if (!land.deposit) return;
      const fresh = await qc.fetchQuery({ queryKey: qk.trader, queryFn: API.trader, staleTime: 0 }).catch(() => undefined);
      if (location.pathname !== land.path) return;
      const now = fresh && { pending: fresh.engagement.transactions.deposits.pending, lock: trialProfitLock(fresh.trialProfitProtection) };
      const open = noticeDeposit(land.deposit, ctx?.noticeKind ?? "", now);
      if (open) openDeposit(open.id, open.amount);
    });
  }, [router, openDeposit, qc]);
  return null;
}
