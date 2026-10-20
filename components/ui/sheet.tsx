"use client";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "./drawer";
import { Icon } from "./icon";

/** Bottom sheet (L2): drag down, tap outside or Esc to close. Built on the shadcn Drawer. */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  icon,
  top,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Leading badge that says at a glance what this sheet is for. */
  icon?: React.ReactNode;
  /** Pinned above the scrolling body, for an action that should be the first thing in reach. */
  top?: React.ReactNode;
  /** Pinned under the scrolling body, so the main action never scrolls out of view. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent aria-describedby={undefined}>
        <div className="flex items-center gap-3 px-5 pb-4 pt-3">
          {icon}
          <div className="min-w-0 flex-1">
            <DrawerTitle className="truncate">{title}</DrawerTitle>
            {subtitle && <p className="truncate text-label font-normal text-muted-foreground">{subtitle}</p>}
          </div>
          <DrawerClose aria-label="Close" className="hit-area grid size-9 shrink-0 place-items-center rounded-full bg-surface-raised text-muted-foreground">
            <Icon icon={Cancel01Icon} size={18} />
          </DrawerClose>
        </div>
        {top && <div className="shrink-0 px-5 pb-3">{top}</div>}
        <div className={`overflow-y-auto px-5 ${footer ? "pb-4" : "pb-6"}`}>{children}</div>
        {footer && <div className="shrink-0 border-t px-5 pb-4 pt-3">{footer}</div>}
      </DrawerContent>
    </Drawer>
  );
}
