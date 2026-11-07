"use client";
import { useQuery } from "@tanstack/react-query";
import { API } from "@/lib/api/client";
import type { Trader } from "@/lib/api/types";
import { fmtTime } from "@/lib/format";
import { t as tr } from "@/lib/i18n";
import { executionState } from "@/lib/labels";
import { qk } from "@/lib/queries";
import { type OrbMode, traderState, tradingSource, trialCard } from "@/lib/trader";

// the plain "working" states, where the engine's own step ("Entry held back by risk rules") says more
const GENERIC = new Set(["scanning", "managing"]);
const ROUTINE_STEPS = new Set(["waiting_for_signal", "position_open"]);
const TRIAL_STOPS = new Set(["trial_draining", "trial_done", "real_funding"]);

/**
 * The agent's state for Home and the Agent page alike: GET /trader's priority order, plus what only the permanent
 * instance knows (the daily loss stop and the engine's current step). One source, so the two screens never disagree.
 */
export function useAgentStatus(t: Trader) {
  const inst = useQuery({ queryKey: qk.instance(t.instanceId), queryFn: () => API.instance(t.instanceId), refetchInterval: 12_000 });
  const i = inst.data;
  const s = traderState(t);
  const generic = GENERIC.has(s.key);
  const halted = !!i?.dailyRiskHalted;

  // while it trades as usual, say what it's trading with ("XENO is trading on your free trial"), from GET /trader balances
  const title =
    halted && generic
      ? tr("New trades paused for today")
      : generic && i && !ROUTINE_STEPS.has(i.executionState)
        ? executionState(i.executionState)
        : generic
          ? tradingSource(t)
          : s.title;
  // the one sentence that matters most right now, or null when all is routine
  const note = halted
    ? tr("Daily loss limit reached: no new trades until {time}. Open trades are still managed.", { time: i?.dailyLimitResetsAt ? fmtTime(i.dailyLimitResetsAt) : tr("the next UTC day") })
    : s.key === "quota" && s.nextSlotAt
      ? tr("Next entry slot at {time}. Exits continue.", { time: fmtTime(s.nextSlotAt) })
      : generic
        ? null
        : (s.body ?? null);
  // the same, in a few words for the chip under Home's circle (the circle already says what's happening, and for these so does the
  // trial card right below it)
  const onTrialCard = TRIAL_STOPS.has(s.key) && !!trialCard(t.trial, t.engagement.recommendedCta);
  const short = halted
    ? i?.dailyLimitResetsAt
      ? tr("Daily loss limit · resumes at {time}", { time: fmtTime(i.dailyLimitResetsAt) })
      : tr("Daily loss limit · resumes 00:00 UTC")
    : s.key === "quota" && s.nextSlotAt
      ? tr("Next entry slot at {time}", { time: fmtTime(s.nextSlotAt) })
      : generic || onTrialCard
        ? null
        : (s.body ?? null);
  // no new entries for the rest of the day: amber, not the green of a working agent
  const mode: OrbMode = halted && generic ? "waiting" : s.mode;
  const warn = halted || (!generic && s.tone !== "ok");

  return { s, inst, title, note, short, mode, warn };
}
