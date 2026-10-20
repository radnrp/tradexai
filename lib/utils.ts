import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the custom type scale, otherwise `text-h1` would be dropped as a color.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["display", "h1", "h2", "body", "body-sm", "label", "caption", "button"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
