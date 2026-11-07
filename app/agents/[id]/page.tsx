"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery, type UseQueryResult } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft01Icon, ArrowRight01Icon, Invoice03Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { AgentInstance, Statement } from "@/lib/api/types";
import { fmtTime } from "@/lib/format";
import { executionState, INSTANCE_FINAL, instanceStatus } from "@/lib/labels";
import { pollUntil, qk, useLedgerSync, useTrader } from "@/lib/queries";
import { valuationNotes } from "@/lib/valuation";
import { haptic } from "@/lib/telegram";
import { maxOpenOf, rrText, targetRROf } from "@/lib/agent-info";
import { fmt, ratio, sub } from "@/lib/money";
import { t } from "@/lib/i18n";
import { serverText } from "@/lib/i18n/server-text";
import { Cell, EntryCheck, MoneySplit, toneCls, useRename } from "@/components/agents/shared";
import { PositionCard } from "@/components/trading/position-card";
import { Button, IconButton } from "@/components/ui/button";
import { Field, inputCls, Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Card, EmptyState, ErrorState, FlowHeader, ListSkeleton, Notice, Page, Pill, SectionTitle, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";

const PAGE_SIZE = 5;

/** An agent by id. The permanent XENO account lives on /agents; this page is for the history of earlier agents. */
export default function AgentDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const trader = useTrader();
  const permanent = trader.data?.instanceId === id;
  const q = useQuery({ queryKey: qk.instance(id), queryFn: () => API.instance(id), refetchInterval: pollUntil(INSTANCE_FINAL, 12_000), enabled: !permanent });
  useEffect(() => {
    if (permanent) router.replace("/agents");
  }, [permanent, router]);

  if (q.isPending || permanent)
    return (
      <Page nav={false}>
        <FlowHeader title={t("Agent")} />
        <Skeleton className="mt-3 h-72 rounded-lg" />
        <Skeleton className="mt-4 h-60 rounded-lg" />
      </Page>
    );
  if (q.isError)
    return (
      <Page nav={false}>
        <FlowHeader title={t("Agent")} />
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
            <IconButton label={t("Rename agent")} onClick={() => setRenaming(true)}>
              <Icon icon={PencilEdit02Icon} size={18} />
            </IconButton>
          )
        }
      />

      <AccountCard inst={inst} statement={statement} />
      {inst.status === "stopping" && (
        <div className="mt-3">
          <Notice tone="warn">{t("Closing trades. Settled funds move to your account.")}</Notice>
        </div>
      )}

      <div ref={listTop} className="scroll-mt-2" aria-hidden />
      <SectionTitle href="/statements" linkLabel={t("Statement")}>
        {t("Positions")}
      </SectionTitle>
      <Segmented
        layoutId="pos-tab"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setPage(1);
        }}
        options={[
          { value: "open", label: t("Open ({n})", { n: inst.openPositions }) },
          { value: "closed", label: t("History") },
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
            title={tab === "open" ? t("No open positions") : t("No closed positions yet")}
            body={
              tab === "open" && !final
                ? t("It waits for a setup that passes its risk checks, so a trade may not open right away. Up to {n} can be open at once, each in a different coin.", { n: maxOpenOf(inst) })
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
            {rr != null && !final ? t("Earlier agent · target R/R {rr}", { rr: rrText(rr) }) : t("Earlier agent")}
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
          {inst.dailyLimitResetsAt
            ? t("Daily loss limit reached: no new trades until the next UTC day ({time} your time). Open trades are still managed.", { time: fmtTime(inst.dailyLimitResetsAt) })
            : t("Daily loss limit reached: no new trades until the next UTC day. Open trades are still managed.")}
        </p>
      )}
      {inst.blocked_reason && <p className="mt-2 text-caption text-warning">{inst.blocked_reason.replace(/_/g, " ")}</p>}
      {inst.last_error && <p className="mt-2 text-caption text-destructive [unicode-bidi:plaintext]">{serverText(inst.last_error)}</p>}
      {!final && inst.status !== "stopping" && inst.entryRejection && <EntryCheck r={inst.entryRejection} trading={inst.openPositions > 0} />}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-caption text-muted-foreground">{final ? t("Moved to your account (USDT)") : t("Agent value (USDT)")}</div>
          {statement.isPending && !final ? <Skeleton className="mt-1 h-9 w-36" /> : <div className="text-display tabular-nums"><bdi>{fmt(value)}</bdi></div>}
        </div>
        <div className="shrink-0 text-end">
          <div className="text-caption text-muted-foreground">{t("Total PnL (USDT)")}</div>
          <div className={`text-h2 tabular-nums ${tone}`}><bdi>{fmt(pnl, 2, { sign: true })}</bdi></div>
          <div className={`text-caption tabular-nums ${tone}`}>{pnlPct == null ? "—" : t("{pct} of {cap} USDT", { pct: `${pnlPct > 0 ? "+" : pnlPct < 0 ? "−" : ""}${Math.abs(pnlPct).toFixed(2)}%`, cap: fmt(inst.initial_capital, 0) })}</div>
        </div>
      </div>
      {!final && s && s.valuation.status !== "complete" && (
        <>
          {valuationNotes(s).messages.map((m) => (
            <p key={m} className="mt-1.5 text-caption text-warning">{m}</p>
          ))}
          {s.equity == null && <p className="mt-1.5 text-caption text-muted-foreground">{t("Showing booked balance without open trades, not a final value.")}</p>}
        </>
      )}
      {statement.isError && <p className="mt-1.5 text-caption text-muted-foreground">{t("Value unavailable. Retrying…")}</p>}

      <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Cell label={t("Closed PnL (USDT)")}>
          <span className={toneCls(s?.realized.realized_net)}>{fmt(s?.realized.realized_net, 2, { sign: true })}</span>
        </Cell>
        <Cell label={t("Open PnL (USDT)")}>
          <span className={toneCls(s?.unrealizedNetEstimate)}>{fmt(s?.unrealizedNetEstimate, 2, { sign: true })}</span>
        </Cell>
        <Cell label={s ? t("Win rate ({n})", { n: s.realized.closed_trades }) : t("Win rate")}>{wr == null ? "—" : `${Number(wr).toFixed(0)}%`}</Cell>
      </dl>

      {!final && <MoneySplit inst={inst} />}
    </Card>
  );
}

/** Previous / next with "Page x of y"; disabled at the ends and while a page loads. */
function Pager({ page, pages, total, busy, onPage }: { page: number; pages: number; total: number; busy: boolean; onPage: (p: number) => void }) {
  const go = (to: number) => {
    haptic.select();
    onPage(to);
  };
  return (
    <nav aria-label={t("Positions pages")} className="mt-1 flex items-center justify-between gap-2">
      <IconButton label={t("Previous page")} disabled={page <= 1 || busy} onClick={() => go(page - 1)}>
        <Icon icon={ArrowLeft01Icon} size={18} className="rtl:-scale-x-100" />
      </IconButton>
      <div className="text-center" aria-live="polite">
        <div className="text-label font-semibold tabular-nums">
          {t("Page {page} of {pages}", { page, pages })}
        </div>
        <div className="text-caption text-muted-foreground tabular-nums">{t("{n} positions", { n: total })}</div>
      </div>
      <IconButton label={t("Next page")} disabled={page >= pages || busy} onClick={() => go(page + 1)}>
        <Icon icon={ArrowRight01Icon} size={18} className="rtl:-scale-x-100" />
      </IconButton>
    </nav>
  );
}

function RenameSheet({ inst, open, onClose }: { inst: AgentInstance; open: boolean; onClose: () => void }) {
  const [name, setName] = useState(inst.name);
  const { rename, busy } = useRename(inst);
  const valid = name.trim().length > 0 && name.trim().length <= 60 && name.trim() !== inst.name;
  return (
    <Sheet open={open} onClose={onClose} title={t("Rename agent")}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (valid && (await rename(name.trim()))) onClose();
        }}
      >
        <Field label={t("Name")} error={name.trim().length > 60 ? t("60 characters max") : null}>
          {(id) => <input id={id} dir="auto" autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />}
        </Field>
        <Button type="submit" size="lg" block disabled={!valid} loading={busy}>
          {t("Save name")}
        </Button>
      </form>
    </Sheet>
  );
}
