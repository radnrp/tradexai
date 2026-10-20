"use client";
import Image from "next/image";
import { motion } from "motion/react";
import mark from "@/assets/logo-gradient.svg";
import wordmark from "@/assets/logo-typo-white.svg";

/** The TradeXai mark; `size` is its width. It breathes gently while signing in. */
export function Logo({ size = 40, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <motion.span
      className="inline-flex shrink-0"
      animate={animated ? { scale: [1, 1.06, 1], opacity: [1, 0.75, 1] } : undefined}
      transition={animated ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
    >
      <Image src={mark} alt="TradeXai" width={size} height={Math.round((size * mark.height) / mark.width)} priority={animated} />
    </motion.span>
  );
}

/** Mark + "TradeXai" lettering, for places that show the name. `height` in px. */
export function Wordmark({ height = 20 }: { height?: number }) {
  return <Image src={wordmark} alt="TradeXai" height={height} width={Math.round((height * wordmark.width) / wordmark.height)} />;
}
