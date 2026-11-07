// Response shapes from the TradeXai API contract (trade policy v4: long/short, isolated auto leverage, funding, R/R 2:1). Amounts are exact decimal strings.
export type Dec = string;
export type Range = "7d" | "30d" | "6m" | "all";
/** Any futures symbol from the scanned universe (top 50 by market cap); agents pick it, users don't. */
export type SymbolCode = string;

export interface User {
  id: string;
  telegram_id: string;
  name: string;
  referral_code: string;
  status: string;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
}

export interface Health {
  ok: boolean;
  agentEngine: {
    connected: boolean;
    origin: string;
    entriesEnabled: boolean;
    /** false in single_xeno mode: the permanent account is created by the server. */
    userActivationAvailable: boolean;
    accountMode?: "single_xeno" | (string & {});
    state: string;
  };
}

export interface Wallet {
  asset: string;
  /** In single_xeno mode this equals the trader's `withdrawable`. */
  available: Dec;
  /** Compatibility only: summing these is not the account value. */
  accounts: { id: string; balance: Dec }[];
  accountMode?: "single_xeno" | (string & {});
}

/** Why new entries are paused. Exits and funding keep running either way. */
/** trial_limit: the 50 trial entries are used; real_funding_required: credited deposits are still under the 50 USDT that starts real trading. */
export type PauseReason = "risk_drawdown" | "minimum_capital" | "trial_limit" | "real_funding_required" | (string & {});
/** trial_profit_locked: what's withdrawable is under the minimum while trial profit waits for real deposits. */
export type WithdrawalBlockedReason = "migration_pending" | "funding_pending" | "valuation_unavailable" | "trial_profit_locked" | (string & {});
export type OnboardingStepKey = "account_created" | "tutorial_watched" | "fund_account" | "trader_ready" | (string & {});

/** GET /trader: the one permanent XENO account, the source for Home. Amounts are exact decimals; null means unknown, never zero. */
export interface Trader {
  asset: string;
  instanceId: string;
  modelId: string;
  permanent: boolean;
  minimumCapital: Dec;
  status: InstanceStatus | string;
  pauseReason: PauseReason | null;
  /** Old trades are settling while not "ready"; never guess when it ends. */
  migrationState: "ready" | "draining" | (string & {});
  /** Free cash, before the Trial grant principal is locked. */
  cash: Dec;
  /** Current value inside the account, without reserved withdrawals; null while data is invalid. */
  tradingEquity: Dec | null;
  /** Trial grant principal left; never withdrawable. */
  trialPrincipalRemaining: Dec;
  /** The most a withdrawal may ask for right now; the server checks again on POST. */
  withdrawable: Dec;
  /** The withdrawable figure could be computed; true doesn't mean it reaches the minimum. */
  withdrawalAvailable: boolean;
  withdrawalBlockedReason: WithdrawalBlockedReason | null;
  /** Everything booked to the account, collateral and reserves included. */
  bookedEquity: Dec;
  /** Live value with open P&L; null without a valid valuation. */
  equity: Dec | null;
  /** equity after estimated exit fees (the name doesn't mean a liquidation). */
  liquidationEquity: Dec | null;
  pnl: TraderPnl;
  valuation: Valuation & { openPositions?: number };
  quota: TraderQuota;
  engine: { origin: string; entriesEnabled: boolean; blockedReason: string | null; lastTickAt: string | null };
  /** This account's fee on new entries, each side (0 while the Trial is exempt). Open trades keep the fee they opened with. */
  feeBpsPerSide: number;
  /** What the fee is a share of: the trade's margin (old) or its executed position size (policy v2). */
  feeBasis?: FeeBasis | (string & {});
  feePolicy?: FeePolicy;
  /** Only while a deposit's principal is locked; absent means none. */
  depositLocks?: DepositLocks;
  publicActivity: boolean;
  onboarding: { completed: number; total: number; steps: { key: OnboardingStepKey; complete: boolean }[] };
  tradePolicy?: TradePolicy | null;
  balances: Balances;
  /** Settled results for the requested range (all by default) with their ROI on the same basis. */
  performance: Performance;
  engagement: Engagement;
  /** The Trial's entry quota (contract 2026-10-25); absent on older responses, null when the server has none. */
  trial?: Trial | null;
  depositUi?: DepositUi | null;
  /** The trial-profit withdrawal condition (contract 2026-10-30); absent on older responses. */
  trialProfitProtection?: TrialProfitProtection | null;
  asOf: string;
}

/**
 * GET /trader, /wallet and /wallet/trial-profit-protection `trialProfitProtection` (contract 2026-10-30): settled trial profit
 * stays unwithdrawable until confirmed real deposits reach `minimumDeposit`. A limit on what's withdrawable, never extra money
 * or a cut from P&L; `withdrawable` already leaves it out. `withdrawalConditionMet` opens only this lock, not every withdrawal.
 */
export interface TrialProfitProtection {
  /** False: the rule isn't on, so nothing about it is shown. */
  enabled: boolean;
  /** The version of this rule alone, not of the platform policy or the fees. */
  policyVersion: number;
  asset: string;
  minimumDeposit: Dec;
  /** Credited real deposits only: not invoices, manual credits, the gift or referral income. */
  confirmedDeposits: Dec;
  depositRemaining: Dec;
  fundingConditionMet: boolean;
  /** Settled trial profit this condition holds back; "0" once it's met. */
  lockedProfit: Dec;
  withdrawalConditionMet: boolean;
  trialPrincipalWithdrawable: false;
  appliesTo: string;
  basis: string;
  activatedAt: string | null;
}

/**
 * GET /trader `pnl` (contract 2026-10-26): personal figures leave out trade losses the Trial grant principal really covered;
 * the account* ones keep the actual result. Null means pending (prices or funding), never zero.
 */
export interface TraderPnl {
  /** personal_net_after_confirmed_trial_loss_coverage */
  basis?: string;
  /** Personal, closed trades. */
  realizedNet: Dec;
  accountRealizedNet?: Dec;
  /** Losses the Trial grant principal covered on settled closed trades; never cash added to the account. */
  trialLossCovered?: Dec;
  /** Personal, open trades. */
  unrealizedNetEstimate: Dec | null;
  accountUnrealizedNetEstimate?: Dec | null;
  /** Estimated cover for open trades, shared out of one remaining Trial grant; final only once a trade settles. */
  trialLossCoveredEstimate?: Dec | null;
}

export type TrialStatus = "ready" | "active" | "draining" | "completed" | "converted";

/**
 * GET /trader `trial`: at most `limit` entries that really opened, on top of the rolling-hour and open-at-once limits. Rejected
 * signals and failed orders don't count; an order in flight holds a slot (`reserved`). Not a timer, and never counted here.
 */
export interface Trial {
  limit: number;
  /** Entries that filled, not closed trades; can exceed `limit` for accounts from before the quota. */
  used: number;
  /** Never negative. */
  remaining: number;
  reserved: number;
  /** Trial trades still open or waiting for funding to settle. */
  unsettled: number;
  /** draining: quota used, open trades still managed; converted: a credited deposit ended the trial. */
  status: TrialStatus | (string & {});
  endReason: "quota" | "deposit" | (string & {}) | null;
  endedAt: string | null;
  /** Credited deposits in total; an address, waiting or confirming payment doesn't count. */
  confirmedDeposits: Dec;
  minimumRealDeposit: Dec;
  /** Credited deposits reach `minimumRealDeposit`, so real trading can start. */
  realFundingReady: boolean;
  hourlyEntryLimit: number;
  maxOpenPositions: number;
  /** The user's own id; never shown, logged or sent anywhere. */
  userId?: string;
}

export type FeeBasis = "initial_margin" | "executed_notional";

/** Fee for new entries under platform policy v2 (contract 2026-10-27): a share of the executed position size, each side. */
export interface FeePolicy {
  version: number;
  basis: FeeBasis | (string & {});
  rateBps: number;
  /** A Trial account's new entries pay no fee; funding still applies. */
  trialExempt: boolean;
}

/**
 * GET /wallet/deposit-locks (contract 2026-10-27): each deposit's principal can't be withdrawn for 7 days from the moment it was
 * credited, every deposit on its own clock; it trades all along. A schedule, not money: never add it to a balance or take it off
 * one. Withdrawable stays the server's number. A row leaves `items` when it unlocks.
 */
export interface DepositLocks {
  asset: string;
  basis: string;
  lockedPrincipal: Dec;
  nextUnlockAt: string | null;
  items: { depositId: string; amount: Dec; creditedAt: string; unlockAt: string }[];
  durationDays: number;
  scope: string;
  profitsLocked: boolean;
  asOf: string;
}

/** GET /platform/policy: the rules in force for this account; a Trial and a funded account can see different fees. */
export interface PlatformPolicy {
  version: number;
  /** When the policy really took effect (UTC); not `asOf`. */
  activatedAt: string | null;
  preparedVersion: number;
  fees: {
    activeVersion: number;
    basis: FeeBasis | (string & {});
    rateBpsPerSide: number;
    /** The rate funded accounts pay. */
    standardRateBpsPerSide: number;
    trialExempt: boolean;
    entryAndExit: boolean;
    snapshotBased: boolean;
    existingPositionsMayUseLegacyFees: boolean;
  };
  /** enabled is for future deposits only: rows already locked stay locked when it's switched off. */
  depositLocks: {
    enabled: boolean;
    durationDays: number;
    scope: string;
    profitsLocked: boolean;
    referralIncomeLocked: boolean;
    bountiesLocked: boolean;
    legacyPrincipalBackfilled: boolean;
  };
  referralProgram: { enabled: boolean; bountyEnabled: boolean; bountyAmount: Dec };
  /** profitsWithdrawable turns true once the trial-profit condition is met. */
  trial?: {
    grant: Dec;
    entryQuota: number;
    hourlyEntryLimit: number;
    maxOpenPositions: number;
    endsOnFirstConfirmedDeposit: boolean;
    principalWithdrawable: false;
    profitsWithdrawable: boolean;
    profitWithdrawalMinimumRealDeposit: Dec;
    profitWithdrawalConditionActive: boolean;
  };
  trialProfitProtection?: TrialProfitProtection;
  depositLockSummary: DepositLocks;
  asOf: string;
}

/** GET /trader `depositUi`: suggestions for the deposit form. `minimumRealFunding` is the activation total, not a coin's minimum. */
export interface DepositUi {
  quickAmounts: Dec[];
  recommendedAmount: Dec | null;
  minimumRealFunding: Dec;
  supportUrl: string | null;
  helpText: string | null;
}

/** GET /trader `balances` (contract 2026-10-22): the account split for Wallet. Null means no valid valuation, never zero. */
export interface Balances {
  /** Everything the user owns, withdrawal reserves included. */
  accountEquity: Dec | null;
  /** What's inside the agent; reserves already taken out of it are not. */
  agentEquity: Dec | null;
  /** Gift principal left; never withdrawable. */
  trialPrincipal: Dec;
  /** max(accountEquity − trialPrincipal, 0): own funds and earnings. Not the withdrawable amount. */
  nonTrialEquity: Dec | null;
  agentNonTrialEquity: Dec | null;
  /** How far the live value sits below the settled trial principal: a valuation, not a charge. */
  valuationShortfall: Dec | null;
  cash: Dec;
  /** The only figure to call withdrawable. */
  withdrawable: Dec;
  /** Held for withdrawals that haven't left the account yet. */
  withdrawalReserved: Dec;
  sourceMode: SourceMode;
  trialPrincipalWithdrawable: false;
  /** False while trial profit waits for real deposits (trialProfitProtection). */
  trialProfitsWithdrawable: boolean;
}

/** What the agent's capital is made of right now (not whether the user ever deposited). */
export type SourceMode = "trial" | "trial_with_profits" | "mixed" | "real" | "empty" | "unavailable";

export type PerformanceRange = "all" | "today" | "7d" | "30d";

/**
 * Settled net P&L and account ROI (net ÷ flow-weighted capital) for one range; open P&L is never part of it.
 * netPnl and roiPercent are personal (Trial-covered losses left out); the denominator is the whole trading capital, not deposits alone.
 */
export interface Performance {
  range: PerformanceRange;
  from: string;
  to: string;
  timezone: "UTC";
  /** personal_net_after_confirmed_trial_loss_coverage_on_total_trading_capital */
  basis: string;
  netPnl: Dec;
  /** Already a percentage ("2.40000000" is 2.4%); null while funding is pending or capital isn't positive. */
  roiPercent: Dec | null;
  /** The actual result and its ROI; trialLossCovered is the difference. */
  accountNetPnl?: Dec;
  accountRoiPercent?: Dec | null;
  trialLossCovered?: Dec;
  status: "available" | "funding_pending" | "nonpositive_capital";
  openingCapital: Dec;
  netExternalFlows: Dec;
  weightedCapital: Dec;
  closedTrades: number;
  /** Closed in the range but still waiting for funding to settle. */
  pendingClosedTrades: number;
  hasFundedCapital: boolean;
  allNetPnl: Dec;
  recentNetPnl: Dec;
  recentClosedTrades: number;
  recentRange: "7d";
}

export type CtaCode =
  | "continue_deposit"
  | "deposit_processing"
  | "track_withdrawal"
  | "view_trader_status"
  | "restore_capital"
  | "review_performance"
  | "retry_deposit"
  | "fund_after_trial"
  | "fund_profitable_trial"
  | "fund_trial"
  | "add_after_withdrawal"
  | "add_to_profitable_account"
  | "add_capital"
  | "continue_with_real_funds"
  | "fund_to_unlock_trial_profit";

export type CtaAction = "open_deposit" | "open_deposit_create" | "open_withdrawal" | "open_trader_status" | "open_statement";

/** The server picks the one next step; wording and navigation are the app's. */
export interface RecommendedCta {
  code: CtaCode | (string & {});
  action: CtaAction | (string & {});
  reason: string;
  /** The existing deposit/withdrawal to open; for retry_deposit only context, never a payment to reuse. */
  targetId: string | null;
  dismissible: boolean;
}

export interface Engagement {
  recommendedCta: RecommendedCta;
  /** When to invite the user to leave feedback; a manual one can be sent at other times too. Absent on older responses. */
  feedbackCta?: FeedbackEligibility;
  /** The trial-profit lock as a call to action: shown only while eligible with a positive lockedProfit. */
  trialProfitCta?: TrialProfitCta;
  transactions: {
    deposits: {
      hasCreditedDeposit: boolean;
      creditedCount: number;
      creditedTotal: Dec;
      pending: { id: string; status: string; expiresAt: string | null; canPay: boolean } | null;
      latest: { id: string; status: string } | null;
    };
    withdrawals: {
      hasConfirmedWithdrawal: boolean;
      confirmedCount: number;
      confirmedNetTotal: Dec;
      reserved: Dec;
      pending: { id: string; status: string; otpExpired: boolean } | null;
    };
  };
}

/** Entries counted over a rolling 60 minutes; exits never use quota. Open positions are long + short together. */
export interface TraderQuota {
  basis: "rolling_60_minutes" | (string & {});
  hourlyEntryLimit: number;
  entriesLastHour: number;
  remainingEntries: number;
  /** When the first slot frees up; not a promise of an entry then. */
  nextEntrySlotAt: string | null;
  maxOpenPositions: number;
  openPositions: number;
}

export interface TraderPreferences {
  /** Consent to appear (masked) in the community feed; the app no longer offers the switch. */
  publicActivity?: boolean;
  tutorialWatched?: boolean;
}

/**
 * GET /notifications/context?startParam=ntf_… (contract 2026-10-26): the server's check of a notification link for this user.
 * 404 when the token is unknown, older than 30 days or someone else's. depositId only for a waiting deposit's reminder.
 */
export interface NotificationContext {
  target: "home" | "statement" | "deposit" | "feedback" | (string & {});
  depositId: string | null;
  noticeKind: string;
}

/** A settled, positive trade result: net of both fees and funding. Not a deposit; never add it to a balance. */
export interface TraderEvent {
  id: string;
  type: "trade_profit" | (string & {});
  symbol: string;
  side: "long" | "short";
  /** Net profit; the animation shows roiPercent instead. */
  amount: Dec;
  /** ROI on the position's initial margin, already a percentage; null when it can't be computed. */
  roiPercent?: Dec | null;
  occurredAt: string;
}

export interface TraderEventsPage {
  items: TraderEvent[];
  /** Opaque; pass back as `after`. */
  nextAfter: string;
  curated: string;
}

export interface CommunityItem {
  id: string;
  /** Stable per event across its states ("withdrawal:<id>" while processing and once confirmed): merge and dedupe on it. */
  eventKey?: string;
  /**
   * withdrawal_processing is still on its way (never call it sent or successful); the same id turns into "withdrawal" once
   * confirmed. deposit: a real credited deposit. feedback: an approved public review. Unknown types are skipped.
   */
  type: "trade_profit" | "withdrawal" | "withdrawal_processing" | "deposit" | "feedback" | (string & {});
  /** Withdrawals: queued | signed | broadcast while processing, confirmed once done; credited / approved otherwise. */
  status?: string;
  processing?: boolean;
  /** Already masked by the server ("Par***"). */
  name: string;
  /**
   * Trade: net profit (never shown; roiPercent is). Withdrawal: the net amount sent, fee not included. Deposit: the USDT
   * credited. Null for feedback.
   */
  amount: Dec | null;
  asset: string | null;
  symbol: string | null;
  /** Trade only: ROI on the position's initial margin, already a percentage; null when it can't be computed. */
  roiPercent?: Dec | null;
  /** Feedback only: the approved public copy, plain text; and its 1–5 rating. */
  text?: string;
  rating?: number;
  /** Processing: when it was requested; confirmed: when it was confirmed. */
  occurredAt: string;
}

/**
 * GET /community/feed?type=: one kind of item only, chosen by the server before it pages, so older ones are found too. withdrawal
 * covers confirmed and processing ones; withdrawal_processing is only an item type, never a filter.
 */
export type FeedType = "trade_profit" | "feedback" | "deposit" | "withdrawal";

export interface CommunityFeed {
  /** The filter this page was read with; null for the mixed feed. Absent on older responses. */
  type?: FeedType | null;
  items: CommunityItem[];
  curated: string;
  /** Fixed along one chain of pages; polling starts again from the first page. */
  asOf: string;
  /** Opaque: passed back as is, never built from a date. */
  nextCursor?: string | null;
  hasMore?: boolean;
  limit?: number;
}

/** GET /feedback/eligibility and Home's engagement.feedbackCta: when to invite feedback, after a 7-day cooldown. */
export interface FeedbackEligibility {
  eligible: boolean;
  action: "open_feedback" | (string & {});
  /** experience_ready | feedback_cooldown | more_experience_required */
  reason: string;
  nextEligibleAt: string | null;
  minimumIntervalDays: number;
}

export interface TrialProfitCta {
  eligible: boolean;
  action: "open_deposit_create" | (string & {});
  lockedProfit: Dec;
  depositRemaining: Dec;
  minimumDeposit: Dec;
}

/** One of the user's own reviews. publicText only once approved with consent; never shown to anyone else from here. */
export interface FeedbackItem {
  id: string;
  rating: number;
  text: string;
  publicationConsent: boolean;
  status: "pending" | "approved" | "rejected" | (string & {});
  publicText: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface FeedbackPage {
  items: FeedbackItem[];
  nextCursor: string | null;
}

export type LeaderboardRange = "today" | "7d" | "30d";

/** GET /community/leaderboard: positive nets only, at most 50 rows, names masked by the server. */
export interface Leaderboard {
  range: LeaderboardRange;
  timezone: string;
  from: string;
  asOf: string;
  /** Ranked by account ROI: settled net (wins and losses, fees and funding) on flow-weighted capital. */
  basis: string;
  positiveResultsOnly: boolean;
  /** Keep the server's rank; `net` is only there for compatibility and is never the ranking or the headline. */
  items: { rank: number; name: string; roiPercent: Dec; net: Dec; trades: number; modelId: string }[];
}

/** "today" is one whole hypothetical day, not what's left of today. */
export type CalculatorRange = "today" | "7d" | "30d";

/**
 * GET /trader/calculator (contract 2026-10-21): a what-if scenario on fixed assumptions (80% win rate, 2:1 R/R,
 * 0.5% of the starting amount risked per trade), not observed results and never a forecast.
 */
export interface Calculator {
  status: "available";
  amount: Dec;
  range: CalculatorRange;
  method: string;
  forecast: false;
  /** Before fees and funding: the only result to show. */
  illustrativeGross: Dec;
  /** Always null: there is no net figure, so never show it as zero or as the gross. */
  illustrativeNet: null;
  /** Starting amount + gross; not the real account or withdrawable balance. */
  illustrativeEndingBalance: Dec;
  assumptions: {
    winRate: Dec;
    rewardRiskRatio: Dec;
    riskPerTradeBps: number;
    riskPerTradeAmount: Dec;
    dailyTrades: number;
    days: number;
    totalTrades: number;
    expectedWins: Dec;
    expectedLosses: Dec;
    expectancyR: Dec;
    compounding: boolean;
    feesIncluded: boolean;
    fundingIncluded: boolean;
    dayBasis: string;
    dailyTradesBasis: string;
    maximumDailyEntries: number;
    riskControlsSimulated: boolean;
  };
  note?: string;
}

export interface DepositCurrency {
  code: string;
  name?: string;
  network?: string;
  logo_url?: string;
  /** Smallest deposit in USD for this coin; null = the server has none to give (not zero). */
  minUsd?: Dec | null;
  /** Same minimum, in the coin itself. */
  minAmount?: Dec | null;
  [k: string]: unknown;
}

export interface Deposit {
  id: string;
  requested_usd: Dec;
  pay_currency: string;
  provider_id: string | null;
  status: string;
  address: string | null;
  pay_amount: Dec | null;
  qrDataUrl?: string | null;
  extra_id: string | null;
  expires_at: string | null;
  credited_amount: Dec | null;
  asset: string;
  last_error: string | null;
  created_at?: string;
}

/**
 * The rules every entry of a model follows (GET /agents/models → tradePolicy). Read it, don't hardcode it.
 * null is meaningful, not an error: leverage null = picked per trade, stopLossBps null = dynamic SL, maxHoldingMs null = no time exit.
 */
export interface TradePolicy {
  version?: number;
  side?: "both" | "long" | "short" | string;
  leverage?: number | null;
  maxLeverage?: number | null;
  /** maximum_feasible_exposure: new entries take the largest position its risk limits allow. Old trades keep what they opened with. */
  leverageMode?: "maximum_feasible_exposure" | "minimum_feasible" | string;
  marginMode?: "isolated" | string;
  universeSize?: number | null;
  maxOpenPositions?: number | null;
  /** Margin per entry as bps of the agent's current value (500 = 5%); fees come on top. */
  entryBudgetBps?: number | null;
  capitalBasis?: "current_marked_equity" | string;
  feeBasis?: "initial_margin" | string;
  stopLossBps?: number | null;
  maxHoldingMs?: number | null;
  /** Lowest price and estimated net R/R an entry must reach; not the 2:1 target. */
  minimumRR?: Dec | null;
  riskPerTradeBps?: number | null;
  maxPortfolioRiskBps?: number | null;
  dailyLossBps?: number | null;
  executionCostMode?: "order_book" | string;
  executionCostBpsPerSide?: number | null;
  orderBookMaxAgeMs?: number | null;
  fundingIncluded?: boolean;
  [k: string]: unknown;
}

export interface AgentModel {
  id: string;
  name: string;
  /** Settings version of the model; not a strategy switch. */
  version: number | string;
  min_capital: Dec;
  daily_limit: number;
  fee_bps: number;
  /** Price target of new entries, as reward : 1 risk (now 2 for every model). */
  rr: number | string;
  target_winrate_min: number | string;
  target_winrate_max: number | string;
  engineConnected: boolean;
  entriesEnabled: boolean;
  winrateType: "unverified_target";
  profitGuaranteed: false;
  billing_mode?: "trade_fee" | "subscription" | string;
  subscriptionPlans?: SubscriptionPlan[];
  equityFloorBps?: number;
  tradePolicy?: TradePolicy | null;
  fundingEnabledAt?: string | null;
  config?: Record<string, unknown> | null;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  duration_months: number;
  price: Dec;
}

export type InstanceStatus = "awaiting_engine" | "active" | "paused" | "stopping" | "stopped" | "expired";

export type EntryRejectionCode =
  | "net_rr"
  | "gross_rr"
  | "position_risk"
  | "portfolio_risk"
  | "market_depth"
  | "market_data"
  | "order_precision_or_minimum"
  | "liquidation_buffer"
  | "insufficient_cash"
  | "risk_or_rr";

/** Why the agent's last entry check didn't open a trade. Says nothing about trades already open. */
export interface EntryRejection {
  code: EntryRejectionCode | string;
  /** May be null or partial; every key is optional. */
  details?: {
    symbol?: string;
    grossTargetRR?: Dec;
    minimumNetRR?: Dec;
    bestNetRRWithinRisk?: Dec;
    bestLeverageWithinRisk?: number;
    costMode?: string;
    checkedAt?: string;
    /** Same contract as an entry's decision, with selected null. Only sizing rejections carry it. */
    leverageSelection?: LeverageSelection | null;
    [k: string]: unknown;
  } | null;
}

export interface AgentInstance {
  id: string;
  model_id: string;
  name: string;
  status: InstanceStatus | string;
  /** Set by the server for subscriptions only; null for trade_fee agents and the permanent account. */
  starts_at: string | null;
  expires_at: string | null;
  created_at?: string;
  initial_capital: Dec;
  cash: Dec;
  reserved: Dec;
  exit_fee_reserved?: Dec;
  funding_reserved?: Dec;
  config: Record<string, unknown> | null;
  trade_rules: Record<string, unknown> | null;
  openPositions: number;
  pendingOrders: number;
  engineConnected: boolean;
  entriesEnabled: boolean;
  executionState: string;
  /** Legacy daily entry quota; null on the permanent account (its quota is the rolling hour on GET /trader). */
  entriesToday?: number;
  dailyEntryLimit?: number | null;
  remainingDailyEntries?: number;
  dailyLimitResetsAt?: string | null;
  /** New entries stopped for the rest of the UTC day by the daily loss guard; open trades are still managed. */
  dailyRiskHalted?: boolean;
  dailyRiskBaseline?: Dec | null;
  entryRejection?: EntryRejection | null;
  last_tick_at: string | null;
  blocked_reason: string | null;
  last_error: string | null;
  termination_reason: string | null;
  capital_released: Dec | null;
  finalized_at: string | null;
}

export interface Position {
  id: string;
  instance_id: string;
  agent_name: string;
  symbol: SymbolCode;
  side: "long" | "short";
  leverage?: number | string | null;
  status: "open" | "closed" | string;
  quantity: Dec;
  entry_price: Dec;
  entry_notional: Dec;
  /** null on old 1× trades */
  margin_amount?: Dec | null;
  liquidation_price?: Dec | null;
  entry_fee: Dec;
  exit_price: Dec | null;
  exit_notional: Dec | null;
  exit_fee: Dec | null;
  gross_pnl: Dec | null;
  net_pnl: Dec | null;
  stop_loss: Dec | null;
  take_profit: Dec | null;
  opened_at: string;
  closed_at: string | null;
  close_reason: string | null;
  execution_origin: string;
  valuationStatus: "fresh" | "stale" | "unavailable" | "realized";
  markPrice: Dec | null;
  markAsOf: string | number | null;
  unrealizedGross: Dec | null;
  estimatedExitFee: Dec | null;
  /** Open: personal estimate after the estimated Trial grant cover; null while the price or the cover is unknown. */
  unrealizedNetEstimate: Dec | null;
  /** Open: the trade's actual estimate. */
  accountUnrealizedNetEstimate?: Dec | null;
  trialLossCoveredEstimate?: Dec | null;
  pnlStatus?: "estimate" | "coverage_unavailable" | (string & {});
  pnlBasis?: string;
  /** Closed: personal. The actual result is account_net_pnl; trial_loss_covered counts once funding has settled. */
  account_net_pnl?: Dec | null;
  trial_loss_covered?: Dec;
  /** By the actual result: a covered loss is still a loss. */
  trade_result?: "win" | "loss" | "breakeven" | "unknown";
  pnl_status?: "settled" | "pending_funding" | (string & {});
  pnl_basis?: string;
  funding_net?: Dec | null;
  funding_state?: string | null;
  /** The settings and rules this trade opened under (fees, rr…); old trades may follow an older version. */
  config_snapshot?: Record<string, unknown> | null;
  rules_snapshot?: Record<string, unknown> | null;
}

export interface PositionPage extends PageResult<Position> {
  range: Range;
  instanceId: string | null;
  asOf: string;
}

export interface ExecutionEvent {
  sequence: number;
  eventId: string;
  executionId: string;
  type: "accepted" | "unknown" | "rejected" | "cancelled" | "fill" | string;
  status: "pending" | "applied";
  occurredAt: string | null;
  receivedAt: string | null;
  appliedAt: string | null;
  fill: { origin: string; price: Dec; quantity: Dec; notional: Dec } | null;
  reason: string | null;
}

export type LeverageCandidateOutcome =
  | "order_precision_or_limits"
  | "price_levels_or_liquidation"
  | "market_depth"
  | "insufficient_cash"
  | "position_risk"
  | "portfolio_risk"
  | "net_rr";

export interface LeverageSelected {
  leverage: number;
  quantity: Dec;
  notional: Dec;
  margin: Dec;
  requiredCash: Dec;
  estimatedGrossReward: Dec;
  /** If TP is reached, after the costs counted at entry. Not an expected profit. */
  estimatedNetReward: Dec;
  /** Down to SL, with costs. Not a guaranteed maximum loss. */
  estimatedRisk: Dec;
  /** Share of the whole account at entry. This is the account-risk figure to show. */
  estimatedRiskPercent: Dec;
  estimatedNetRewardPercent: Dec;
  estimatedLossCosts: Dec;
  estimatedRewardCosts: Dec;
  estimatedNetRR: Dec;
}

/** How an entry's leverage was chosen: fixed at entry, an estimate, never actual PnL (spec: LEVERAGE-UPDATE-FRONTEND-2026-11-04). */
export interface LeverageSelection {
  version: number;
  policy: string;
  objective: string;
  evaluatedAt: string;
  quoteAsOf: string;
  bookAsOf: string | null;
  candidateRange: { min: number; max: number };
  evaluatedCandidates: number;
  eligibleCandidates: number;
  rejectedCandidates: Partial<Record<LeverageCandidateOutcome, number>>;
  reason: "largest_admissible_notional" | "no_admissible_candidate" | (string & {});
  failureCode: string | null;
  selected: LeverageSelected | null;
  riskBudget: {
    /** Includes the Trial grant, so it's never shown as a balance. */
    equity: Dec;
    perTradeLimit: Dec;
    portfolioLimit: Dec;
    openRisk: Dec;
    /** Share of the per-trade risk budget used, not of the account. */
    perTradeUsedPercent: Dec | null;
    portfolioRiskAfterEntry: Dec | null;
    portfolioUsedPercent: Dec | null;
    remainingPortfolioRisk: Dec | null;
  };
  /** The first failed check per leverage; equal neighbours are compressed. Up to 200 ranges. */
  higherLeverages: { from: number; to: number; outcome: LeverageCandidateOutcome | "eligible_equivalent_exposure" | (string & {}) }[];
}

export interface ExecutionOrder {
  id: string;
  side?: "buy" | "sell" | string;
  intent?: "entry" | "exit" | string;
  purpose?: string;
  status?: string;
  created_at?: string;
  /** null on exits and old entries; absent on an older server. */
  leverageSelection?: LeverageSelection | null;
  events: ExecutionEvent[];
  [k: string]: unknown;
}

export interface ExecutionPage extends PageResult<ExecutionOrder> {
  positionId: string;
}

export interface Quote {
  symbol: string;
  price: Dec;
  asOf: number;
  source: string;
}

export interface Candle {
  time: number;
  closeTime: number;
  open: Dec;
  high: Dec;
  low: Dec;
  close: Dec;
  volume: Dec;
}

export interface Valuation {
  status: "complete" | "partial" | "unavailable";
  missingSymbols: string[];
  /** Positions whose funding settlement is still being checked. */
  fundingPendingPositions?: number;
  /** Why the valuation is not complete. Absent on older responses. */
  reasons?: ("market_prices_unavailable" | "funding_pending" | (string & {}))[];
  quotes?: Record<string, unknown>;
}

export interface FinancialPeriod {
  deposits: Dec;
  withdrawals: Dec;
  withdrawalFees: Dec;
  withdrawalNetDelivered: Dec;
  tradingGross: Dec;
  tradeFeesPaid: Dec;
  /** Fees and trade results by ledger time (can include fees of trades still open); excludes funding. */
  tradingNet: Dec;
  /** tradingNet with funding booked in the same period. */
  tradingNetAfterFunding?: Dec;
  /** Commission on invited friends' collected trade fees. */
  referralIncome: Dec;
  /** One-time 1 USDT rewards for qualified invites; only sent when non-zero. Never a trading result. */
  referralBounties?: Dec;
  /** Trial grant granted in the period; neither a deposit nor a trading result. */
  trialGrants?: Dec;
  capitalIn: Dec;
  capitalOut: Dec;
  otherNet: Dec;
  bookedChange: Dec;
  /** Everything above is the actual ledger. These two are personal: cover counts when it settled, not when the trade closed. */
  trialLossCovered?: Dec;
  personalTradingNetAfterFunding?: Dec;
  personalPnlBasis?: string;
}

// shortcut: daily / equityHistory row fields aren't specified in the guide; read via pick() and verify against sdk/tradexai-client.ts.
export type Row = Record<string, unknown>;

export interface Statement {
  asset: string;
  range: Range;
  instanceId: string | null;
  timezone: string;
  asOf: string;
  period: { from: string | null; to: string; basis: string };
  bookedEquity: Dec;
  equity: Dec | null;
  liquidationEquity: Dec | null;
  unrealizedGross: Dec | null;
  /** Personal, like Trader.pnl; equity and its history stay the actual account value, Trial grant included. */
  unrealizedNetEstimate: Dec | null;
  accountUnrealizedNetEstimate?: Dec | null;
  trialLossCoveredEstimate?: Dec | null;
  pnlBasis?: string;
  estimatedExitFees: Dec | null;
  valuation: Valuation;
  /** Legacy responses carry the funding count here instead of inside `valuation`. */
  fundingPendingPositions?: number;
  /** By closing time. realized_net is personal; wins/losses/breakeven and observedWinrate stay actual. */
  realized: {
    closed_trades: number;
    realized_gross: Dec;
    realized_net: Dec;
    account_realized_net?: Dec;
    trial_loss_covered?: Dec;
    pnl_basis?: string;
    wins: number;
    losses: number;
    breakeven: number;
    fees_on_closed_trades: Dec;
  };
  observedWinrate: number | string | null;
  financial: FinancialPeriod;
  daily: Row[];
  dailyFinancial: Row[];
  equityHistory: Row[];
  history: {
    /** actual_account_equity_including_trial */
    basis?: string;
    cadence: string;
    coverage: "no_data" | "observed_only";
    firstObservation: string | null;
    lastObservation: string | null;
    gaps: unknown[];
  };
  historyNote?: string;
  performanceNote?: string;
}

export interface JournalLine {
  accountId: string;
  amount: Dec;
  instanceId: string | null;
}

/** GET /activity: the actual ledger. Trial grant cover is never in it and never a cash credit. */
export interface ActivityPage extends PageResult<ActivityJournal> {
  basis?: "actual_ledger_movements" | (string & {});
  trialCoverageIsNotCashCredit?: boolean;
}

export interface ActivityJournal {
  id: string;
  kind: string;
  created_at: string;
  net_amount: Dec;
  lines: JournalLine[];
}

export type PartnerTierId = "starter" | "partner" | "pro_partner" | "elite";

export interface PartnerTier {
  id: PartnerTierId | (string & {});
  name: string;
  /** Qualified direct invites needed. */
  minimum: number;
  /** null on the top tier. */
  maximum: number | null;
  commissionBps: number;
}

/**
 * GET /referrals. The tiers and the reward apply only while `program.active` (and `bounty.enabled`); the v2 fields are absent on
 * an older server, which means the flat legacy rate. Every amount is lifetime and booked: none is a balance or withdrawable.
 */
export interface Referrals {
  referralCode: string;
  /** The Mini App link to share as is; null when the server has no bot configured, and then there's nothing to share. */
  referralUrl?: string | null;
  /** Signed up with the code. */
  referredUsers: number;
  /** Credited deposits of 50+ in total; may still lack the settled trade. */
  fundedReferrals?: number;
  /** Confirmed by the server, for good; the tier counts these. */
  qualifiedReferrals?: number;
  /** Share of friends' collected trade fees from now on; past commissions keep their own rate. */
  shareBps: number;
  /** Commission only; totals.totalEarned adds the rewards. */
  earned: Dec;
  asset?: string;
  program?: {
    active: boolean;
    state: "active" | "prepared" | "inactive" | (string & {});
    policyVersion: number;
    activatedAt: string | null;
    preparedVersion: number;
    bountyEnabled: boolean;
  };
  tier?: {
    /** "legacy" while the program is off. */
    id: PartnerTierId | "legacy" | (string & {});
    name: string;
    qualifiedCount: number;
    commissionBps: number;
    minimum: number | null;
    maximum: number | null;
    /** null on the top tier (or while the program is off). */
    next: { id: PartnerTierId | (string & {}); name: string; minimum: number; commissionBps: number; remaining: number } | null;
  };
  totals?: { commission: Dec; bounties: Dec; totalEarned: Dec };
  bounty?: {
    amount: Dec;
    enabled: boolean;
    paidCount: number;
    /** Qualified, reward not booked yet: the worker pays it, nothing to claim. */
    qualifiedUnpaidCount: number;
    qualifiedUnpaidAmount: Dec;
    destination: "main_trading_balance" | (string & {});
    newPrincipalLock: boolean;
  };
  rules?: {
    policyVersion: number;
    active: boolean;
    minimumFunded: Dec;
    minimumSettledFundedTrades: number;
    directOnly: boolean;
    qualificationLifetime: boolean;
    retroactiveFeeRepricing: boolean;
    tiers: PartnerTier[];
  };
  asOf?: string;
}

export type QualificationStatus = "awaiting_funding" | "awaiting_settled_trade" | "qualified";

/** GET /referrals/users, newest sign-up first. `id` is internal (never a Telegram id); `name` is already shortened. */
export interface ReferralUser {
  id: string;
  name: string;
  joinedAt: string;
  /** Has an active agent; says nothing about qualifying or an open trade. */
  active: boolean;
  qualified: boolean;
  /** Can be before the program's activation for invites qualified at the cutover. */
  qualifiedAt: string | null;
  qualificationStatus: QualificationStatus | (string & {});
  fundingMinimumMet: boolean;
  /** Commission from this friend. */
  earned: Dec;
  bountyPaid: boolean;
  /** "0.00000000" until the reward is booked. */
  bounty: Dec;
  totalEarned: Dec;
}

/** GET /referrals/earnings: booked income, newest first. Each row keeps the rate of its own time. */
export interface ReferralEarning {
  /** The ledger document's id: the key for "new" and for de-duplication. */
  id: string;
  type: "commission" | "bounty" | (string & {});
  /** What the user got. */
  amount: Dec;
  asset: string;
  createdAt: string;
  referredUserId: string | null;
  policyVersion: number;
  /** The whole collected fee before the split; never add it to `amount`. null on old rows and rewards. */
  grossFee: Dec | null;
  commissionBps: number | null;
  qualifiedCount: number | null;
}

export type ReferralEarningType = "all" | "commission" | "bounty";

export interface WithdrawalPolicy {
  asset: string;
  network: string;
  chainId: number;
  minimum: Dec;
  fee: Dec;
  feeIncluded: boolean;
  dailyAmountLimit: Dec | null;
}

export interface Withdrawal {
  id: string;
  amount: Dec;
  fee: Dec;
  net_amount: Dec;
  address: string;
  network: string;
  asset: string;
  status: string;
  otp_expires_at: string | null;
  otp_delivery: string | null;
  tx_hash: string | null;
  confirmed_at: string | null;
  created_at: string;
  deliveryStatus?: "sent" | "failed" | "unchanged";
}
