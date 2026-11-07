import { t } from "@/lib/i18n";
import { Amount } from "@/components/ui/primitives";

/** A P&L figure. Null means prices or funding are still pending: it says so, never zero and never a dash. */
export function PnlAmount({ value, unit, className = "", muted = "text-muted-foreground" }: { value: string | null | undefined; unit?: string; className?: string; muted?: string }) {
  if (value == null)
    return (
      <span className={`${muted} ${className}`} title={t("Waiting for prices or funding to settle")}>
        {t("Pending")}
      </span>
    );
  return <Amount value={value} unit={unit} signed colored className={className} />;
}
