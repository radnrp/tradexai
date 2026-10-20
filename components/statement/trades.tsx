"use client";
import { useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowLeft01Icon, ArrowRight01Icon, Calendar03Icon, CheckmarkCircle02Icon, Activity01Icon } from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import type { Range } from "@/lib/api/types";
import { qk, useStatement } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { PositionCard } from "@/components/trading/position-card";
import { Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Amount, EmptyState, ErrorState, ListSkeleton } from "@/components/ui/primitives";

const PER_PAGE = 5;
type Kind = "open" | "closed";

/** One page of positions from the server; open ones refresh while you watch. */
function usePositionPage(kind: Kind, page: number, range: Range, agent?: string) {
  return useQuery({
    queryKey: [...qk.positions(kind, agent, kind === "closed" ? range : undefined), "page", page],
    queryFn: () => API.positions({ status: kind, instanceId: agent, range: kind === "closed" ? range : undefined, page, limit: PER_PAGE }),
    placeholderData: keepPreviousData,
    refetchInterval: kind === "open" ? 15_000 : undefined,
  });
}

/** Open and closed trades, each on its own 5-per-page list. Remount (key) on range / agent change to reset the pages. */
export function Trades({ range, agent }: { range: Range; agent?: string }) {
  const [picked, setKind] = useState<Kind | null>(null);
  const [page, setPage] = useState({ open: 1, closed: 1 });
  const open = usePositionPage("open", page.open, range, agent);
  const closed = usePositionPage("closed", page.closed, range, agent);
  const st = useStatement(range, agent);
  const top = useRef<HTMLDivElement>(null);

  // land on open trades when there are any, else on closed ones
  const kind = picked ?? (open.data?.total ? "open" : "closed");
  const q = kind === "open" ? open : closed;
  const total = q.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  // the list shrank under us (trades closed while on a later page): fall back to the last page
  if (q.data && !q.isPlaceholderData && page[kind] > pages) setPage((p) => ({ ...p, [kind]: pages }));
  const go = (n: number) => {
    haptic.select();
    setPage((p) => ({ ...p, [kind]: n }));
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={top} className="mt-4 flex scroll-mt-4 flex-col gap-3">
      <Segmented
        layoutId="trades-kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "open", label: <Count icon={Activity01Icon} label="Open" n={open.data?.total} live /> },
          { value: "closed", label: <Count icon={CheckmarkCircle02Icon} label="Closed" n={closed.data?.total} /> },
        ]}
      />

      {st.data && total > 0 && (
        <div className="flex items-center justify-between rounded-md bg-surface px-3.5 py-2.5 text-body-sm">
          <span className="text-muted-foreground">{kind === "open" ? "Open result now" : "Closed result"}</span>
          <Amount value={kind === "open" ? st.data.unrealizedNetEstimate : st.data.realized.realized_net} signed colored unit="USDT" className="font-semibold" />
        </div>
      )}

      {q.isPending ? (
        <ListSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data.items.length ? (
        <EmptyState
          icon={<Icon icon={kind === "open" ? Activity01Icon : Calendar03Icon} size={28} />}
          title={kind === "open" ? "No open trades" : "No closed trades"}
        />
      ) : (
        <div className={`flex flex-col gap-2 transition-opacity ${q.isPlaceholderData ? "opacity-60" : ""}`}>
          {q.data.items.map((p) => (
            <PositionCard key={p.id} p={p} showAgent={!agent} />
          ))}
        </div>
      )}

      {pages > 1 && <Pager page={Math.min(page[kind], pages)} pages={pages} busy={q.isPlaceholderData} onGo={go} />}
    </div>
  );
}

function Count({ icon, label, n, live }: { icon: Parameters<typeof Icon>[0]["icon"]; label: string; n?: number; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon icon={icon} size={16} className={live && n ? "text-primary" : ""} />
      {label}
      {n != null && <span className="rounded-full bg-foreground/10 px-1.5 text-caption tabular-nums">{n}</span>}
    </span>
  );
}

function Pager({ page, pages, busy, onGo }: { page: number; pages: number; busy: boolean; onGo: (n: number) => void }) {
  const btn = "hit-area grid size-10 place-items-center rounded-full bg-surface-raised text-foreground transition-opacity disabled:opacity-30";
  return (
    <nav aria-label="Pages" className="mt-1 flex items-center justify-between gap-3">
      <button type="button" aria-label="Previous page" className={btn} disabled={busy || page <= 1} onClick={() => onGo(page - 1)}>
        <Icon icon={ArrowLeft01Icon} size={18} />
      </button>
      <span className="text-label text-muted-foreground tabular-nums" aria-live="polite">
        Page <span className="font-semibold text-foreground">{page}</span> of {pages}
      </span>
      <button type="button" aria-label="Next page" className={btn} disabled={busy || page >= pages} onClick={() => onGo(page + 1)}>
        <Icon icon={ArrowRight01Icon} size={18} />
      </button>
    </nav>
  );
}
