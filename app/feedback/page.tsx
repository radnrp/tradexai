"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Message01Icon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { feedbackStatus } from "@/lib/feedback";
import { fmtDateTime } from "@/lib/format";
import { qk } from "@/lib/queries";
import { t } from "@/lib/i18n";
import { FeedbackForm } from "@/components/feedback/feedback-form";
import { Stars } from "@/components/feedback/stars";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, FlowHeader, ListSkeleton, Page, Pill, SectionTitle } from "@/components/ui/primitives";

/**
 * In-app feedback (contract 2026-10-30): a rating, the user's own words and a separate, opt-in consent to publish, then the
 * user's own reviews with their review state. Opened from Profile, Home's invitation, the rating popup or a bot message. Nothing here is shown to
 * anyone else; an approved, consented copy reaches the community feed only through the server.
 */
export default function FeedbackPage() {
  return (
    <Page nav={false}>
      <FlowHeader title={t("Feedback")} />
      <FeedbackForm />
      <SectionTitle>{t("Your feedback")}</SectionTitle>
      <History />
    </Page>
  );
}

/** The user's own reviews, newest first, 20 a page; the text exactly as they wrote it, as plain text. */
function History() {
  const q = useInfiniteQuery({
    queryKey: qk.myFeedback,
    queryFn: ({ pageParam }) => API.myFeedback(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (q.isPending) return <ListSkeleton rows={2} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items);
  if (!items.length) return <EmptyState icon={<Icon icon={Message01Icon} size={28} />} title={t("No feedback yet")} />;
  return (
    <>
      <Card className="divide-y divide-border px-4">
        {items.map((f) => {
          const s = feedbackStatus(f.status);
          return (
            <div key={f.id} className="py-3">
              <div className="flex items-center gap-2">
                <Stars value={f.rating} />
                <span className="min-w-0 flex-1 truncate text-caption text-muted-foreground">
                  {fmtDateTime(f.createdAt)}
                  {f.publicationConsent ? "" : ` · ${t("Private")}`}
                </span>
                <Pill tone={s.tone}>{s.label}</Pill>
              </div>
              <p dir="auto" className="mt-1.5 whitespace-pre-line break-words text-body-sm text-foreground/85">{f.text}</p>
              {f.publicText && f.publicText !== f.text && (
                <p dir="auto" className="mt-1.5 whitespace-pre-line break-words text-caption text-muted-foreground">{t("Published as: {text}", { text: f.publicText })}</p>
              )}
            </div>
          );
        })}
      </Card>
      {q.hasNextPage && (
        <Button variant="secondary" size="sm" block className="mt-3" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {t("Load more")}
        </Button>
      )}
    </>
  );
}
