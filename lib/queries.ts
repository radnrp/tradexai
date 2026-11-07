"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API } from "./api/client";
import { ApiError } from "./api/session";
import type { FeedType, LeaderboardRange, Range, ReferralEarningType } from "./api/types";

export const qk = {
  health: ["health"] as const,
  trader: ["trader"] as const,
  instances: ["instances"] as const,
  instance: (id: string) => ["instance", id] as const,
  statement: (range: Range, instanceId?: string) => ["statement", range, instanceId ?? "all"] as const,
  positions: (status: string, instanceId?: string, range?: Range) => ["positions", status, instanceId ?? "all", range ?? "all"] as const,
  referrals: ["referrals"] as const,
  referralUsers: ["referrals", "users"] as const,
  referralEarnings: (type: ReferralEarningType) => ["referrals", "earnings", type] as const,
  platformPolicy: ["platform-policy"] as const,
  deposits: ["deposits"] as const,
  withdrawals: ["withdrawals"] as const,
  activity: (range?: Range, instanceId?: string) => ["activity", range ?? "all", instanceId ?? "all"] as const,
  feed: ["community", "feed"] as const,
  /** The same feed page by page (Activity), apart from the live bar's first page. */
  feedPages: ["community", "feed", "pages"] as const,
  /** One type only, filtered by the server with its own cursors: its first page, polled, and its pages (Activity's tabs). */
  typeFeed: (type: FeedType) => ["community", "feed", "type", type, "first"] as const,
  typeFeedPages: (type: FeedType) => ["community", "feed", "type", type, "pages"] as const,
  feedbackEligibility: ["feedback", "eligibility"] as const,
  myFeedback: ["feedback", "mine"] as const,
  leaderboard: (range: LeaderboardRange) => ["community", "leaderboard", range] as const,
  calculator: (amount: string, range: string) => ["calculator", amount, range] as const,
};

/** Poll every `ms` until a final status; back off after failures. Paused while the app is hidden. */
export function pollUntil(final: Set<string>, ms = 10_000) {
  return (q: { state: { data?: { status: string }; fetchFailureCount: number } }) => {
    const status = q.state.data?.status;
    if (status && final.has(status)) return false;
    return ms * 2 ** Math.min(q.state.fetchFailureCount, 3);
  };
}

/** The permanent XENO account. Every 10s in the foreground; React Query stops polling while the app is hidden and refetches on return. */
export const useTrader = () => useQuery({ queryKey: qk.trader, queryFn: API.trader, refetchInterval: 10_000 });
/**
 * False until this session's first GET /trader has answered (true at once on screens that don't ask for it). The backend
 * serves one request at a time, so a screen's secondary requests wait on this instead of queueing ahead of its main numbers.
 */
export function useAfterTrader() {
  const qc = useQueryClient();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    let done = false;
    // effects run after the commit, so a /trader query that any screen created in the same render is already cached
    const check = () => {
      if (done) return;
      const s = qc.getQueryState(qk.trader);
      if (s && !s.dataUpdatedAt && !s.errorUpdatedAt) return;
      done = true;
      // the cache also notifies while other components render their own queries, where a state update is an error
      queueMicrotask(() => setReady(true));
    };
    check();
    return qc.getQueryCache().subscribe(check);
  }, [qc, ready]);
  return ready;
}
export const useInstances = (poll = false) =>
  useQuery({ queryKey: qk.instances, queryFn: API.instances, refetchInterval: poll ? 15_000 : false });
export const useStatement = (range: Range, instanceId?: string) =>
  useQuery({ queryKey: qk.statement(range, instanceId), queryFn: () => API.statement(range, instanceId) });
/** `poll` while the Invite page is open; a 429 slows it down. */
export const useReferrals = (poll = false) =>
  useQuery({
    queryKey: qk.referrals,
    queryFn: API.referrals,
    refetchInterval: poll ? (q) => (q.state.error instanceof ApiError && q.state.error.status === 429 ? 180_000 : 60_000) : false,
  });
/** This account's fees, locks and program switches; they change on a first deposit, which refetches it with the ledger. */
export const usePlatformPolicy = () => useQuery({ queryKey: qk.platformPolicy, queryFn: API.platformPolicy, staleTime: 5 * 60_000 });

/** After money moves, refetch everything derived from the ledger. */
export function useInvalidateLedger() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["trader", "instances", "instance", "statement", "positions", "activity", "deposits", "withdrawals", "referrals", "platform-policy"].map((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      ),
    );
}

/**
 * Refetch the ledger when `sig` changes: a trade opened or closed, an order settled or funding cleared.
 * Balances are always reread from the server, never adjusted here.
 */
export function useLedgerSync(sig: string | null) {
  const invalidate = useInvalidateLedger();
  const prev = useRef(sig);
  useEffect(() => {
    if (sig == null || prev.current === sig) return;
    const first = prev.current == null;
    prev.current = sig;
    if (!first) invalidate();
  }, [sig, invalidate]);
}
