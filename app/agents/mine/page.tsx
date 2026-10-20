"use client";
import { Add01Icon, Robot01Icon } from "@hugeicons/core-free-icons";
import type { AgentInstance } from "@/lib/api/types";
import { INSTANCE_FINAL } from "@/lib/labels";
import { useInstances } from "@/lib/queries";
import { InstanceRow } from "@/components/agents/shared";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, FlowHeader, ListSkeleton, Page, SectionTitle } from "@/components/ui/primitives";

export default function MyAgentsPage() {
  const instances = useInstances(true);
  const all = instances.data ?? [];
  // busiest first, so what's trading right now is at the top
  const running = all.filter((i) => !INSTANCE_FINAL.has(i.status)).sort((a, b) => b.openPositions - a.openPositions);
  const ended = all.filter((i) => INSTANCE_FINAL.has(i.status));

  return (
    <Page nav={false}>
      <FlowHeader title="My agents" />
      <div className="mt-3">
        {instances.isPending ? (
          <ListSkeleton />
        ) : instances.isError ? (
          <ErrorState error={instances.error} onRetry={() => instances.refetch()} />
        ) : all.length ? (
          <>
            <Group title={`Running (${running.length})`} list={running} empty="None running" first />
            {ended.length > 0 && <Group title={`Ended (${ended.length})`} list={ended} />}
            <Button as="a" href="/agents" variant="secondary" block className="mt-6" icon={<Icon icon={Add01Icon} size={18} />}>
              Add another agent
            </Button>
          </>
        ) : (
          <EmptyState
            icon={<Icon icon={Robot01Icon} size={28} />}
            title="No agents yet"
            action={
              <Button as="a" href="/agents" size="sm" icon={<Icon icon={Add01Icon} size={16} />}>
                Browse agents
              </Button>
            }
          />
        )}
      </div>
    </Page>
  );
}

function Group({ title, list, empty, first }: { title: string; list: AgentInstance[]; empty?: string; first?: boolean }) {
  return (
    <section className={first ? "[&>div:first-child]:mt-2" : undefined}>
      <SectionTitle>{title}</SectionTitle>
      {list.length ? (
        <Card className="divide-y divide-border px-4">
          {list.map((i) => (
            <InstanceRow key={i.id} inst={i} />
          ))}
        </Card>
      ) : (
        <p className="rounded-lg bg-surface p-4 text-body-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}
