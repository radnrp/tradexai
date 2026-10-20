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
  wallet: () => api<T.Wallet>("/wallet"),

  depositCurrencies: () =>
    api<{ currencies: (T.DepositCurrency | string)[]; settlementCurrency: string }>("/deposits/currencies"),
  createDeposit: (body: { amount: string; payCurrency: string }, key: string) =>
    api<T.Deposit>("/deposits", { method: "POST", body, key }),
  deposits: (page = 1, limit = 20) => api<T.Deposit[]>(`/deposits${qs({ page, limit })}`),
  deposit: (id: string) => api<T.Deposit>(`/deposits/${encodeURIComponent(id)}`),
  cancelDeposit: (id: string) => api<T.Deposit>(`/deposits/${encodeURIComponent(id)}/cancel`, { method: "POST" }),

  models: () => api<T.AgentModel[]>("/agents/models"),
  instances: () => api<T.AgentInstance[]>("/agents/instances"),
  instance: (id: string) => api<T.AgentInstance>(`/agents/instances/${encodeURIComponent(id)}`),
  createInstance: (
    body: { modelId: string; capital: string; name?: string; planId?: string },
    key: string,
  ) => api<T.AgentInstance>("/agents/instances", { method: "POST", body, key }),
  patchInstance: (id: string, body: { name?: string; status?: "active" | "paused" | "stopping" }, key: string) =>
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
