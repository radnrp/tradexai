"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Cancel01Icon, StarIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { countOpen, neverSentFeedback, promptShown, type PromptMemo } from "@/lib/feedback";
import { noticeTarget } from "@/lib/notice-link";
import { qk, useAfterTrader } from "@/lib/queries";
import { haptic, tg } from "@/lib/telegram";
import { t } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { FeedbackForm } from "./feedback-form";

const MEMO = "txai.rate.";
const LAUNCH = "txai.rate.launch";
/** How long the app settles before the popup comes up. */
const DELAY_MS = 2_500;

// this launch's answer, worked out once: a remount (or React's dev double effects) must neither count the open again nor lose it
let launchDue: boolean | null = null;

const read = (key: string): PromptMemo | null => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
};
const write = (key: string, m: PromptMemo) => {
  try {
    localStorage.setItem(key, JSON.stringify(m));
  } catch {}
};

/**
 * Counts this app open once and says whether the popup is due. A WebView reload keeps Telegram's auth_date, so it isn't a new
 * open; a fresh launch brings a new one. Device storage only: a cleared or blocked storage just starts the count again.
 */
function dueThisLaunch(userId: string): boolean {
  if (launchDue != null) return launchDue;
  launchDue = false;
  const launch = `${userId}:${tg()?.initDataUnsafe.auth_date ?? ""}`;
  try {
    if (sessionStorage.getItem(LAUNCH) === launch) return false;
    sessionStorage.setItem(LAUNCH, launch);
  } catch {}
  const r = countOpen(read(MEMO + userId), Date.now());
  write(MEMO + userId, r.memo);
  launchDue = r.due;
  return r.due;
}

/**
 * The app-style rating popup: full screen, with the feedback form right in it. Only for someone who has never sent feedback (the
 * server's word), on every 5th app open or 3 days after it last showed, whichever comes first. Not on an open from a bot
 * message (that link goes first) or on the Feedback page itself. Once shown, answered or not, both counts start over.
 */
export function FeedbackPrompt({ userId }: { userId: string }) {
  const qc = useQueryClient();
  // the screen's own numbers go first
  const after = useAfterTrader();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!after || !dueThisLaunch(userId)) return;
    if (noticeTarget(tg()?.initDataUnsafe.start_param)) return;
    let live = true;
    const t = setTimeout(async () => {
      const e = await qc.fetchQuery({ queryKey: qk.feedbackEligibility, queryFn: API.feedbackEligibility }).catch(() => null);
      if (!live || !neverSentFeedback(e) || location.pathname === "/feedback") return;
      launchDue = false;
      write(MEMO + userId, promptShown(Date.now()));
      haptic.select();
      setOpen(true);
    }, DELAY_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [after, userId, qc]);

  const close = () => setOpen(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="left-0 top-0 block h-dvh w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none bg-background p-0 shadow-none">
        <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-150 flex-col px-4 min-[390px]:px-5">
          <div className="flex justify-end pt-3">
            <button
              type="button"
              aria-label={t("Close")}
              onClick={() => {
                haptic.select();
                close();
              }}
              className="grid size-10 place-items-center rounded-full bg-surface-raised text-muted-foreground active:scale-95"
            >
              <Icon icon={Cancel01Icon} size={18} />
            </button>
          </div>

          <div className="flex flex-col items-center pb-5 pt-2 text-center">
            <span className="grid size-20 place-items-center rounded-full bg-warning/12 text-warning ring-8 ring-warning/5">
              <Icon icon={StarIcon} size={40} strokeWidth={1.8} />
            </span>
            <DialogTitle className="mt-5 text-h1">{t("Enjoying XENO?")}</DialogTitle>
            <DialogDescription className="mt-1.5">{t("Rate your experience. It takes a minute.")}</DialogDescription>
          </div>

          <FeedbackForm onSent={close} />

          <button
            type="button"
            onClick={() => {
              haptic.select();
              close();
            }}
            className="mx-auto mb-4 mt-3 h-11 px-4 text-body-sm font-semibold text-muted-foreground active:opacity-70"
          >
            {t("Not now")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
