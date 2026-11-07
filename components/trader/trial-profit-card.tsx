"use client";
import { ArrowDown02Icon, LockIcon } from "@hugeicons/core-free-icons";
import { haptic } from "@/lib/telegram";
import { trialProfitText, type trialProfitLock } from "@/lib/trader";
import { t } from "@/lib/i18n";
import { useFundXeno } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Amount, Card } from "@/components/ui/primitives";

/**
 * Trial profit waiting for real deposits (GET /trader `trialProfitProtection`): how much, and what's left to deposit. It's already
 * in the account value, so it's never added to anything. `fund` shows the button that opens a new deposit with the missing amount
 * filled in; without it (another step, like a payment under way, comes first) the card only informs.
 */
export function TrialProfitCard({
  lock,
  fund,
  className = "",
}: {
  lock: NonNullable<ReturnType<typeof trialProfitLock>>;
  fund: boolean;
  className?: string;
}) {
  const fundXeno = useFundXeno();
  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-warning/12 text-warning">
          <Icon icon={LockIcon} size={20} />
        </span>
        <div className="min-w-0 flex-1 text-body-sm font-semibold">{t("Trial profit")}</div>
        <Amount value={lock.locked} unit="USDT" className="shrink-0 text-body-sm font-semibold" />
      </div>
      <p className="mt-2 text-caption text-muted-foreground tabular-nums">{trialProfitText(lock)}</p>
      {fund && (
        <Button
          size="lg"
          block
          className="mt-3"
          icon={<Icon icon={ArrowDown02Icon} size={18} />}
          onClick={() => {
            haptic.tap();
            fundXeno(lock.amount);
          }}
        >
          {t("Fund XENO")}
        </Button>
      )}
    </Card>
  );
}
