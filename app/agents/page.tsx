"use client";
import { useState } from "react";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { useTrader } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { Trades } from "@/components/statement/trades";
import { AgentInfoDialog } from "@/components/trader/agent-info";
import { AgentTour } from "@/components/trader/agent-tour";
import { CalculatorDialog } from "@/components/trader/calculator";
import { AgentCard } from "@/components/trader/agent-card";
import { Icon } from "@/components/ui/icon";
import { ErrorState, Page, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";

/** The agent: one card with its state and numbers, then its trades. Its rules are one tap away in Agent info; the value chart lives on Statement. */
export default function AgentPage() {
  const trader = useTrader();
  const [info, setInfo] = useState(false);
  const [tour, setTour] = useState(false);
  const [calc, setCalc] = useState(false);
  const t = trader.data;

  return (
    <Page>
      <PageHeader
        title="Agent"
        action={
          t && (
            <button
              type="button"
              onClick={() => {
                haptic.tap();
                setInfo(true);
              }}
              className="hit-area inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-surface-raised px-3.5 text-label font-semibold text-foreground"
            >
              <Icon icon={InformationCircleIcon} size={16} />
              Agent info
            </button>
          )
        }
      />

      {trader.isPending ? (
        <Skeleton className="h-96 rounded-lg" />
      ) : !t ? (
        <ErrorState error={trader.error} onRetry={() => trader.refetch()} />
      ) : (
        <AgentCard t={t} />
      )}

      <SectionTitle>Trades</SectionTitle>
      {/* the list brings its own top margin for the Statement page */}
      <div className="[&>div]:mt-0">
        <Trades range="all" showAgent={false} />
      </div>

      {t && (
        <>
          <AgentInfoDialog t={t} open={info} onClose={() => setInfo(false)} onTutorial={() => setTour(true)} onCalculator={() => setCalc(true)} />
          <AgentTour open={tour} t={t} onClose={() => setTour(false)} />
          <CalculatorDialog open={calc} onClose={() => setCalc(false)} />
        </>
      )}
    </Page>
  );
}
