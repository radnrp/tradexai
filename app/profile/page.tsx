"use client";
import Link from "next/link";
import { Activity01Icon, ArrowRight01Icon, GiftIcon, HelpCircleIcon, Invoice03Icon, Robot01Icon, StarIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { telegramUser } from "@/lib/api/session";
import { getLang, t, type Key, type Lang } from "@/lib/i18n";
import { useLanguage } from "@/components/shell/language";
import { Segmented } from "@/components/ui/controls";
import { useSession } from "@/components/shell/boot-gate";
import { Wordmark } from "@/components/shell/logo";
import { Icon } from "@/components/ui/icon";
import { Card, FlowHeader, Page, Row } from "@/components/ui/primitives";

const LINKS = [
  { href: "/agents", label: "Agent", icon: Robot01Icon },
  { href: "/leaderboard", label: "Community activity", icon: Activity01Icon },
  { href: "/activity", label: "Activity", icon: Invoice03Icon },
  { href: "/wallet", label: "Wallet", icon: Wallet01Icon },
  { href: "/referrals", label: "Invite friends", icon: GiftIcon },
  { href: "/trial", label: "How the trial works", icon: HelpCircleIcon },
  { href: "/feedback", label: "Feedback", icon: StarIcon },
] satisfies { href: string; label: Key; icon: unknown }[];

export default function ProfilePage() {
  const { user } = useSession();
  const tgUser = telegramUser();
  const { choose } = useLanguage();

  return (
    <Page nav={false}>
      <FlowHeader title={t("Profile")} />
      <div className="flex flex-col items-center pb-6 pt-4 text-center">
        {tgUser?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tgUser.photo_url} alt="" className="size-18 rounded-full object-cover" />
        ) : (
          <span className="grid size-18 place-items-center rounded-full bg-surface-raised text-h1">{user.name.slice(0, 1).toUpperCase()}</span>
        )}
        <h2 dir="auto" className="mt-4 text-h1">{user.name}</h2>
        {tgUser?.username && <p dir="ltr" className="mt-0.5 text-body-sm text-muted-foreground">@{tgUser.username}</p>}
      </div>

      <Card className="divide-y divide-border px-4 py-1">
        <Row label={t("Telegram ID")}><span dir="ltr" className="font-latin">{user.telegram_id}</span></Row>
        <Row label={t("Account")}>{user.status === "active" ? t("Active") : user.status}</Row>
        <Row label={t("Referral code")}><span dir="ltr" className="font-latin">{user.referral_code}</span></Row>
      </Card>

      <Card className="mt-3 p-4">
        <div className="mb-2 text-label text-muted-foreground">{t("Language")}</div>
        <Segmented<Lang>
          layoutId="language"
          value={getLang()}
          onChange={choose}
          options={[
            { value: "en", label: "English" },
            { value: "fa", label: <span lang="fa">فارسی</span> },
          ]}
        />
      </Card>

      <Card className="mt-3 p-1.5">
        {LINKS.map(({ href, label, icon }) => (
          <Link key={href} href={href} className="flex min-h-14 items-center gap-3 rounded-md px-2.5 py-2 active:bg-surface-raised">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised">
              <Icon icon={icon} size={18} />
            </span>
            <span className="flex-1 text-body-sm font-medium">{t(label)}</span>
            <Icon icon={ArrowRight01Icon} size={18} className="rtl:-scale-x-100 text-muted-foreground" />
          </Link>
        ))}
      </Card>

      <div className="mt-10 flex items-center justify-center gap-2 text-label font-normal text-muted-foreground">
        <Wordmark height={20} />
      </div>
    </Page>
  );
}
