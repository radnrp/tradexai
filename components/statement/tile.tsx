import { Icon } from "@/components/ui/icon";

type IconSvg = Parameters<typeof Icon>[0]["icon"];

export const TINT = {
  green: "bg-primary/12 text-primary",
  red: "bg-destructive/12 text-destructive",
  blue: "bg-info/14 text-info",
  amber: "bg-warning/12 text-warning",
  gray: "bg-surface-raised text-muted-foreground",
} as const;

/** One number with a tinted icon on top; the statement tabs are built from these. */
export function Tile({ icon, tint, label, hint, children }: { icon: IconSvg; tint: keyof typeof TINT; label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-surface p-3.5">
      <span className={`grid size-9 place-items-center rounded-full ${TINT[tint]}`}>
        <Icon icon={icon} size={18} />
      </span>
      <div className="mt-3 truncate text-label text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-body font-semibold tabular-nums">{children}</div>
      {hint && <div className="mt-0.5 truncate text-caption text-muted-foreground">{hint}</div>}
    </div>
  );
}
