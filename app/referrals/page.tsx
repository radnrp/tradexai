"use client";
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Award01Icon,
  Copy01Icon,
  GiftIcon,
  Invoice01Icon,
  MoneyReceive01Icon,
  NewTwitterIcon,
  PercentCircleIcon,
  TelegramIcon,
  Ticket01Icon,
  Tick02Icon,
  UserCheck01Icon,
  UserMultipleIcon,
} from "@hugeicons/core-free-icons";
import { type InfiniteData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import type { PageResult, ReferralEarning, ReferralEarningType, ReferralUser, Referrals } from "@/lib/api/types";
import { fmtAgo, fmtDateTime } from "@/lib/format";
import { cmp, fmt, trimZeros } from "@/lib/money";
import { bountyActive, earningNote, programActive, qualificationLabel, rewardState, sharePct, tierProgress } from "@/lib/partner";
import { qk, useReferrals } from "@/lib/queries";
import { haptic, openExternal } from "@/lib/telegram";
import { t as tr, type Key } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Chip, copyText, Segmented } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Amount, Card, dotCls, EmptyState, ErrorState, FlowHeader, ListSkeleton, Notice, Page, Pill, Skeleton } from "@/components/ui/primitives";

// Shared by the Telegram and X buttons; the invite link is appended by each network. No profit promises.
const inviteText = () =>
  tr("I'm trying TradeXai: an AI trading agent for your USDT, right inside Telegram. New accounts start with free trial trades, and every trade is shown live. Join with my invite:");

type IconSvg = Parameters<typeof Icon>[0]["icon"];

const nextPage = (last: PageResult<unknown>) => (last.page * last.limit < last.total ? last.page + 1 : undefined);

export default function ReferralsPage() {
  // refreshed every minute while open, and on return to the app
  const q = useReferrals(true);

  return (
    // reached from the Wallet tab, so it's a focused page with Back
    <Page nav={false}>
      <FlowHeader title={tr("Invite friends")} />
      {/* a failed refresh keeps the last figures with their time: never a guessed zero */}
      {q.data ? (
        <Content r={q.data} stale={q.isRefetchError} updatedAt={q.dataUpdatedAt} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      )}
    </Page>
  );
}

function Content({ r, stale, updatedAt }: { r: Referrals; stale: boolean; updatedAt: number }) {
  // tiers, counters and the reward only when the server says the program is on; otherwise the flat rate as before
  const active = programActive(r);
  useListsFollow(r);

  return (
    <div className="flex flex-col gap-3">
      {stale && (
        <Notice tone="warn" title={tr("Couldn't refresh")}>
          {tr("Showing figures from {ago}.", { ago: fmtAgo(updatedAt) })}
        </Notice>
      )}
      <Summary r={r} active={active} />
      <InviteCard r={r} />
      {active && r.tier && <TierCard r={r} tier={r.tier} />}
      {bountyActive(r) && r.bounty && <RewardCard r={r} bounty={r.bounty} />}
      <Lists active={active} />
    </div>
  );
}

/** New income or a newly qualified friend shows in the summary first; the lists follow it instead of polling on their own. */
function useListsFollow(r: Referrals) {
  const qc = useQueryClient();
  const sig = [r.totals?.totalEarned ?? r.earned, r.referredUsers, r.fundedReferrals, r.qualifiedReferrals, r.bounty?.paidCount].join("|");
  const prev = useRef(sig);
  useEffect(() => {
    if (prev.current === sig) return;
    prev.current = sig;
    qc.invalidateQueries({ queryKey: qk.referralUsers });
    qc.invalidateQueries({ queryKey: ["referrals", "earnings"] });
  }, [sig, qc]);
}

/** What you've earned (lifetime: not a balance or withdrawable), your tier and its rate. */
function Summary({ r, active }: { r: Referrals; active: boolean }) {
  const asset = r.asset ?? "USDT";
  const totals = active ? r.totals : undefined;
  return (
    <Card hero className="p-5">
      <div className="flex items-center gap-2 text-label text-white/75">
        <Icon icon={MoneyReceive01Icon} size={16} /> {tr(totals ? "Total earned" : "Earned from invites")}
      </div>
      <div dir="ltr" className="mt-1.5 flex items-baseline gap-1.5 rtl:justify-end">
        <span className="text-display tabular-nums">{fmt(totals?.totalEarned ?? r.earned)}</span>
        <span className="text-body font-medium text-white/70">{asset}</span>
      </div>
      {totals && (
        <p className="mt-1 text-body-sm font-semibold tabular-nums">
          {tr("Commission {c} · Rewards {r}", { c: fmt(totals.commission), r: fmt(totals.bounties) })}
        </p>
      )}
      <p className="mt-0.5 text-caption text-white/70">{tr("All time, credited to your balance as it's earned")}</p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {active && r.tier ? (
          <HeroBox icon={Award01Icon} value={r.tier.name} label={tr("Current tier")} />
        ) : (
          <HeroBox icon={UserMultipleIcon} value={r.referredUsers} label={tr(r.referredUsers === 1 ? "Friend joined" : "Friends joined")} />
        )}
        <HeroBox icon={PercentCircleIcon} value={sharePct(r.shareBps)} label={tr("of collected trading fees")} />
      </div>
    </Card>
  );
}

function HeroBox({ icon, value, label }: { icon: IconSvg; value: React.ReactNode; label: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white/10 p-3">
      <Icon icon={icon} size={18} className="text-white/80" />
      <div className="mt-1.5 truncate text-h2 tabular-nums">{value}</div>
      <div className="text-caption text-white/70">{label}</div>
    </div>
  );
}

function InviteCard({ r }: { r: Referrals }) {
  // the server's link exactly as given (straight into the Mini App); without one there's nothing to share, and none is built here
  const link = r.referralUrl ?? null;
  const shareTelegram = link && `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(inviteText())}`;
  const shareX = link && `https://x.com/intent/post?text=${encodeURIComponent(inviteText())}&url=${encodeURIComponent(link)}`;

  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-body-sm font-semibold">
        <Icon icon={Ticket01Icon} size={18} className="text-muted-foreground" />
        {tr(link ? "Your invite link" : "Your invite code")}
      </h2>
      <InviteTicket link={link} code={r.referralCode} />

      {shareTelegram && shareX && (
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button block icon={<Icon icon={TelegramIcon} size={18} />} onClick={() => openExternal(shareTelegram)}>
            {tr("Share in Telegram")}
          </Button>
          <Button variant="secondary" icon={<Icon icon={NewTwitterIcon} size={18} />} onClick={() => openExternal(shareX)}>
            {tr("Post")}
          </Button>
        </div>
      )}
      <p className="mt-3 text-caption text-muted-foreground">{tr("New users only. No extra cost to your friend.")}</p>
    </Card>
  );
}

/** The link as a tear-off ticket: tap anywhere on it to copy. The code part is what makes it yours, so it stands out. */
function InviteTicket({ link, code }: { link: string | null; code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);
  const text = link ?? code;
  const tail = encodeURIComponent(code);
  // the link's start, shown small above the code; a link that doesn't end in the code is shown whole
  const base = link?.endsWith(tail) ? link.replace("https://", "").slice(0, -tail.length) : null;

  return (
    <button
      type="button"
      onClick={() =>
        copyText(text).then(() => {
          haptic.success();
          setCopied(true);
        })
      }
      aria-label={tr(copied ? "Copied" : link ? "Copy invite link" : "Copy invite code")}
      className={`mt-3 flex w-full items-center gap-3 rounded-md border border-dashed p-3 text-start transition-colors ${copied ? "border-primary bg-primary/6" : "border-subtle bg-surface-raised active:bg-surface"}`}
    >
      <span className="min-w-0 flex-1">
        {base != null && <span dir="ltr" className="block truncate font-latin text-caption text-muted-foreground">{base}</span>}
        <span dir="ltr" className={`block truncate font-latin tracking-wide ${link && base == null ? "text-body-sm" : "text-h2"}`}>{link && base == null ? link : code}</span>
      </span>
      <span className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-label ${copied ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"}`}>
        <motion.span key={String(copied)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }} className="flex">
          <Icon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
        </motion.span>
        {tr(copied ? "Copied" : "Copy")}
      </span>
    </button>
  );
}

/** Registered, funded and qualified are three different counts; only qualified ones move the tier. */
function TierCard({ r, tier }: { r: Referrals; tier: NonNullable<Referrals["tier"]> }) {
  const progress = tierProgress(tier);
  const tiers = r.rules?.tiers ?? [];
  const minimum = fmt(r.rules?.minimumFunded ?? "50", 0);
  return (
    <Card className="p-4">
      <h2 className="flex items-center gap-2 text-body-sm font-semibold">
        <Icon icon={UserCheck01Icon} size={18} className="text-muted-foreground" />
        {tr("Your invites")}
      </h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Count label={tr("Registered")} value={r.referredUsers} />
        <Count label={tr("Funded")} value={r.fundedReferrals ?? 0} />
        <Count label={tr("Qualified")} value={r.qualifiedReferrals ?? tier.qualifiedCount} strong />
      </div>

      {progress ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3 text-label">
            <span className="font-semibold">
              {tier.name} · {sharePct(tier.commissionBps)}
            </span>
            <span className="text-muted-foreground">
              {progress.next.name} · {sharePct(progress.next.commissionBps)}
            </span>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-raised"
            role="progressbar"
            aria-label={tr("Progress to {name}", { name: progress.next.name })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress.ratio * 100)}
          >
            <motion.div className="h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <p className="mt-1.5 text-caption text-muted-foreground">
            {tr(progress.remaining === 1 ? "{n} more qualified friend to reach {next}" : "{n} more qualified friends to reach {next}", { n: progress.remaining, next: progress.next.name })}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-body-sm font-semibold">
          {tr("Top tier: {name} · {pct}", { name: tier.name, pct: sharePct(tier.commissionBps) })}
        </p>
      )}

      {tiers.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md bg-surface-raised px-3">
          {tiers.map((t) => {
            const current = t.id === tier.id;
            return (
              <li key={t.id} className={`flex min-h-10 items-center gap-3 text-body-sm ${current ? "font-semibold" : "text-muted-foreground"}`}>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                  {t.name}
                  {current && <Icon icon={Tick02Icon} size={14} className="shrink-0 text-primary" />}
                </span>
                <span className="text-label font-normal tabular-nums text-muted-foreground">
                  {tr("{range} qualified", { range: t.maximum == null ? `${t.minimum}+` : `${t.minimum}–${t.maximum}` })}
                </span>
                <span className="w-10 text-end tabular-nums">{sharePct(t.commissionBps)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 text-caption text-muted-foreground">
        {tr("A friend qualifies once their own deposits reach {min} USDT in total and a trade opened after that has closed and settled. The Trial grant doesn't count. A new rate applies to future fees; past earnings keep theirs.", { min: minimum })}
      </p>
    </Card>
  );
}

function Count({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-md bg-surface-raised px-2 py-2.5 text-center">
      <div className={`text-h2 tabular-nums ${strong ? "text-primary" : ""}`}>{value}</div>
      <div className="text-caption text-muted-foreground">{label}</div>
    </div>
  );
}

/** The one-time reward per qualified friend. The server pays it into the main balance; there's nothing to claim. */
function RewardCard({ r, bounty }: { r: Referrals; bounty: NonNullable<Referrals["bounty"]> }) {
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/12 text-warning">
        <Icon icon={GiftIcon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-semibold">{tr("{n} USDT for each qualified friend", { n: trimZeros(bounty.amount) })}</div>
        <p className="mt-0.5 text-caption text-muted-foreground">{tr("Once per friend, straight to your main balance. Nothing to claim.")}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-label text-muted-foreground tabular-nums">
            {tr("{n} paid · {amount} {asset}", { n: bounty.paidCount, amount: fmt(r.totals?.bounties ?? "0"), asset: r.asset ?? "USDT" })}
          </span>
          {/* qualified, reward not booked yet: on its way, not a failure and not a balance */}
          {bounty.qualifiedUnpaidCount > 0 && <Pill tone="pending">{tr("{n} awaiting reward", { n: bounty.qualifiedUnpaidCount })}</Pill>}
        </div>
      </div>
    </Card>
  );
}

function Lists({ active }: { active: boolean }) {
  const [tab, setTab] = useState<"friends" | "earnings">("friends");
  return (
    <section className="mt-4">
      <Segmented
        layoutId="ref-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "friends", label: tr("Friends") },
          { value: "earnings", label: tr("Earnings") },
        ]}
      />
      <div className="mt-3">{tab === "friends" ? <Friends active={active} /> : <Earnings />}</div>
    </section>
  );
}

function Friends({ active }: { active: boolean }) {
  const q = useInfiniteQuery({
    queryKey: qk.referralUsers,
    queryFn: ({ pageParam }) => API.referralUsers(pageParam),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (q.isPending) return <ListSkeleton rows={4} />;
  if (!q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!items.length) return <EmptyState icon={<Icon icon={UserMultipleIcon} size={28} />} title={tr("No friends yet")} body={tr("Friends who join with your link show up here.")} />;
  return (
    <>
      <Card className="divide-y divide-border px-4">
        {items.map((u) => (
          <FriendRow key={u.id} u={u} active={active} />
        ))}
      </Card>
      {q.hasNextPage && (
        <Button variant="secondary" block className="mt-4" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
          {tr("Load more")}
        </Button>
      )}
    </>
  );
}

function FriendRow({ u, active }: { u: ReferralUser; active: boolean }) {
  // before the program is active the status is only early progress, so it isn't shown as a promise
  const status = qualificationLabel(u.qualificationStatus);
  const reward = active ? rewardState(u) : null;
  return (
    <div className="flex min-h-16 items-center gap-3 py-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-body-sm font-semibold">{u.name.slice(0, 1).toUpperCase()}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-medium"><bdi>{u.name}</bdi></div>
        <div className="truncate text-label font-normal text-muted-foreground">{tr("Joined {ago}", { ago: fmtAgo(u.joinedAt) })}</div>
        {active && (
          <div className="mt-0.5 flex items-center gap-1.5 text-caption text-muted-foreground">
            <span className={`size-1.5 shrink-0 rounded-full ${dotCls[status.tone]}`} aria-hidden />
            <span className="truncate rtl:whitespace-normal">{status.label}</span>
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Amount value={u.totalEarned} unit="USDT" signed colored className="text-body-sm font-semibold" />
        {reward === "pending" && <Pill tone="pending">{tr("Awaiting reward")}</Pill>}
        {reward === "paid" && <span className="text-caption text-muted-foreground">{tr("Incl. {n} reward", { n: fmt(u.bounty) })}</span>}
      </div>
    </div>
  );
}

const EARNING_FILTERS: { value: ReferralEarningType; label: Key }[] = [
  { value: "all", label: "All" },
  { value: "commission", label: "Commission" },
  { value: "bounty", label: "Rewards" },
];

/** Booked income, newest first; each row at its own rate. A lifetime list, so no "today" figure is made from it. */
function Earnings() {
  const qc = useQueryClient();
  const [type, setType] = useState<ReferralEarningType>("all");
  const q = useInfiniteQuery({
    queryKey: qk.referralEarnings(type),
    queryFn: ({ pageParam }) => API.referralEarnings(pageParam, type),
    initialPageParam: 1,
    getNextPageParam: nextPage,
  });
  // friends' names from the Friends tab when it's loaded; a row without one simply has none
  const friends = qc.getQueryData<InfiniteData<PageResult<ReferralUser>>>(qk.referralUsers);
  const names = new Map(friends?.pages.flatMap((p) => p.items.map((u) => [u.id, u.name] as const)) ?? []);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <div className="flex gap-2">
        {EARNING_FILTERS.map((f) => (
          <Chip key={f.value} active={type === f.value} onClick={() => setType(f.value)}>
            {tr(f.label)}
          </Chip>
        ))}
      </div>
      <div className="mt-3">
        {q.isPending ? (
          <ListSkeleton rows={4} />
        ) : !q.data ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : items.length ? (
          <>
            <Card className="divide-y divide-border px-4">
              {items.map((e) => (
                <EarningRow key={e.id} e={e} name={e.referredUserId ? names.get(e.referredUserId) : undefined} />
              ))}
            </Card>
            {q.hasNextPage && (
              <Button variant="secondary" block className="mt-4" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {tr("Load more")}
              </Button>
            )}
          </>
        ) : (
          <EmptyState icon={<Icon icon={MoneyReceive01Icon} size={28} />} title={tr("No earnings yet")} body={tr("Commission and rewards show up here once they're booked.")} />
        )}
      </div>
    </>
  );
}

function EarningRow({ e, name }: { e: ReferralEarning; name?: string }) {
  const bounty = e.type === "bounty";
  const note = earningNote(e);
  return (
    <div className="flex min-h-16 items-center gap-3 py-3">
      <span className={`grid size-10 shrink-0 place-items-center rounded-full ${bounty ? "bg-warning/12 text-warning" : "bg-surface-raised text-foreground"}`}>
        <Icon icon={bounty ? GiftIcon : Invoice01Icon} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-body-sm font-medium">{tr(bounty ? "Referral reward" : "Fee commission")}</div>
        <div className="truncate text-label font-normal text-muted-foreground">
          {fmtDateTime(e.createdAt)}
          {name ? ` · ${name}` : ""}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {/* a share of a small fee can be under a cent */}
        <Amount value={e.amount} dp={cmp(e.amount, "0.01") < 0 ? 4 : 2} unit={e.asset} signed colored className="text-body-sm font-semibold" />
        {note && <span className="text-caption text-muted-foreground">{note}</span>}
      </div>
    </div>
  );
}
