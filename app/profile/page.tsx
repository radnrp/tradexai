"use client";
import Link from "next/link";
import { ArrowRight01Icon, GiftIcon, Invoice03Icon, Robot01Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { telegramUser } from "@/lib/api/session";
import { useSession } from "@/components/shell/boot-gate";
import { Wordmark } from "@/components/shell/logo";
import { Icon } from "@/components/ui/icon";
import { Card, FlowHeader, Page, Row } from "@/components/ui/primitives";

const LINKS = [
  { href: "/agents/mine", label: "My agents", icon: Robot01Icon },
  { href: "/activity", label: "Activity", icon: Invoice03Icon },
  { href: "/wallet", label: "Wallet", icon: Wallet01Icon },
  { href: "/referrals", label: "Invite friends", icon: GiftIcon },
];

export default function ProfilePage() {
  const { user } = useSession();
  const tgUser = telegramUser();

  return (
    <Page nav={false}>
      <FlowHeader title="Profile" />
      <div className="flex flex-col items-center pb-6 pt-4 text-center">
        {tgUser?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tgUser.photo_url} alt="" className="size-18 rounded-full object-cover" />
        ) : (
          <span className="grid size-18 place-items-center rounded-full bg-surface-raised text-h1">{user.name.slice(0, 1).toUpperCase()}</span>
        )}
        <h2 className="mt-4 text-h1">{user.name}</h2>
        {tgUser?.username && <p className="mt-0.5 text-body-sm text-muted-foreground">@{tgUser.username}</p>}
      </div>

      <Card className="divide-y divide-border px-4 py-1">
        <Row label="Telegram ID">{user.telegram_id}</Row>
        <Row label="Account">{user.status === "active" ? "Active" : user.status}</Row>
        <Row label="Referral code">{user.referral_code}</Row>
      </Card>

      <Card className="mt-3 p-1.5">
        {LINKS.map(({ href, label, icon }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-3 rounded-md px-2.5 py-2 active:bg-surface-raised">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised">
              <Icon icon={icon} size={18} />
            </span>
            <span className="flex-1 text-body-sm font-medium">{label}</span>
            <Icon icon={ArrowRight01Icon} size={18} className="text-muted-foreground" />
          </Link>
        ))}
      </Card>

      <div className="mt-10 flex items-center justify-center gap-2 text-label font-normal text-muted-foreground">
        <Wordmark height={20} />
      </div>
    </Page>
  );
}
