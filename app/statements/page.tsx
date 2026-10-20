"use client";
import { useState } from "react";
import { motion } from "motion/react";
import { ChartCandlestickIcon, DashboardSquare01Icon, MoneyExchange01Icon } from "@hugeicons/core-free-icons";
import type { Range } from "@/lib/api/types";
import { useStatement } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { Funding } from "@/components/statement/funding";
import { Overview } from "@/components/statement/overview";
import { Trades } from "@/components/statement/trades";
import { Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { ErrorState, Page, PageHeader, Skeleton } from "@/components/ui/primitives";

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

export default function StatementsPage() {
  const [range, setRange] = useState<Range>("30d");
  const [tab, setTab] = useState<Tab>("overview");
  // no instanceId: the full history, earlier agents included
  const st = useStatement(range);

  return (
    <Page>
      <PageHeader title="Statement" subtitle="Your trading results" />
      <Segmented layoutId="range" value={range} onChange={setRange} options={RANGES} />
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
        <Trades key={range} range={range} showAgent={false} />
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
        <Overview s={st.data} range={range} />
      ) : (
        <Funding s={st.data} />
      )}
    </Page>
  );
}
