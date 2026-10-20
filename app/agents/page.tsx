"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BookOpen01Icon, ChartLineData02Icon, PlayCircleIcon, Robot01Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { readPolicy } from "@/lib/agent-info";
import type { AgentInstance } from "@/lib/api/types";
import { INSTANCE_FINAL } from "@/lib/labels";
import { cmp } from "@/lib/money";
import { useHealth, useInstances, useModels } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { AgentSheet } from "@/components/agents/agent-sheet";
import { AgentsTour } from "@/components/agents/agents-tour";
import { AgentList } from "@/components/agents/plans";
import { InstanceRow } from "@/components/agents/shared";
import { Icon } from "@/components/ui/icon";
import { Card, ErrorState, ListSkeleton, Notice, Page, PageHeader, SectionTitle, Skeleton } from "@/components/ui/primitives";

const TOUR_KEY = "txai.agentsTourSeen";
/** How many running agents this page shows; the rest live on /agents/mine. */
const PREVIEW = 3;

export default function AgentsPage() {
  const models = useModels();
  const health = useHealth();
  const instances = useInstances(true);
  // first visit opens the guide card once; after that it's behind the Guide button
  const [guide, setGuide] = useState(() => {
    try {
      return !localStorage.getItem(TOUR_KEY);
    } catch {
      return false;
    }
  });
  const [tour, setTour] = useState(false);
  // the model stays set while closing so the sheet doesn't empty mid-animation
  const [sheet, setSheet] = useState<{ i: number; open: boolean } | null>(null);
  // cheapest first: the ladder climbs, and each sheet compares against the one below it
  const list = useMemo(() => [...(models.data ?? [])].sort((a, b) => cmp(a.min_capital, b.min_capital)), [models.data]);
  // the guide quotes the shared rules from the catalog, and the R/R target only when every agent has the same one
  const tourFacts = useMemo(() => {
    const rrs = new Set(list.map((m) => Number(m.rr)));
    return { policy: readPolicy(list[0]?.tradePolicy), rr: rrs.size === 1 ? [...rrs][0] : null };
  }, [list]);

  // "New agent" links here as /agents#choose: jump to the catalog once the sections above it have their real height
  const chooseRef = useRef<HTMLDivElement>(null);
  const loaded = !models.isPending && !instances.isPending;
  useEffect(() => {
    if (loaded && location.hash === "#choose") chooseRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  const markSeen = () => {
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch { }
  };
  const toggleGuide = () => {
    haptic.tap();
    if (guide) markSeen();
    setGuide(!guide);
  };

  return (
    <Page>
      <PageHeader
        title="Agents"
        subtitle={<Summary all={instances.data} />}
        action={
          <button
            type="button"
            onClick={toggleGuide}
            aria-expanded={guide}
            aria-controls="agents-guide"
            className={`hit-area inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-label font-semibold transition-colors duration-150 ${
              guide ? "bg-foreground text-background" : "bg-surface-raised text-foreground"
            }`}
          >
            <Icon icon={BookOpen01Icon} size={16} />
            Guide
          </button>
        }
      />

      <AnimatePresence initial={false}>
        {guide && (
          <motion.div
            id="agents-guide"
            key="guide"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <GuideCard
              onOpen={() => {
                haptic.tap();
                setTour(true);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <MyAgents q={instances} />

      <div ref={chooseRef} id="choose" className="scroll-mt-2" aria-hidden />
      <SectionTitle>Choose your agent</SectionTitle>
            {models.isPending ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : models.isError ? (
        <ErrorState error={models.error} onRetry={() => models.refetch()} />
      ) : (
        <>
          {health.data && !health.data.agentEngine.entriesEnabled && (
            <div className="mb-3">
              <Notice tone="warn">New trades paused</Notice>
            </div>
          )}
          <AgentList list={list} onChoose={(i) => setSheet({ i, open: true })} />
        </>
      )}

      {sheet && list[sheet.i] && (
        <AgentSheet key={list[sheet.i].id} model={list[sheet.i]} all={list} prev={list[sheet.i - 1]} open={sheet.open} onClose={() => setSheet({ ...sheet, open: false })} />
      )}
      <AgentsTour
        open={tour}
        facts={tourFacts}
        onClose={() => {
          setTour(false);
          markSeen();
        }}
      />
    </Page>
  );
}

const running = (all: AgentInstance[] = []) => all.filter((i) => !INSTANCE_FINAL.has(i.status));

/** The header's second line: what your agents are doing right now, or what agents are. */
function Summary({ all }: { all?: AgentInstance[] }) {
  const live = running(all);
  if (!live.length) return "Automated crypto trading";
  const trading = live.filter((i) => i.openPositions > 0).length;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inset-0 animate-ping-soft rounded-full bg-primary" />
        <span className="relative size-2 rounded-full bg-primary" />
      </span>
      {live.length} running{trading ? ` · ${trading} in trade` : ""}
    </span>
  );
}

const STEPS = [
  [Robot01Icon, "Pick an agent"],
  [Wallet01Icon, "Give it money"],
  [ChartLineData02Icon, "Watch it trade"],
] as const;

/** The short version of the guide. Tapping anywhere on it opens the full step-by-step sheet. */
function GuideCard({ onOpen }: { onOpen: () => void }) {
  return (
    // whole card is the tap target; the button inside is the keyboard/screen-reader route (a button can't hold a heading or list)
    <div onClick={onOpen} className="hero-gradient cursor-pointer rounded-xl p-5 text-white transition-transform duration-100 active:scale-[0.99]">
      <h2 className="text-h2">How agents work</h2>

      {/* a real sequence, so the steps sit on one connected path */}
      <ol className="relative mt-5 grid grid-cols-3">
        <span className="absolute left-4.5 right-4.5 top-4.5 h-px bg-white/25" aria-hidden />
        {STEPS.map(([icon, label], k) => (
          <li key={label} className={`relative flex flex-col gap-2 ${k === 0 ? "items-start" : k === 1 ? "items-center" : "items-end"}`}>
            <span className="grid size-9 place-items-center rounded-full bg-[#1E2B24] ring-1 ring-white/25">
              <Icon icon={icon} size={18} />
            </span>
            <span className="text-label">{label}</span>
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        className="mt-5 flex w-full items-center gap-2 rounded-full bg-white/12 px-4 py-2.5 text-left text-button"
      >
        <Icon icon={PlayCircleIcon} size={18} />
        Open guide
        <span className="ml-auto text-caption font-normal text-white/70">5 steps</span>
      </button>
    </div>
  );
}

/** A few running agents, busiest first. Everything else is on the My agents page. */
function MyAgents({ q }: { q: ReturnType<typeof useInstances> }) {
  if (q.isPending)
    return (
      <>
        <SectionTitle>Your agents</SectionTitle>
        <ListSkeleton rows={2} />
      </>
    );
  if (q.isError)
    return (
      <>
        <SectionTitle>Your agents</SectionTitle>
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </>
    );

  const all = q.data;
  // nothing bought yet: the catalog below is the next step, so no empty box here
  if (!all.length) return null;
  const live = running(all).sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.openPositions - a.openPositions);
  const shown = live.slice(0, PREVIEW);
  const more = all.length - shown.length;

  return (
    <>
      <SectionTitle href="/agents/mine" linkLabel={`All ${all.length}`}>
        Your agents
      </SectionTitle>
      {shown.length ? (
        <Card className="divide-y divide-border px-4">
          {shown.map((i) => (
            <InstanceRow key={i.id} inst={i} />
          ))}
          {more > 0 && (
            <Link href="/agents/mine" className="flex h-12 items-center justify-center text-label text-muted-foreground active:text-foreground">
              +{more} more
            </Link>
          )}
        </Card>
      ) : (
        <Link href="/agents/mine" className="block rounded-lg bg-surface p-4 text-body-sm text-muted-foreground active:bg-surface-raised">
          None running · {all.length} ended
        </Link>
      )}
    </>
  );
}
