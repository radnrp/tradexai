import { api } from "./session";
import type * as T from "./types";

const qs = (p: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v != null && v !== "") s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : "";
};

export const API = {
  me: () => api<T.User>("/auth/me"),
  health: () => api<T.Health>("/health"),

  trader: () => api<T.Trader>("/trader"),
  /** "latest" only returns the current cursor, so old profits aren't replayed. */
  traderEvents: (after: string) => api<T.TraderEventsPage>(`/trader/events${qs({ after })}`),
  /** Send only the keys being changed; unknown keys are rejected. */
  patchPreferences: (body: T.TraderPreferences) => api<{ ok: true }>("/trader/preferences", { method: "PATCH", body }),
  calculator: (amount: string, range: string) => api<T.Calculator>(`/trader/calculator${qs({ amount, range })}`),

  /** Latest 30 settled profits and confirmed withdrawals of all users, newest first. */
  communityFeed: () => api<T.CommunityFeed>("/community/feed"),
  /** Confirmed withdrawals only (net delivered), so they aren't crowded out of the mixed feed. */
  communityWithdrawals: () => api<T.CommunityFeed>("/community/withdrawals"),
  leaderboard: (range: T.LeaderboardRange) => api<T.Leaderboard>(`/community/leaderboard${qs({ range })}`),

  depositCurrencies: () =>
    api<{ currencies: (T.DepositCurrency | string)[]; settlementCurrency: string }>("/deposits/currencies"),
  createDeposit: (body: { amount: string; payCurrency: string }, key: string) =>
    api<T.Deposit>("/deposits", { method: "POST", body, key }),
  deposits: (page = 1, limit = 20) => api<T.Deposit[]>(`/deposits${qs({ page, limit })}`),
  deposit: (id: string) => api<T.Deposit>(`/deposits/${encodeURIComponent(id)}`),
  cancelDeposit: (id: string) => api<T.Deposit>(`/deposits/${encodeURIComponent(id)}/cancel`, { method: "POST" }),

  // single_xeno: the list holds only the permanent account; an old agent can still be read by id for its history.
  // Creating an agent or changing its status is gone (400), the account is never started or stopped by the user.
  instances: () => api<T.AgentInstance[]>("/agents/instances"),
  instance: (id: string) => api<T.AgentInstance>(`/agents/instances/${encodeURIComponent(id)}`),
  renameInstance: (id: string, body: { name: string }, key: string) =>
    api<T.AgentInstance>(`/agents/instances/${encodeURIComponent(id)}`, { method: "PATCH", body, key }),

  universe: () => api<{ symbol: string; rank: number; baseAsset: string }[]>("/market/universe"),
  quote: (symbol: string) => api<T.Quote>(`/market/${encodeURIComponent(symbol)}/futures/quote`),
  candles: (symbol: string) => api<T.Candle[]>(`/market/${encodeURIComponent(symbol)}/futures/candles`),

  positions: (p: { status: "open" | "closed"; page?: number; limit?: number; instanceId?: string; range?: T.Range }) =>
    api<T.PositionPage>(`/positions${qs({ status: p.status, page: p.page ?? 1, limit: p.limit ?? 20, instanceId: p.instanceId, range: p.range })}`),
  executions: (id: string, page = 1) =>
    api<T.ExecutionPage>(`/positions/${encodeURIComponent(id)}/executions${qs({ page, limit: 20 })}`),

  statement: (range: T.Range, instanceId?: string) => api<T.Statement>(`/statements${qs({ range, instanceId })}`),
  activity: (p: { page: number; range?: T.Range; instanceId?: string }) =>
    api<T.PageResult<T.ActivityJournal>>(`/activity${qs({ page: p.page, limit: 20, range: p.range, instanceId: p.instanceId })}`),
  referrals: () => api<T.Referrals>("/referrals"),
  recentReferrals: (limit = 15) => api<T.ReferredUser[]>(`/referrals/recent${qs({ limit })}`),

  withdrawalPolicy: () => api<T.WithdrawalPolicy>("/withdrawals/policy"),
  withdrawals: (page = 1, limit = 20) => api<T.Withdrawal[]>(`/withdrawals${qs({ page, limit })}`),
  withdrawal: (id: string) => api<T.Withdrawal>(`/withdrawals/${encodeURIComponent(id)}`),
  createWithdrawal: (body: { amount: string; address: string; network: "bsc" }, key: string) =>
    api<T.Withdrawal>("/withdrawals", { method: "POST", body, key }),
  resendOtp: (id: string) => api<T.Withdrawal>(`/withdrawals/${encodeURIComponent(id)}/resend`, { method: "POST" }),
  confirmOtp: (id: string, code: string) =>
    api<T.Withdrawal>(`/withdrawals/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { code } }),
};
