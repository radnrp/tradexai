"use client";
import Image from "next/image";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowDown02Icon, PlayCircleIcon } from "@hugeicons/core-free-icons";
import xeno from "@/assets/agents/XENO_robot_icon.svg";
import type { Trader } from "@/lib/api/types";
import { fmt } from "@/lib/money";
import { t as tr } from "@/lib/i18n";
import { useFundXeno } from "@/components/deposit/deposit-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";

const KEY = "txai.welcomed.";

/**
 * Shown once per user on a new account. "Trading started" only when the server reports the agent active with entries
 * allowed and a trial that isn't still waiting for its first entry; otherwise it says what's actually happening (the trial is
 * ready, getting ready, or a deposit is needed). The trial reads as free trades, never as money received.
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
  const fundXeno = useFundXeno();

  const started = t.status === "active" && !t.pauseReason && t.engine.entriesEnabled && t.migrationState === "ready";
  const needsDeposit = t.pauseReason === "minimum_capital";
  // the Trial is a number of entries, not a time span
  const trialTrades = t.trial && (t.trial.status === "ready" || t.trial.status === "active") ? t.trial.limit : null;

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

        <DialogTitle className="text-h1">{started ? tr(t.trial?.status === "ready" ? "Your XENO trial is ready" : "Trading started") : tr(needsDeposit ? "Your agent is ready" : "Your agent is getting ready")}</DialogTitle>
        <DialogDescription>
          {started
            ? trialTrades
              ? tr("Your free trial includes up to {n} trades, no deposit needed. XENO trades with a Trial grant, which isn't your money and can't be withdrawn.", { n: trialTrades })
              : tr("Your agent is live. It trades around the clock; every deposit adds to the same account.")
            : needsDeposit
              ? tr("Deposit at least {n} USDT and it starts trading by itself.", { n: fmt(t.minimumCapital, 0) })
              : tr("It starts on its own in a moment. Nothing to set up.")}
        </DialogDescription>

        <div className="mt-1 flex w-full flex-col gap-2">
          {needsDeposit ? (
            <Button
              size="lg"
              block
              icon={<Icon icon={ArrowDown02Icon} size={18} />}
              onClick={() => {
                close();
                fundXeno();
              }}
            >
              {tr("Deposit")}
            </Button>
          ) : (
            <Button size="lg" block onClick={close}>
              {tr("See my agent")}
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
            {tr("How it works")}
          </Button>
        </div>
        <p className="text-caption text-muted-foreground">{tr("Results aren't guaranteed. You can lose money.")}</p>
      </DialogContent>
    </Dialog>
  );
}
