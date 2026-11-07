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
  /** Checks a notification link's start param after sign-in; the param goes URL-encoded, initData is never touched. */
  notificationContext: (startParam: string) => api<T.NotificationContext>(`/notifications/context${qs({ startParam })}`),

  /** One real tap on a "fund XENO" call to action; a retry sends the same eventId. Nothing personal goes in the body. */
  analyticsEvent: (body: { eventId: string; event: "fund_xeno_clicked" }) => api<{ accepted: true }>("/analytics/events", { method: "POST", body }),

  /**
   * Verified community activity, newest first: settled profits, credited deposits, approved reviews and withdrawals (confirmed
   * or processing). `type` asks for one kind only (none: the mixed feed). `cursor` is the nextCursor of a page read with the
   * same type, passed back as is; polling reads the first page again. limit 1–50.
   */
  communityFeed: (p: { type?: T.FeedType; cursor?: string; limit?: number; signal?: AbortSignal } = {}) =>
    api<T.CommunityFeed>(`/community/feed${qs({ type: p.type, limit: p.limit ?? 30, cursor: p.cursor })}`, { signal: p.signal }),
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
    api<T.ActivityPage>(`/activity${qs({ page: p.page, limit: 20, range: p.range, instanceId: p.instanceId })}`),
  referrals: () => api<T.Referrals>("/referrals"),
  /** Every invited friend, newest first; limit 1–100. */
  referralUsers: (page: number, limit = 20) => api<T.PageResult<T.ReferralUser>>(`/referrals/users${qs({ page, limit })}`),
  /** Booked commissions and rewards, newest first. No range: totals are lifetime. */
  referralEarnings: (page: number, type: T.ReferralEarningType = "all", limit = 20) =>
    api<T.PageResult<T.ReferralEarning>>(`/referrals/earnings${qs({ page, limit, type })}`),
  platformPolicy: () => api<T.PlatformPolicy>("/platform/policy"),

  /** When to invite feedback (also in GET /trader engagement.feedbackCta). */
  feedbackEligibility: () => api<T.FeedbackEligibility>("/feedback/eligibility"),
  /** One key per submission, kept for retries of the same body, so a double tap or a timeout never makes two. */
  submitFeedback: (body: { rating: number; text: string; publicationConsent: boolean }, key: string) =>
    api<T.FeedbackItem>("/feedback", { method: "POST", body, key }),
  /** The user's own reviews, 20 a page, newest first. */
  myFeedback: (cursor?: string) => api<T.FeedbackPage>(`/feedback/mine${qs({ cursor })}`),

  withdrawalPolicy: () => api<T.WithdrawalPolicy>("/withdrawals/policy"),
  withdrawals: (page = 1, limit = 20) => api<T.Withdrawal[]>(`/withdrawals${qs({ page, limit })}`),
  withdrawal: (id: string) => api<T.Withdrawal>(`/withdrawals/${encodeURIComponent(id)}`),
  createWithdrawal: (body: { amount: string; address: string; network: "bsc" }, key: string) =>
    api<T.Withdrawal>("/withdrawals", { method: "POST", body, key }),
  resendOtp: (id: string) => api<T.Withdrawal>(`/withdrawals/${encodeURIComponent(id)}/resend`, { method: "POST" }),
  confirmOtp: (id: string, code: string) =>
    api<T.Withdrawal>(`/withdrawals/${encodeURIComponent(id)}/confirm`, { method: "POST", body: { code } }),
};
