import { HugeiconsIcon, type HugeiconsIconProps } from "@hugeicons/react";

/** One stroke language for all app chrome (design.md §13.1): Hugeicons stroke-rounded, 1.5. */
export function Icon({ size = 20, strokeWidth = 1.5, ...rest }: HugeiconsIconProps) {
  return <HugeiconsIcon size={size} strokeWidth={strokeWidth} aria-hidden {...rest} />;
}
