"use client";
import { ArrowDown02Icon, ArrowUp02Icon, ChartLineData02Icon, GiftIcon, Wallet01Icon } from "@hugeicons/core-free-icons";
import type { Statement } from "@/lib/api/types";
import { fmt, sign } from "@/lib/money";
import { Icon } from "@/components/ui/icon";
import { Amount, Card } from "@/components/ui/primitives";
import { TINT, Tile } from "./tile";

/** How the balance changed in the period: one total, then the four things that moved it. */
export function Funding({ s }: { s: Statement }) {
  const f = s.financial;
  const up = sign(f.bookedChange) >= 0;
  // ledger basis: booked by entry time, so it can hold fees of trades still open; funding included when the server sends it
  const trading = f.tradingNetAfterFunding ?? f.tradingNet;
  const feeHint = sign(f.tradeFeesPaid) > 0 ? `After ${fmt(f.tradeFeesPaid)} ${s.asset} in fees` : null;
  const tradingHint = f.tradingNetAfterFunding != null ? (feeHint ? `${feeHint} and funding` : "Includes funding") : feeHint;
  return (
    <>
      <Card className="mt-4 flex items-center gap-3.5 p-4">
        <span className={`grid size-12 shrink-0 place-items-center rounded-full ${up ? TINT.green : TINT.red}`}>
          <Icon icon={Wallet01Icon} size={22} />
        </span>
        <div className="min-w-0">
          <div className="text-label text-muted-foreground">Balance change</div>
          <Amount value={f.bookedChange} signed colored unit={s.asset} className="text-h2" />
        </div>
      </Card>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Tile icon={ArrowDown02Icon} tint="green" label="Deposited">
          <Amount value={f.deposits} unit={s.asset} />
        </Tile>
        <Tile icon={ArrowUp02Icon} tint="blue" label="Withdrawn" hint={sign(f.withdrawalFees) > 0 ? `${fmt(f.withdrawalFees)} ${s.asset} in fees` : undefined}>
          <Amount value={f.withdrawals} unit={s.asset} />
        </Tile>
        <Tile icon={ChartLineData02Icon} tint="amber" label="From trading" hint={tradingHint ?? undefined}>
          <Amount value={trading} unit={s.asset} signed colored />
        </Tile>
        <Tile icon={GiftIcon} tint="gray" label="From invited friends">
          <Amount value={f.referralIncome} unit={s.asset} signed colored />
        </Tile>
      </div>
      <p className="mt-2 px-1 text-caption text-muted-foreground">
        Booked when each fee or result hit your balance, so it can include fees of trades still open. Overview counts trades by close time, so the two can differ.
      </p>
    </>
  );
}
