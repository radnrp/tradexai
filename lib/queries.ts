"use client";
import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { API } from "./api/client";
import type { Range } from "./api/types";

export const qk = {
  health: ["health"] as const,
  wallet: ["wallet"] as const,
  models: ["models"] as const,
  instances: ["instances"] as const,
  instance: (id: string) => ["instance", id] as const,
  statement: (range: Range, instanceId?: string) => ["statement", range, instanceId ?? "all"] as const,
  positions: (status: string, instanceId?: string, range?: Range) => ["positions", status, instanceId ?? "all", range ?? "all"] as const,
  referrals: ["referrals"] as const,
  recentReferrals: ["referrals", "recent"] as const,
  deposits: ["deposits"] as const,
  withdrawals: ["withdrawals"] as const,
  activity: (range?: Range, instanceId?: string) => ["activity", range ?? "all", instanceId ?? "all"] as const,
};

/** Poll every `ms` until a final status; back off after failures. Paused while the app is hidden. */
export function pollUntil(final: Set<string>, ms = 10_000) {
  return (q: { state: { data?: { status: string }; fetchFailureCount: number } }) => {
    const status = q.state.data?.status;
    if (status && final.has(status)) return false;
    return ms * 2 ** Math.min(q.state.fetchFailureCount, 3);
  };
}

export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: API.health, staleTime: 60_000 });
export const useWallet = () => useQuery({ queryKey: qk.wallet, queryFn: API.wallet });
export const useModels = () => useQuery({ queryKey: qk.models, queryFn: API.models, staleTime: 5 * 60_000 });
export const useInstances = (poll = false) =>
  useQuery({ queryKey: qk.instances, queryFn: API.instances, refetchInterval: poll ? 15_000 : false });
export const useStatement = (range: Range, instanceId?: string) =>
  useQuery({ queryKey: qk.statement(range, instanceId), queryFn: () => API.statement(range, instanceId) });
export const useReferrals = () => useQuery({ queryKey: qk.referrals, queryFn: API.referrals });

/** After money moves, refetch everything derived from the ledger. */
export function useInvalidateLedger() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      ["wallet", "instances", "instance", "statement", "positions", "activity", "deposits", "withdrawals", "referrals"].map((k) =>
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
