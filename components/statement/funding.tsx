"use client";
import { ArrowDown02Icon, ArrowUp02Icon, ChartLineData02Icon, GiftIcon, UserAdd01Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import type { Statement } from "@/lib/api/types";
import { add, fmt, sign } from "@/lib/money";
import { coverOf } from "@/lib/personal-pnl";
import { t } from "@/lib/i18n";
import { Icon } from "@/components/ui/icon";
import { Amount, Card } from "@/components/ui/primitives";
import { TINT, Tile } from "./tile";

/**
 * How the balance changed in the period: one total, then what moved it. The balance change is the actual ledger; "From trading"
 * is personal, so the Trial grant that went into covered losses gets its own tile and the tiles still add up.
 */
export function Funding({ s }: { s: Statement }) {
  const f = s.financial;
  const up = sign(f.bookedChange) >= 0;
  // ledger basis: booked by entry time, so it can hold fees of trades still open; funding included when the server sends it
  const trading = f.personalTradingNetAfterFunding ?? f.tradingNetAfterFunding ?? f.tradingNet;
  const granted = f.trialGrants != null && sign(f.trialGrants) !== 0;
  const used = coverOf(f.trialLossCovered);
  // only sent when non-zero; absent is zero
  const rewards = sign(f.referralBounties) !== 0;
  const feeValues = { fee: fmt(f.tradeFeesPaid), asset: s.asset };
  const hasFee = sign(f.tradeFeesPaid) > 0;
  const tradingHint =
    f.tradingNetAfterFunding != null
      ? hasFee
        ? t("After {fee} {asset} in fees and funding", feeValues)
        : t("Includes funding")
      : hasFee
        ? t("After {fee} {asset} in fees", feeValues)
        : null;
  return (
    <>
      <Card className="mt-4 flex items-center gap-3.5 p-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-full ${up ? TINT.green : TINT.red}`}>
          <Icon icon={Wallet01Icon} size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-label text-muted-foreground">{t("Balance change")}</div>
          <Amount value={f.bookedChange} signed colored unit={s.asset} className="text-h2" />
        </div>
      </Card>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Tile icon={ArrowDown02Icon} tint="green" label={t("Deposited")}>
          <Amount value={f.deposits} unit={s.asset} />
        </Tile>
        <Tile icon={ArrowUp02Icon} tint="blue" label={t("Withdrawn")} hint={sign(f.withdrawalFees) > 0 ? t("{n} {asset} in fees", { n: fmt(f.withdrawalFees), asset: s.asset }) : undefined}>
          <Amount value={f.withdrawals} unit={s.asset} />
        </Tile>
        <Tile icon={ChartLineData02Icon} tint="amber" label={t("From trading")} hint={tradingHint ?? undefined}>
          <Amount value={trading} unit={s.asset} signed colored />
        </Tile>
        {/* commission plus the one-time rewards; neither is a trading result */}
        <Tile icon={UserAdd01Icon} tint="gray" label={t("From invited friends")} hint={rewards ? t("Incl. {n} {asset} in rewards", { n: fmt(f.referralBounties!), asset: s.asset }) : undefined}>
          <Amount value={rewards ? add(f.referralIncome, f.referralBounties!) : f.referralIncome} unit={s.asset} signed colored />
        </Tile>
        {/* the sign-up Trial grant is its own line: not a deposit and not a trading result */}
        {granted && (
          <div className={used ? undefined : "col-span-2"}>
            <Tile icon={GiftIcon} tint="amber" label={t("Trial grant")} hint={t("For trial trades; not withdrawable")}>
              <Amount value={f.trialGrants!} unit={s.asset} />
            </Tile>
          </div>
        )}
        {/* the gift principal that went into covered losses: it lowered the Trial grant, it never added cash */}
        {used && (
          <div className={granted ? undefined : "col-span-2"}>
            <Tile icon={GiftIcon} tint="amber" label={t("Trial grant used")} hint={t("On covered losses; not cash")}>
              <Amount value={used} unit={s.asset} />
            </Tile>
          </div>
        )}
      </div>
    </>
  );
}
