"use client";
import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown02Icon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import xeno from "@/assets/agents/XENO_robot_icon.svg";
import type { Trader } from "@/lib/api/types";
import { fmt, sign } from "@/lib/money";
import { useOpenDeposit } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

const KEY = "txai.welcomed.";

/**
 * Shown once per user on a new account. "Trading started" only when the server reports the agent active with entries
 * allowed; otherwise it says what's actually happening (getting ready, or a deposit is needed).
 */
export function WelcomeDialog({ t, userId, onTutorial }: { t: Trader; userId: string; onTutorial: () => void }) {
  const tutorialDone = t.onboarding.steps.find((s) => s.key === "tutorial_watched")?.complete ?? true;
  const [open, setOpen] = useState(() => {
    if (tutorialDone) return false;
    try {
      return !localStorage.getItem(KEY + userId);
    } catch {
      return false;
    }
  });
  const reduce = useReducedMotion();
  const openDeposit = useOpenDeposit();

  const started = t.status === "active" && !t.pauseReason && t.engine.entriesEnabled && t.migrationState === "ready";
  const needsDeposit = t.pauseReason === "minimum_capital";
  const trial = sign(t.trialPrincipalRemaining) > 0 ? fmt(t.trialPrincipalRemaining, 0) : null;

  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY + userId, "1");
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="items-center text-center">
        <div className="relative mx-auto grid size-28 place-items-center">
          {started && !reduce && (
            <>
              <motion.span className="absolute inset-0 rounded-full border-2 border-primary" animate={{ scale: [0.8, 1.35], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />
              <motion.span className="absolute inset-0 rounded-full border-2 border-primary" animate={{ scale: [0.8, 1.35], opacity: [0.7, 0] }} transition={{ duration: 1.8, delay: 0.9, repeat: Infinity, ease: "easeOut" }} />
            </>
          )}
          <motion.span
            className="hero-gradient grid size-24 place-items-center rounded-full ring-1 ring-white/10"
            initial={{ scale: 0.5, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, ease: [0.2, 0, 0, 1.3] }}
          >
            <Image src={xeno} alt="" width={56} height={56} />
          </motion.span>
        </div>

        <DialogTitle className="text-h1">{started ? "Trading started" : needsDeposit ? "Your agent is ready" : "Your agent is getting ready"}</DialogTitle>
        <DialogDescription>
          {started
            ? `Your agent is live${trial ? ` with a ${trial} USDT Trial fund` : ""}. It trades around the clock; every deposit adds to the same account.`
            : needsDeposit
              ? `Deposit at least ${fmt(t.minimumCapital, 0)} USDT and it starts trading by itself.`
              : "It starts on its own in a moment. Nothing to set up."}
        </DialogDescription>

        <div className="mt-1 flex w-full flex-col gap-2">
          {needsDeposit ? (
            <Button
              size="lg"
              block
              icon={<Icon icon={ArrowDown02Icon} size={18} />}
              onClick={() => {
                close();
                openDeposit();
              }}
            >
              Deposit
            </Button>
          ) : (
            <Button size="lg" block onClick={close}>
              See my agent
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            block
            icon={<Icon icon={PlayCircleIcon} size={18} />}
            onClick={() => {
              close();
              onTutorial();
            }}
          >
            How it works
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">Results aren&apos;t guaranteed. You can lose money.</p>
      </DialogContent>
    </Dialog>
  );
}
