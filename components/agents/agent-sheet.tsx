"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert02Icon,
  ArrowDataTransferVerticalIcon,
  ArrowDown02Icon,
  ArrowDownRight01Icon,
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  ChartDownIcon,
  ChartLineData02Icon,
  Clock01Icon,
  Coins01Icon,
  FlashIcon,
  Layers01Icon,
  PercentCircleIcon,
  PieChartIcon,
  PlayIcon,
  RepeatIcon,
  ScaleIcon,
  ShieldEnergyIcon,
  Target02Icon,
} from "@hugeicons/core-free-icons";
import { diffFrom, leverageText, pct, readPolicy, rrText, stopLossText, strengths, timeLimitText } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import type { AgentModel } from "@/lib/api/types";
import { pick } from "@/lib/format";
import { add, cmp, fmt } from "@/lib/money";
import { useWallet } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { CreateForm } from "./create-agent-sheet";

type IconSvg = Parameters<typeof Icon>[0]["icon"];
type Fact = { icon: IconSvg; label: string; value: string };
const facts = (list: (Fact | null)[]) => list.filter((f): f is Fact => f != null);

export const modelState = (m: AgentModel) =>
  m.engineConnected ? (m.entriesEnabled ? { tone: "ok" as const, label: "Open" } : { tone: "pending" as const, label: "Paused" }) : { tone: "bad" as const, label: "Offline" };

const cheapestPlan = (m: AgentModel) => {
  const plans = m.billing_mode === "subscription" ? (m.subscriptionPlans ?? []) : [];
  return plans.reduce<string | null>((a, p) => (a == null || cmp(p.price, a) < 0 ? p.price : a), null);
};

/** One agent: the start action pinned on top, then everything it does as short facts. */
export function AgentSheet({ model: m, all, prev, open, onClose }: { model: AgentModel; all: AgentModel[]; prev?: AgentModel; open: boolean; onClose: () => void }) {
  const [starting, setStarting] = useState(false);
  // the start form's button renders here, under the scrolling body, so it never covers the form
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const wallet = useWallet();
  const openDeposit = useOpenDeposit();
  const available = wallet.data?.available ?? "0";

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={starting ? `Start ${m.name}` : m.name}
      subtitle={starting ? "Choose its money" : strengths(m, all)}
      footer={starting && <div ref={setFooter} />}
      top={
        !starting && (
          <StartBar
            m={m}
            available={available}
            loading={wallet.isPending}
            onStart={() => {
              haptic.tap();
              setStarting(true);
            }}
            onDeposit={() => openDeposit()}
          />
        )
      }
    >
      {starting ? (
        <>
          <button type="button" onClick={() => setStarting(false)} className="hit-area mb-3 inline-flex items-center gap-1 text-label text-muted-foreground">
            <Icon icon={ArrowLeft01Icon} size={16} /> Details
          </button>
          <CreateForm model={m} available={available} footer={footer} onClose={onClose} />
        </>
      ) : (
        <Details m={m} prev={prev} />
      )}
    </Sheet>
  );
}

/** What it takes to start, and the one button that starts it (or adds the missing money). */
function StartBar({ m, available, loading, onStart, onDeposit }: { m: AgentModel; available: string; loading: boolean; onStart: () => void; onDeposit: () => void }) {
  const plan = cheapestPlan(m);
  const need = plan ? add(m.min_capital, plan) : m.min_capital;
  const short = !loading && cmp(available, need) < 0;
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-raised p-3 pl-4">
      <div className="min-w-0 flex-1">
        <div className="text-h2 tabular-nums">{fmt(need, 0)} USDT</div>
        <div className="truncate text-caption text-muted-foreground">
          {short ? `Minimum · you have ${fmt(available)} USDT` : plan ? "Minimum, plan included" : "Minimum to start"}
        </div>
      </div>
      {short ? (
        <Button icon={<Icon icon={ArrowDown02Icon} size={18} />} onClick={onDeposit}>
          Deposit
        </Button>
      ) : (
        <Button icon={<Icon icon={PlayIcon} size={18} />} loading={loading} onClick={onStart}>
          Activate
        </Button>
      )}
    </div>
  );
}

function Details({ m, prev }: { m: AgentModel; prev?: AgentModel }) {
  const st = modelState(m);
  const about = pick<string>(m as unknown as Record<string, unknown>, ["description", "summary"]);
  const diffs = prev ? diffFrom(prev, m) : [];
  // fewer than 50 is normal: unsuitable markets are filtered out server-side
  const universe = useQuery({ queryKey: ["universe"], queryFn: API.universe, staleTime: 10 * 60_000 });
  const plan = cheapestPlan(m);
  // every rule comes from the catalog; null fields mean auto leverage, a dynamic stop and no time exit
  const p = readPolicy(m.tradePolicy);
  const floorBps = m.equityFloorBps ?? 2000;

  const trading = facts([
    { icon: FlashIcon, label: "Strategy", value: "Scalping" },
    { icon: Coins01Icon, label: "Markets", value: universe.data ? `${universe.data.length} coins` : `Top ${p.universe}` },
    { icon: ArrowDataTransferVerticalIcon, label: p.leverage != null ? "Leverage" : "Auto leverage", value: leverageText(p) },
    { icon: Layers01Icon, label: "Max open", value: `${p.maxOpen} trades` },
    { icon: RepeatIcon, label: "Daily limit", value: `${m.daily_limit} trades` },
    { icon: Clock01Icon, label: "Time limit", value: timeLimitText(p) },
  ]);
  const money = facts([
    plan
      ? { icon: PercentCircleIcon, label: "Plan", value: `From ${fmt(plan, 0)} USDT` }
      : { icon: PercentCircleIcon, label: "Fee per side", value: pct(m.fee_bps) },
    { icon: PieChartIcon, label: "Margin per trade", value: `${pct(p.budgetBps)} of value` },
    { icon: ScaleIcon, label: "Target R/R", value: rrText(m.rr) },
    { icon: Target02Icon, label: "Stop loss", value: stopLossText(p) },
    p.riskPerTradeBps != null ? { icon: ShieldEnergyIcon, label: "Risk per trade", value: `Max ${pct(p.riskPerTradeBps)}` } : null,
    p.maxPortfolioRiskBps != null ? { icon: Layers01Icon, label: "Total risk", value: `Max ${pct(p.maxPortfolioRiskBps)}` } : null,
    p.dailyLossBps != null ? { icon: ChartDownIcon, label: "Daily loss stop", value: `−${pct(p.dailyLossBps)}` } : null,
    { icon: ChartLineData02Icon, label: "Target win rate", value: `${m.target_winrate_min}–${m.target_winrate_max}%` },
  ]);
  const notes = [
    !plan && "Fees are a share of each trade's margin, on entry and on exit.",
    `Margin is ${pct(p.budgetBps)} of the agent's current value, so it moves with results. Fees come on top.`,
    `${rrText(m.rr)} is the take-profit vs stop-loss price distance, before costs. It doesn't promise a profit.`,
    p.minimumRR && `It only enters when the price and estimated net R/R are at least ${p.minimumRR}.`,
    p.dailyLossBps != null && `A ${pct(p.dailyLossBps)} loss in a day stops new trades until the next UTC day.`,
    `It stops itself if its value falls to ${pct(floorBps)} of what it started with.`,
  ].filter((x): x is string => !!x);

  return (
    <div className="flex flex-col gap-4">
      {st.tone !== "ok" && (
        <Notice tone="warn">{st.tone === "bad" ? "Trading offline" : "New trades paused"}</Notice>
      )}
      {about && <p className="text-body-sm text-muted-foreground">{about}</p>}

      {prev && diffs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-0.5 text-caption text-muted-foreground">vs {prev.name}</span>
          {diffs.map((d) => (
            <span key={d.short} className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-raised px-2.5 text-caption" title={d.long}>
              <Icon icon={d.up ? ArrowUpRight01Icon : ArrowDownRight01Icon} size={12} className="text-muted-foreground" />
              {d.short}
            </span>
          ))}
        </div>
      )}

      <Facts title="Trading" color="text-warning bg-warning/12" facts={trading} />
      <Facts title="Risk & fees" color="text-info bg-info/12" facts={money} />
      <ul className="flex list-disc flex-col gap-1 pl-4 text-caption text-muted-foreground marker:text-subtle">
        {notes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>

      <p className="flex items-start gap-2 text-caption text-muted-foreground">
        <Icon icon={Alert02Icon} size={14} className="mt-px shrink-0 text-warning" />
        Results apply to your balance. You can lose money.
      </p>
    </div>
  );
}

function Facts({ title, color, facts }: { title: string; color: string; facts: Fact[] }) {
  return (
    <section>
      <h3 className="mb-2 px-0.5 text-label text-muted-foreground">{title}</h3>
      <ul className="grid grid-cols-2 gap-2">
        {facts.map((f) => (
          <li key={f.label} className="flex items-center gap-2.5 rounded-md bg-surface-raised p-3">
            <span className={`grid size-8 shrink-0 place-items-center rounded-full ${color}`}>
              <Icon icon={f.icon} size={16} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-caption text-muted-foreground">{f.label}</div>
              <div className="truncate text-body-sm font-semibold tabular-nums">{f.value}</div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
