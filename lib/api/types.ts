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
export type PauseReason = "risk_drawdown" | "minimum_capital" | (string & {});
export type WithdrawalBlockedReason = "migration_pending" | "funding_pending" | "valuation_unavailable" | (string & {});
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
  /** Free cash, before the Trial fund principal is locked. */
  cash: Dec;
  /** Current value inside the account, without reserved withdrawals; null while data is invalid. */
  tradingEquity: Dec | null;
  /** Trial fund principal left; never withdrawable. */
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
  pnl: { realizedNet: Dec; unrealizedNetEstimate: Dec | null };
  valuation: Valuation & { openPositions?: number };
  quota: TraderQuota;
  engine: { origin: string; entriesEnabled: boolean; blockedReason: string | null; lastTickAt: string | null };
  feeBpsPerSide: number;
  publicActivity: boolean;
  onboarding: { completed: number; total: number; steps: { key: OnboardingStepKey; complete: boolean }[] };
  tradePolicy?: TradePolicy | null;
  asOf: string;
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

/** A settled, positive trade result: net of both fees and funding. Not a deposit; never add it to a balance. */
export interface TraderEvent {
  id: string;
  type: "trade_profit" | (string & {});
  symbol: string;
  side: "long" | "short";
  amount: Dec;
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
  type: "trade_profit" | "withdrawal" | (string & {});
  /** Already masked by the server ("Par***"). */
  name: string;
  /** Trade: net profit. Withdrawal: net amount delivered. */
  amount: Dec;
  asset: string;
  symbol: string | null;
  occurredAt: string;
}

export interface CommunityFeed {
  items: CommunityItem[];
  curated: string;
  asOf: string;
}

export type LeaderboardRange = "today" | "7d" | "30d";

/** GET /community/leaderboard: positive nets only, at most 50 rows, names masked by the server. */
export interface Leaderboard {
  range: LeaderboardRange;
  timezone: string;
  from: string;
  asOf: string;
  /** Sum of every settled win and loss in the period, both fees and funding included. */
  basis: string;
  positiveResultsOnly: boolean;
  items: { rank: number; name: string; net: Dec; trades: number; modelId: string }[];
}

/** GET /trader/calculator: a historical illustration, never a forecast. */
export interface Calculator {
  status: "available" | "insufficient_data";
  amount: Dec;
  range: string;
  sampleTrades: number;
  sampleAccounts: number;
  firstTradeAt: string | null;
  lastTradeAt: string | null;
  /** Signed; null with too little data. */
  illustrativeNet: Dec | null;
  method: string;
  forecast: false;
  note: string;
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
  leverageMode?: "minimum_feasible" | string;
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
  unrealizedNetEstimate: Dec | null;
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

export interface ExecutionOrder {
  id: string;
  side?: "buy" | "sell" | string;
  intent?: "entry" | "exit" | string;
  purpose?: string;
  status?: string;
  created_at?: string;
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
  referralIncome: Dec;
  /** Trial fund granted in the period; neither a deposit nor a trading result. */
  trialGrants?: Dec;
  capitalIn: Dec;
  capitalOut: Dec;
  otherNet: Dec;
  bookedChange: Dec;
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
  unrealizedNetEstimate: Dec | null;
  estimatedExitFees: Dec | null;
  valuation: Valuation;
  /** Legacy responses carry the funding count here instead of inside `valuation`. */
  fundingPendingPositions?: number;
  realized: {
    closed_trades: number;
    realized_gross: Dec;
    realized_net: Dec;
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

export interface ActivityJournal {
  id: string;
  kind: string;
  created_at: string;
  net_amount: Dec;
  lines: JournalLine[];
}

export interface Referrals {
  referralCode: string;
  referredUsers: number;
  shareBps: number;
  earned: Dec;
}

/** GET /referrals/recent?limit=15 (max 15), newest first. */
export interface ReferredUser {
  id: string;
  name: string;
  joined_at: string;
  /** Referral income booked from this user's fees. */
  earned: Dec;
  /** Their account is trading. */
  active: boolean;
}

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
