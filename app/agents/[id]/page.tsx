"use client";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Invoice03Icon, PauseIcon, PencilEdit02Icon, PlayIcon, StopIcon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { AgentInstance, EntryRejection, Statement } from "@/lib/api/types";
import { fmtAgo, fmtDateTime, fmtTime } from "@/lib/format";
import { entryRejectionFacts, entryRejectionText, executionState, INSTANCE_FINAL, instanceStatus } from "@/lib/labels";
import { pollUntil, qk, useHealth, useLedgerSync } from "@/lib/queries";
import { valuationNotes } from "@/lib/valuation";
import { haptic } from "@/lib/telegram";
import { maxOpenOf, rrText, targetRROf } from "@/lib/agent-info";
import { add, fmt, ratio, sign, sub } from "@/lib/money";
import { TradeSlots, useInstanceControl } from "@/components/agents/shared";
import { PositionCard } from "@/components/trading/position-card";
import { Button, IconButton } from "@/components/ui/button";
import { Field, inputCls, Segmented } from "@/components/ui/controls";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, FlowHeader, ListSkeleton, Notice, Page, Pill, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";

const PAGE_SIZE = 5;

export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery({ queryKey: qk.instance(id), queryFn: () => API.instance(id), refetchInterval: pollUntil(INSTANCE_FINAL, 12_000) });

  if (q.isPending)
    return (
      <Page nav={false}>
        <FlowHeader title="Agent" />
        <Skeleton className="mt-3 h-72 rounded-lg" />
        <Skeleton className="mt-4 h-60 rounded-lg" />
      </Page>
    );
  if (q.isError)
    return (
      <Page nav={false}>
        <FlowHeader title="Agent" />
        <div className="mt-6">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      </Page>
    );
  return <Detail inst={q.data} />;
}

function Detail({ inst }: { inst: AgentInstance }) {
  const final = INSTANCE_FINAL.has(inst.status);
  const [tab, setTab] = useState<"open" | "closed">("open");
  const [page, setPage] = useState(1);
  const listTop = useRef<HTMLDivElement>(null);
  // after a page change, bring the start of the list into view instead of leaving the user at the pager
  const turnPage = (to: number) => {
    setPage(to);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    listTop.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };
  const positions = useQuery({
    queryKey: [...qk.positions(tab, inst.id), page],
    queryFn: () => API.positions({ status: tab, instanceId: inst.id, page, limit: PAGE_SIZE }),
    refetchInterval: final ? false : 10_000,
    // keep the current page on screen while the next one loads
    placeholderData: keepPreviousData,
  });
  const pages = Math.max(1, Math.ceil((positions.data?.total ?? 0) / PAGE_SIZE));
  // a closed trade can shrink the open list under the current page
  if (positions.data && !positions.isPlaceholderData && page > pages) setPage(pages);
  // the agent's own value and PnL come from its scoped statement; cash alone isn't its value
  const statement = useQuery({
    queryKey: qk.statement("all", inst.id),
    queryFn: () => API.statement("all", inst.id),
    refetchInterval: final ? false : 15_000,
  });
  const [renaming, setRenaming] = useState(false);
  // a trade opening/closing or funding settling changes the wallet and statements too: reread them
  useLedgerSync(`${inst.id}:${inst.status}:${inst.openPositions}:${inst.pendingOrders}:${inst.funding_reserved ?? ""}`);

  return (
    <Page nav={false}>
      <FlowHeader
        title={inst.name}
        action={
          !final && (
            <IconButton label="Rename agent" onClick={() => setRenaming(true)}>
              <Icon icon={PencilEdit02Icon} size={18} />
            </IconButton>
          )
        }
      />

      <AccountCard inst={inst} statement={statement} />
      <Controls inst={inst} />

      <div ref={listTop} className="scroll-mt-2" aria-hidden />
      <SectionTitle href={`/statements?agent=${inst.id}`} linkLabel="Statement">
        Positions
      </SectionTitle>
      <Segmented
        layoutId="pos-tab"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        options={[
          { value: "open", label: `Open (${inst.openPositions})` },
          { value: "closed", label: "History" },
        ]}
      />
      <div className="mt-3 flex flex-col gap-2">
        {positions.isPending ? (
          <ListSkeleton rows={2} />
        ) : positions.isError ? (
          <ErrorState error={positions.error} onRetry={() => positions.refetch()} />
        ) : positions.data.items.length ? (
          <>
            {positions.data.items.map((p) => (
              <PositionCard key={p.id} p={p} showAgent={false} />
            ))}
            {pages > 1 && <Pager page={page} pages={pages} total={positions.data.total} busy={positions.isPlaceholderData} onPage={turnPage} />}
          </>
        ) : (
          <EmptyState
            icon={<Icon icon={Invoice03Icon} size={28} />}
            title={tab === "open" ? "No open positions" : "No closed positions yet"}
            body={
              tab === "open" && !final
                ? `It waits for a setup that passes its risk checks, so a trade may not open right away. Up to ${maxOpenOf(inst)} can be open at once, each in a different coin.`
                : undefined
            }
          />
        )}
      </div>

      <RenameSheet inst={inst} open={renaming} onClose={() => setRenaming(false)} />
    </Page>
  );
}

/** The agent as an account: what it's worth, how it did, where its money is and what it's doing. */
function AccountCard({ inst, statement }: { inst: AgentInstance; statement: UseQueryResult<Statement> }) {
  const st = instanceStatus(inst.status);
  const final = INSTANCE_FINAL.has(inst.status);
  const s = statement.data;
  // null equity means some price is missing; fall back to the booked value and say so
  const value = final ? inst.capital_released : s ? (s.equity ?? s.bookedEquity) : null;
  const pnl = value != null ? sub(value, inst.initial_capital) : null;
  const pnlPct = pnl != null ? ratio(pnl, inst.initial_capital) * 100 : null;
  const tone = toneCls(pnl);
  const wr = s?.observedWinrate;
  const rr = targetRROf(inst);

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-caption text-muted-foreground">
            {inst.model_id.toUpperCase()} agent{rr != null && !final ? ` · target R/R ${rrText(rr)}` : ""}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={inst.executionState}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -3 }}
              transition={{ duration: 0.18 }}
              className="truncate text-body-sm font-medium"
            >
              {executionState(inst.executionState)}
            </motion.div>
          </AnimatePresence>
        </div>
        <Pill tone={st.tone}>{st.label}</Pill>
      </div>
      {st.hint && <p className="mt-2 text-caption text-muted-foreground">{st.hint}</p>}
      {!final && inst.dailyRiskHalted && (
        <p className="mt-2 text-caption text-warning">
          Daily loss limit reached: no new trades until the next UTC day{inst.dailyLimitResetsAt ? ` (${fmtTime(inst.dailyLimitResetsAt)} your time)` : ""}. Open trades are still managed.
        </p>
      )}
      {inst.blocked_reason && <p className="mt-2 text-caption text-warning">{inst.blocked_reason.replace(/_/g, " ")}</p>}
      {inst.last_error && <p className="mt-2 text-caption text-destructive">{inst.last_error}</p>}
      {!final && inst.status !== "stopping" && inst.entryRejection && <EntryCheck r={inst.entryRejection} trading={inst.openPositions > 0} />}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">{final ? "Returned to you (USDT)" : "Agent value (USDT)"}</div>
          {statement.isPending && !final ? <Skeleton className="mt-1 h-9 w-36" /> : <div className="text-display tabular-nums">{fmt(value)}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className="text-caption text-muted-foreground">Total PnL (USDT)</div>
          <div className={`text-h2 tabular-nums ${tone}`}>{fmt(pnl, 2, { sign: true })}</div>
          <div className={`text-caption tabular-nums ${tone}`}>{pnlPct == null ? "—" : `${pnlPct > 0 ? "+" : pnlPct < 0 ? "−" : ""}${Math.abs(pnlPct).toFixed(2)}% of ${fmt(inst.initial_capital, 0)} USDT`}</div>
        </div>
      </div>
      {!final && s && s.valuation.status !== "complete" && (
        <>
          {valuationNotes(s).messages.map((m) => (
            <p key={m} className="mt-1.5 text-caption text-warning">{m}</p>
          ))}
          {s.equity == null && <p className="mt-1.5 text-caption text-muted-foreground">Showing booked balance without open trades, not a final value.</p>}
        </>
      )}
      {statement.isError && <p className="mt-1.5 text-caption text-muted-foreground">Value unavailable. Retrying…</p>}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Cell label="Closed PnL (USDT)">
          <span className={toneCls(s?.realized.realized_net)}>{fmt(s?.realized.realized_net, 2, { sign: true })}</span>
        </Cell>
        <Cell label="Open PnL (USDT)">
          <span className={toneCls(s?.unrealizedNetEstimate)}>{fmt(s?.unrealizedNetEstimate, 2, { sign: true })}</span>
        </Cell>
        <Cell label={s ? `Win rate (${s.realized.closed_trades})` : "Win rate"}>{wr == null ? "—" : `${Number(wr).toFixed(0)}%`}</Cell>
      </dl>
      {!final && <Today inst={inst} />}

      {!final && <MoneySplit inst={inst} />}
    </Card>
  );
}

/** Where the agent's money sits right now, as one bar with a legend. Display only. */
function MoneySplit({ inst }: { inst: AgentInstance }) {
  const parts = [
    { label: "Free", value: inst.cash, cls: "bg-foreground/70" },
    { label: "In trades", value: add(inst.reserved, inst.exit_fee_reserved ?? "0"), cls: "bg-primary" },
    { label: "Held for funding", value: inst.funding_reserved ?? "0", cls: "bg-warning" },
  ].filter((x) => sign(x.value) > 0 || x.label !== "Held for funding");
  const total = parts.reduce((a, x) => add(a, x.value), "0");
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-caption text-muted-foreground">Where its money is (USDT)</span>
        <span className="flex items-center gap-2 text-caption text-muted-foreground">
          <TradeSlots open={inst.openPositions} max={maxOpenOf(inst)} scanning={inst.status === "active" && inst.executionState === "waiting_for_signal"} />
          {inst.openPositions} of {maxOpenOf(inst)} open
        </span>
      </div>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full bg-surface-raised">
        {sign(total) > 0 && parts.map((x) => <span key={x.label} className={x.cls} style={{ width: `${ratio(x.value, total) * 100}%` }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {parts.map((x) => (
          <span key={x.label} className="inline-flex items-center gap-1.5 text-caption">
            <span className={`size-2 rounded-full ${x.cls}`} />
            <span className="text-muted-foreground">{x.label}</span>
            <span className="tabular-nums">{fmt(x.value)}</span>
          </span>
        ))}
        {inst.last_tick_at && <span className="ml-auto text-caption text-muted-foreground">Updated {fmtAgo(inst.last_tick_at)}</span>}
      </div>
    </div>
  );
}

/** Today's entry quota as the API reports it (never counted from the trade list). Resets 00:00 UTC, shown in local time. */
function Today({ inst }: { inst: AgentInstance }) {
  if (inst.dailyEntryLimit == null) return null;
  return (
    <dl className="mt-3 grid grid-cols-3 gap-3">
      <Cell label="Trades today">
        {inst.entriesToday ?? "—"} / {inst.dailyEntryLimit}
      </Cell>
      <Cell label="Left today">{inst.remainingDailyEntries ?? "—"}</Cell>
      <Cell label="Resets at">
        {inst.dailyLimitResetsAt ? (
          <time dateTime={inst.dailyLimitResetsAt} title={fmtDateTime(inst.dailyLimitResetsAt)}>
            {fmtTime(inst.dailyLimitResetsAt)}
          </time>
        ) : (
          "—"
        )}
      </Cell>
    </dl>
  );
}

/** Why the last entry check didn't open a trade. Informational only: open trades aren't affected and the agent keeps checking by itself. */
function EntryCheck({ r, trading }: { r: EntryRejection; trading: boolean }) {
  const facts = entryRejectionFacts(r);
  const at = r.details?.checkedAt;
  return (
    <div className="mt-3 rounded-md bg-surface-raised p-3">
      <div className="flex items-center justify-between gap-2 text-caption text-muted-foreground">
        <span>Last entry check</span>
        {at && <time dateTime={at}>{fmtAgo(at)}</time>}
      </div>
      <div className="mt-0.5 text-body-sm font-medium">{entryRejectionText(r.code)}</div>
      {facts.length > 0 && <div className="mt-0.5 truncate text-caption text-muted-foreground tabular-nums">{facts.join(" · ")}</div>}
      <div className="mt-1 text-caption text-muted-foreground">{trading ? "Open trades aren't affected. " : ""}It keeps checking on its own.</div>
    </div>
  );
}

/** Previous / next with "Page x of y"; disabled at the ends and while a page loads. */
function Pager({ page, pages, total, busy, onPage }: { page: number; pages: number; total: number; busy: boolean; onPage: (p: number) => void }) {
  const go = (to: number) => {
    haptic.select();
    onPage(to);
  };
  return (
    <nav aria-label="Positions pages" className="mt-1 flex items-center justify-between gap-2">
      <IconButton label="Previous page" disabled={page <= 1 || busy} onClick={() => go(page - 1)}>
        <Icon icon={ArrowLeft01Icon} size={18} />
      </IconButton>
      <div className="text-center" aria-live="polite">
        <div className="text-label font-semibold tabular-nums">
          Page {page} of {pages}
        </div>
        <div className="text-caption text-muted-foreground tabular-nums">{total} positions</div>
      </div>
      <IconButton label="Next page" disabled={page >= pages || busy} onClick={() => go(page + 1)}>
        <Icon icon={ArrowRight01Icon} size={18} />
      </IconButton>
    </nav>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-caption text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-body-sm font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

const toneCls = (v: string | null | undefined) => (sign(v) > 0 ? "text-primary" : sign(v) < 0 ? "text-destructive" : "");

function Controls({ inst }: { inst: AgentInstance }) {
  const { patch, busy } = useInstanceControl(inst);
  const health = useHealth();
  const [confirmStop, setConfirmStop] = useState(false);
  const canEnter = inst.entriesEnabled && (health.data?.agentEngine.userActivationAvailable ?? true);

  if (INSTANCE_FINAL.has(inst.status))
    return (
      <Button as="a" href="/agents" variant="secondary" block className="mt-3">
        Start a new agent
      </Button>
    );
  if (inst.status === "stopping")
    return <div className="mt-3"><Notice tone="warn">Closing trades…</Notice></div>;

  return (
    <div className="mt-3 flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {inst.status === "active" ? (
          <Button variant="secondary" icon={<Icon icon={PauseIcon} size={18} />} loading={busy === "paused"} onClick={() => patch({ status: "paused" })}>
            Pause
          </Button>
        ) : (
          <Button icon={<Icon icon={PlayIcon} size={18} />} loading={busy === "active"} disabled={!canEnter} onClick={() => patch({ status: "active" })}>
            {inst.status === "paused" ? "Resume" : "Activate"}
          </Button>
        )}
        <Button variant="danger" icon={<Icon icon={StopIcon} size={18} />} onClick={() => setConfirmStop(true)}>
          Stop
        </Button>
      </div>
      {!canEnter && inst.status !== "active" && <p className="text-label font-normal text-muted-foreground">Trading paused platform-wide.</p>}

      <ConfirmDialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title={`Stop ${inst.name}?`}
        description={
          <>
            <p>
              Open trades close and funds return to your balance. This can&apos;t be undone.
            </p>
            {inst.status === "active" && <p>For a break, use Pause.</p>}
          </>
        }
        confirmLabel="Stop agent"
        cancelLabel="Keep running"
        busy={busy === "stopping"}
        onConfirm={async () => {
          if (await patch({ status: "stopping" })) setConfirmStop(false);
        }}
      />
    </div>
  );
}

function RenameSheet({ inst, open, onClose }: { inst: AgentInstance; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(inst.name);
  const { patch, busy } = useInstanceControl(inst);
  const valid = name.trim().length > 0 && name.trim().length <= 60 && name.trim() !== inst.name;
  return (
    <Sheet open={open} onClose={onClose} title="Rename agent">
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (valid && (await patch({ name: name.trim() }))) onClose();
        }}
      >
        <Field label="Name" error={name.trim().length > 60 ? "60 characters max" : null}>
          {(id) => <input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />}
        </Field>
        <Button type="submit" size="lg" block disabled={!valid} loading={busy === "name"}>
          Save name
        </Button>
      </form>
    </Sheet>
  );
}
