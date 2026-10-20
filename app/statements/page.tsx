"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { ChartCandlestickIcon, DashboardSquare01Icon, MoneyExchange01Icon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import type { AgentInstance, Range } from "@/lib/api/types";
import { pick } from "@/lib/format";
import { instanceStatus, INSTANCE_FINAL } from "@/lib/labels";
import { useInstances, useStatement } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { useInstanceControl } from "@/components/agents/shared";
import { Funding } from "@/components/statement/funding";
import { Overview } from "@/components/statement/overview";
import { Trades } from "@/components/statement/trades";
import { Button } from "@/components/ui/button";
import { Chip, Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Card, ErrorState, Page, PageHeader, Pill, SectionTitle, Skeleton } from "@/components/ui/primitives";

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "6m", label: "6M" },
  { value: "all", label: "All" },
];
type Tab = "overview" | "trades" | "funding";
const TABS: { value: Tab; label: string; icon: Parameters<typeof Icon>[0]["icon"] }[] = [
  { value: "overview", label: "Overview", icon: DashboardSquare01Icon },
  { value: "trades", label: "Trades", icon: ChartCandlestickIcon },
  { value: "funding", label: "Funding", icon: MoneyExchange01Icon },
];

export default function Route() {
  return (
    <Suspense>
      <StatementsPage />
    </Suspense>
  );
}

function StatementsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [tab, setTab] = useState<Tab>("overview");
  const params = useSearchParams();
  const [picked, setAgent] = useState<string | null | undefined>(undefined);
  // undefined = not picked yet (use ?agent=), null = "All agents"
  const agent = (picked === undefined ? params.get("agent") : picked) ?? undefined;
  const instances = useInstances();
  const st = useStatement(range, agent);

  return (
    <Page>
      <PageHeader title="Statement" subtitle="Your trading results" />
      <Segmented layoutId="range" value={range} onChange={setRange} options={RANGES} />
      {!!instances.data?.length && (
        <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 py-1.5 min-[390px]:-mx-5 min-[390px]:px-5">
          <Chip active={!agent} onClick={() => setAgent(null)}>
            All agents
          </Chip>
          {instances.data.map((i) => (
            <Chip key={i.id} active={agent === i.id} onClick={() => setAgent(i.id)}>
              {i.name}
            </Chip>
          ))}
        </div>
      )}

      <div role="tablist" className="mt-3 flex border-b">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => {
              haptic.select();
              setTab(t.value);
            }}
            className={`relative inline-flex h-11 flex-1 items-center justify-center gap-1.5 text-body-sm font-semibold transition-colors ${tab === t.value ? "text-foreground" : "text-muted-foreground"}`}
          >
            <Icon icon={t.icon} size={16} className={tab === t.value ? "text-primary" : ""} />
            {t.label}
            {tab === t.value && <motion.span layoutId="statement-tab" className="absolute inset-x-5 -bottom-px h-0.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      {tab === "trades" ? (
        <Trades key={`${range}:${agent ?? ""}`} range={range} agent={agent} />
      ) : st.isPending ? (
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton className="h-44 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
          <Skeleton className="h-40 rounded-lg" />
        </div>
      ) : st.isError ? (
        <div className="mt-5">
          <ErrorState error={st.error} onRetry={() => st.refetch()} />
        </div>
      ) : tab === "overview" ? (
        <>
          <Overview s={st.data} range={range} agent={agent} />
          <AgentControls instances={instances.data ?? []} agent={agent} />
        </>
      ) : (
        <Funding s={st.data} />
      )}
    </Page>
  );
}

function AgentControls({ instances, agent }: { instances: AgentInstance[]; agent?: string }) {
  const list = instances.filter((i) => !INSTANCE_FINAL.has(i.status) && i.status !== "stopping" && (!agent || i.id === agent));
  if (!list.length) return null;
  return (
    <>
      <SectionTitle>Pause or resume</SectionTitle>
      <Card className="divide-y divide-border px-4">
        {list.map((i) => (
          <AgentControlRow key={i.id} inst={i} />
        ))}
      </Card>
    </>
  );
}

function AgentControlRow({ inst }: { inst: AgentInstance }) {
  const { patch, busy } = useInstanceControl(inst);
  const st = instanceStatus(inst.status);
  const limit = inst.dailyEntryLimit ?? pick<number>(inst.config, ["daily_limit", "dailyLimit"]);
  return (
    <div className="flex min-h-16 items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-semibold">{inst.name}</div>
        <div className="text-label font-normal text-muted-foreground">
          {st.label}
          {limit != null && (inst.entriesToday != null ? ` · ${inst.entriesToday} of ${limit} trades today` : ` · ${limit} trades/day`)}
          {inst.dailyRiskHalted && " · daily loss limit"}
        </div>
      </div>
      {inst.status === "active" ? (
        <Button size="sm" variant="secondary" icon={<Icon icon={PauseIcon} size={16} />} loading={busy === "paused"} onClick={() => patch({ status: "paused" })}>
          Pause
        </Button>
      ) : inst.status === "paused" ? (
        <Button size="sm" variant="secondary" icon={<Icon icon={PlayIcon} size={16} />} loading={busy === "active"} disabled={!inst.entriesEnabled} onClick={() => patch({ status: "active" })}>
          Resume
        </Button>
      ) : (
        <Pill tone={st.tone}>{st.label}</Pill>
      )}
    </div>
  );
}
