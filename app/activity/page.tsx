"use client";
import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Invoice03Icon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { Range } from "@/lib/api/types";
import { qk, useInstances } from "@/lib/queries";
import { ActivityItem } from "@/components/activity-item";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, FlowHeader, ListSkeleton, Page } from "@/components/ui/primitives";

export default function ActivityPage() {
  const [range, setRange] = useState<Range>("all");
  const instances = useInstances();
  const names = Object.fromEntries((instances.data ?? []).map((i) => [i.id, i.name]));
  const q = useInfiniteQuery({
    queryKey: [...qk.activity(range), "infinite"],
    queryFn: ({ pageParam }) => API.activity({ page: pageParam, range }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Page nav={false}>
      <FlowHeader title="Activity" />
      <Segmented
        layoutId="act-range"
        value={range}
        onChange={setRange}
        options={[
          { value: "7d", label: "7 days" },
          { value: "30d", label: "30 days" },
          { value: "6m", label: "6 months" },
          { value: "all", label: "All" },
        ]}
      />
      <div className="mt-4">
        {q.isPending ? (
          <ListSkeleton rows={5} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length ? (
          <>
            <Card className="divide-y divide-border px-4">
              {items.map((j) => (
                <ActivityItem key={j.id} j={j} names={names} />
              ))}
            </Card>
            {q.hasNextPage && (
              <Button variant="secondary" block className="mt-4" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                Load more
              </Button>
            )}
          </>
        ) : (
          <EmptyState icon={<Icon icon={Invoice03Icon} size={28} />} title="No activity in this period" />
        )}
      </div>
    </Page>
  );
}
