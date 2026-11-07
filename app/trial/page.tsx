"use client";
import { GiftIcon } from "@hugeicons/core-free-icons";
import { t } from "@/lib/i18n";
import { useTrader } from "@/lib/queries";
import { trialGuide } from "@/lib/trader";
import { Icon } from "@/components/ui/icon";
import { Card, FlowHeader, Page, SectionTitle } from "@/components/ui/primitives";

/**
 * What the trial is and isn't, for anyone who wonders where "their" money went: free trades, never a balance. Opened from Home's
 * trial card and Profile. Reads even without the account's numbers (see trialGuide).
 */
export default function TrialPage() {
  const trader = useTrader();
  const g = trialGuide(trader.data);
  return (
    <Page nav={false}>
      <FlowHeader title={t("How the trial works")} />
      <Card hero className="mt-2 p-5">
        <span className="grid size-11 place-items-center rounded-full bg-white/12">
          <Icon icon={GiftIcon} size={22} />
        </span>
        <h2 className="mt-3 text-h1">{g.headline}</h2>
        <p className="mt-1 text-body-sm text-white/85">{g.lead}</p>
      </Card>

      <SectionTitle>{t("Step by step")}</SectionTitle>
      <Card className="p-4">
        <ol className="flex flex-col gap-4">
          {g.steps.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/12 text-label font-bold text-primary tabular-nums">{i + 1}</span>
              <div className="min-w-0">
                <h3 className="text-body-sm font-semibold">{s.title}</h3>
                <p className="mt-0.5 text-label font-normal text-muted-foreground">{s.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </Card>

      <SectionTitle>{t("Good to know")}</SectionTitle>
      <Card className="divide-y divide-border px-4">
        {g.faqs.map((f) => (
          <div key={f.q} className="py-3">
            <h3 className="text-body-sm font-semibold">{f.q}</h3>
            <p className="mt-0.5 text-label font-normal text-muted-foreground">{f.a}</p>
          </div>
        ))}
      </Card>
      <p className="mt-3 px-1 text-caption text-muted-foreground">{t("Results aren't guaranteed. Once you deposit, you can lose money.")}</p>
    </Page>
  );
}
