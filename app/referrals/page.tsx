"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Copy01Icon, MoneyReceive01Icon, NewTwitterIcon, PercentCircleIcon, TelegramIcon, Ticket01Icon, Tick02Icon, UserMultipleIcon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import { BOT_USERNAME, MINI_APP_SHORT_NAME } from "@/lib/env";
import { fmtAgo } from "@/lib/format";
import { qk, useReferrals } from "@/lib/queries";
import { fmt } from "@/lib/money";
import { haptic, openExternal } from "@/lib/telegram";
import { Button } from "@/components/ui/button";
import { copyText } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Amount, Card, EmptyState, ErrorState, FlowHeader, ListSkeleton, Page, Pill, Skeleton } from "@/components/ui/primitives";

// Shared by the Telegram and X buttons; the invite link is appended by each network. No profit promises.
const INVITE_TEXT =
  "I'm trying TradeXai: an AI trading agent for your USDT, right inside Telegram. New accounts start with a Trial fund, and every trade is shown live. Join with my invite:";

export default function ReferralsPage() {
  const q = useReferrals();

  return (
    // reached from the Wallet tab, so it's a focused page with Back
    <Page nav={false}>
      <FlowHeader title="Invite friends" />
      {q.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-36 rounded-lg" />
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Content code={q.data.referralCode} users={q.data.referredUsers} earned={q.data.earned} shareBps={q.data.shareBps} />
      )}
    </Page>
  );
}

function Content({ code, users, earned, shareBps }: { code: string; users: number; earned: string; shareBps: number }) {
  // start_param must be exactly the referral code — no prefix
  const link = BOT_USERNAME && MINI_APP_SHORT_NAME ? `https://t.me/${BOT_USERNAME}/app?startapp=${encodeURIComponent(code)}` : null;
  const percent = shareBps / 100;
  const shareTelegram = link && `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(INVITE_TEXT)}`;
  const shareX = link && `https://x.com/intent/post?text=${encodeURIComponent(INVITE_TEXT)}&url=${encodeURIComponent(link)}`;

  return (
    <div className="flex flex-col gap-3">
      {/* results first: what you've earned and from how many friends */}
      <Card hero className="p-5">
        <div className="flex items-center gap-2 text-label text-white/75">
          <Icon icon={MoneyReceive01Icon} size={16} /> Earned from invites
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-display tabular-nums">{fmt(earned)}</span>
          <span className="text-body font-medium text-white/70">USDT</span>
        </div>
        <p className="mt-1 text-caption text-white/70">Auto-credited to your balance</p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white/10 p-3">
            <Icon icon={UserMultipleIcon} size={18} className="text-white/80" />
            <div className="mt-1.5 text-h2 tabular-nums">{users}</div>
            <div className="text-caption text-white/70">{users === 1 ? "Friend joined" : "Friends joined"}</div>
          </div>
          <div className="rounded-md bg-white/10 p-3">
            <Icon icon={PercentCircleIcon} size={18} className="text-white/80" />
            <div className="mt-1.5 text-h2 tabular-nums">{percent}%</div>
            <div className="text-caption text-white/70">of their trade fees</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="flex items-center gap-2 text-body-sm font-semibold">
          <Icon icon={Ticket01Icon} size={18} className="text-muted-foreground" />
          {link ? "Your invite link" : "Your invite code"}
        </h2>
        <InviteTicket link={link} code={code} />

        {shareTelegram && shareX && (
          <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
            <Button block icon={<Icon icon={TelegramIcon} size={18} />} onClick={() => openExternal(shareTelegram)}>
              Share in Telegram
            </Button>
            <Button variant="secondary" icon={<Icon icon={NewTwitterIcon} size={18} />} onClick={() => openExternal(shareX)}>
              Post
            </Button>
          </div>
        )}
        <p className="mt-3 text-caption text-muted-foreground">New users only. No extra cost to your friend.</p>
      </Card>

      <RecentReferrals />
    </div>
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
  const base = link ? link.replace("https://", "").slice(0, -encodeURIComponent(code).length) : "";

  return (
    <button
      type="button"
      onClick={() =>
        copyText(text).then(() => {
          haptic.success();
          setCopied(true);
        })
      }
      aria-label={copied ? "Copied" : `Copy ${link ? "invite link" : "invite code"}`}
      className={`mt-3 flex w-full items-center gap-3 rounded-md border border-dashed p-3 text-left transition-colors ${copied ? "border-primary bg-primary/6" : "border-subtle bg-surface-raised active:bg-surface"}`}
    >
      <span className="min-w-0 flex-1">
        {link && <span className="block truncate text-caption text-muted-foreground">{base}</span>}
        <span className="block truncate text-h2 tracking-wide">{code}</span>
      </span>
      <span className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-label ${copied ? "bg-primary text-primary-foreground" : "bg-surface text-foreground"}`}>
        <motion.span key={String(copied)} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }} className="flex">
          <Icon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
        </motion.span>
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}

function RecentReferrals() {
  const q = useQuery({ queryKey: qk.recentReferrals, queryFn: () => API.recentReferrals(15) });
  return (
    <section className="mt-5">
      <h2 className="mb-3 px-1 text-h2">Recent referrals</h2>
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.data.length ? (
        <Card className="divide-y divide-border px-4">
          {q.data.map((r) => (
            <div key={r.id} className="flex min-h-16 items-center gap-3 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-raised text-body-sm font-semibold">{r.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-body-sm font-medium">{r.name}</div>
                <div className="text-label font-normal text-muted-foreground">Joined {fmtAgo(r.joined_at)}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <Amount value={r.earned} unit="USDT" signed colored className="text-body-sm font-semibold" />
                <Pill tone={r.active ? "ok" : "idle"} live={false}>
                  {r.active ? "Active" : "Inactive"}
                </Pill>
              </div>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<Icon icon={UserMultipleIcon} size={28} />}
          title="No friends yet"
        />
      )}
    </section>
  );
}
