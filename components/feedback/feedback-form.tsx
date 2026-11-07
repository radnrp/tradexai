"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Message01Icon, SentIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { ApiError, apiErrorCode } from "@/lib/api/session";
import { cleanFeedback, FEEDBACK_MAX, feedbackCooldown, feedbackProblem } from "@/lib/feedback";
import { fmtDateTime } from "@/lib/format";
import { describeError } from "@/lib/labels";
import { qk } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { usePendingAction } from "@/lib/use-pending-action";
import { t } from "@/lib/i18n";
import { StarPicker } from "@/components/feedback/stars";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, Notice, Skeleton } from "@/components/ui/primitives";

type Body = { rating: number; text: string; publicationConsent: boolean };

/**
 * The feedback form: a rating, the user's own words and a separate, opt-in consent to publish, sent once per submission (the
 * same key on retries). While the 7-day cooldown runs it says when the next one can go. `onSent` runs after the server took it.
 */
export function FeedbackForm({ onSent }: { onSent?: () => void }) {
  const qc = useQueryClient();
  const eligibility = useQuery({ queryKey: qk.feedbackEligibility, queryFn: API.feedbackEligibility });
  // a send that timed out keeps its body and key, so sending again can't make a second review
  const { pending, run } = usePendingAction<Body>("feedback");
  const [rating, setRating] = useState(pending?.body.rating ?? 0);
  const [text, setText] = useState(pending?.body.text ?? "");
  const [consent, setConsent] = useState(pending?.body.publicationConsent ?? false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // the server's answers on a send: its 7-day limit, or feedback switched off for now
  const [until, setUntil] = useState<string | null>(null);
  const [off, setOff] = useState(false);

  if (eligibility.isPending) return <Skeleton className="h-80 rounded-lg" />;
  // against when the server answered; a fresh visit asks again
  const cooldown = until ?? feedbackCooldown(eligibility.data, eligibility.dataUpdatedAt);
  if (cooldown)
    return (
      <Card className="flex flex-col items-center p-6 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-primary/12 text-primary">
          <Icon icon={Message01Icon} size={24} />
        </span>
        <div className="mt-3 text-body font-semibold">{t("Thanks for your feedback")}</div>
        <p className="mt-1 text-body-sm text-muted-foreground">{t("You can send more after {at}", { at: fmtDateTime(cooldown) })}</p>
      </Card>
    );

  const problem = feedbackProblem(rating, text);
  const length = cleanFeedback(text).length;

  async function send() {
    setTried(true);
    if (problem || off) return haptic.error();
    setBusy(true);
    try {
      await run({ rating, text: cleanFeedback(text), publicationConsent: consent }, API.submitFeedback);
      haptic.success();
      toast.success(t("Feedback received — pending review"));
      setRating(0);
      setText("");
      setConsent(false);
      setTried(false);
      onSent?.();
    } catch (e) {
      haptic.error();
      const body = e instanceof ApiError ? (e.details as { details?: { nextAllowedAt?: string } } | null) : null;
      if (apiErrorCode(e) === "FEEDBACK_COOLDOWN") {
        setUntil(body?.details?.nextAllowedAt ?? null);
        toast.error(t("You've sent feedback this week"));
      } else if (apiErrorCode(e) === "FEEDBACK_IDEMPOTENCY_CONFLICT") {
        toast.error(t("Couldn't send"), { description: t("Check your feedback below, then send again.") });
      } else if (e instanceof ApiError && e.status === 503 && /not enabled/i.test(e.message)) {
        setOff(true);
        toast.error(t("Feedback is unavailable right now"));
      } else if (e instanceof ApiError && e.uncertain) {
        toast.error(t("Not sure it was sent"), { description: t("Send again. It won't be sent twice.") });
      } else {
        const d = describeError(e);
        toast.error(d.title, { description: d.detail });
      }
    } finally {
      setBusy(false);
      // the review list, the cooldown and Home's invitation all come from the server again
      qc.invalidateQueries({ queryKey: ["feedback"] });
      qc.invalidateQueries({ queryKey: qk.trader });
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      {off && (
        <Notice tone="warn" title={t("Feedback is unavailable right now")}>
          {t("Try again later.")}
        </Notice>
      )}
      {pending && !off && (
        <Notice tone="warn" title={t("Last send didn't finish")}>
          {t("Send again. It won't be sent twice.")}
        </Notice>
      )}

      <div>
        <div className="mb-2 text-center text-body-sm font-semibold">{t("How is XENO working for you?")}</div>
        <StarPicker value={rating} onChange={setRating} disabled={busy} />
        {tried && rating === 0 && (
          <p role="alert" className="mt-1 text-center text-label text-destructive">
            {t("Choose a rating")}
          </p>
        )}
      </div>

      <label className="block">
        <span className="sr-only">{t("Your experience")}</span>
        <textarea
          // empty, so the placeholder sits on the page's own side; then whichever way the text runs
          dir={text ? "auto" : undefined}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={busy}
          rows={5}
          placeholder={t("Tell us about your experience")}
          aria-invalid={(tried && !!problem && rating > 0) || undefined}
          className="block w-full resize-none rounded-lg bg-surface-raised p-3 text-body text-foreground outline-none! placeholder:text-subtle focus:ring-1 focus:ring-primary"
        />
        <span className="mt-1.5 flex justify-between gap-3 px-1 text-caption">
          <span className={tried && problem && rating > 0 ? "text-destructive" : "text-muted-foreground"}>{tried && rating > 0 ? problem : ""}</span>
          <span className={`tabular-nums ${length > FEEDBACK_MAX ? "text-destructive" : "text-muted-foreground"}`}>
            {length}/{FEEDBACK_MAX}
          </span>
        </span>
      </label>

      {/* off until the user turns it on; leaving it off still sends a private review */}
      <label className="flex items-start gap-2.5 px-1 text-body-sm">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy} className="mt-0.5 size-5 shrink-0 accent-primary" />
        <span className="text-foreground/85">{t("Allow this feedback to appear publicly under a masked name after review.")}</span>
      </label>

      <Button size="lg" block loading={busy} disabled={off} icon={<Icon icon={SentIcon} size={18} />} onClick={send}>
        {t("Send feedback")}
      </Button>
    </Card>
  );
}
