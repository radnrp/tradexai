import type { Balances, CommunityItem, CtaCode, FeedType, OnboardingStepKey, Position, RecommendedCta, SourceMode, Trader, Trial, TrialProfitProtection, WithdrawalBlockedReason } from "./api/types";
import { t as tr, type Key } from "./i18n/index.ts";
import { serverText } from "./i18n/server-text.ts";
import type { Tone } from "./labels";
import { ceilTo, cmp, div, floorTo, fmt, isAmount, ratio, sign, sub, trimZeros } from "./money.ts";

// What the permanent agent (the XENO model; shown to users as "Agent") is doing, decided only from GET /trader.
// "active" is not a promise of profit, an open trade or an entry right now.

/** How the Home status orb moves: sweeping while it looks for entries, pulsing while trades are open, still otherwise. */
export type OrbMode = "scanning" | "managing" | "waiting" | "paused" | "alert";

export type TraderState = {
  key: string;
  tone: Tone;
  mode: OrbMode;
  title: string;
  body?: string;
  /** minimum_capital: the fix is a deposit, never a new agent. */
  cta?: "deposit";
  /** Quota used up: when the first entry slot frees up (not a promise of an entry then). */
  nextSlotAt?: string | null;
};

type S = Pick<Trader, "status" | "pauseReason" | "migrationState" | "minimumCapital" | "engine" | "valuation" | "quota"> & {
  trial?: Pick<Trial, "status" | "confirmedDeposits" | "minimumRealDeposit"> | null;
};

/** The single status line for the account, in the contract's priority order. */
export function traderState(t: S): TraderState {
  const reasons = t.valuation.reasons ?? [];
  const open = t.quota.openPositions;
  const max = t.quota.maxOpenPositions;

  if (t.migrationState !== "ready")
    return { key: "migrating", tone: "pending", mode: "waiting", title: tr("Settling your previous trades"), body: tr("Withdrawals are off until it finishes.") };
  if (t.pauseReason === "risk_drawdown") return { key: "risk", tone: "bad", mode: "alert", title: tr("Protective risk pause"), body: tr("Under review. Open trades are still managed.") };
  if (t.pauseReason === "minimum_capital")
    return { key: "minimum", tone: "pending", mode: "paused", title: tr("Needs at least {min} USDT to trade", { min: fmt(t.minimumCapital, 0) }), body: tr("Open trades are still managed."), cta: "deposit" };
  // the pause is recorded as soon as the 50th entry fills; only trial.status says the trades left are done
  if (t.pauseReason === "trial_limit")
    return t.trial?.status === "draining" || (!t.trial && open > 0)
      ? { key: "trial_draining", tone: "pending", mode: open ? "managing" : "waiting", title: tr("Finishing your trial trades"), body: tr("No new trades. Open ones are still managed.") }
      : { key: "trial_done", tone: "idle", mode: "paused", title: tr("XENO Paused"), body: tr("Your trial is complete.") };
  if (t.pauseReason === "real_funding_required")
    return {
      key: "real_funding",
      tone: "pending",
      mode: "paused",
      title: tr("XENO Paused"),
      body: t.trial ? tr("Add {n} USDT to start real trading", { n: realFundingNeed(t.trial) }) : tr("Add funds to start real trading"),
    };
  if (t.pauseReason) return { key: "paused", tone: "pending", mode: "paused", title: tr("New trades paused"), body: t.pauseReason.replace(/_/g, " ") };
  if (!t.engine.entriesEnabled) return { key: "entries_off", tone: "pending", mode: "paused", title: tr("New trades are temporarily off") };
  if (reasons.includes("funding_pending"))
    return { key: "funding", tone: "pending", mode: open ? "managing" : "waiting", title: tr("Funding settlement in progress"), body: tr("Results aren't final yet.") };
  if (reasons.includes("market_prices_unavailable"))
    return { key: "prices", tone: "pending", mode: open ? "managing" : "waiting", title: tr("Some prices are unavailable"), body: tr("Open P&L may be out of date.") };
  if (open >= max) return { key: "max_open", tone: "ok", mode: "managing", title: tr("Managing {open} open trades", { open }), body: tr("The maximum; new entries wait.") };
  if (t.quota.remainingEntries <= 0)
    return { key: "quota", tone: "pending", mode: open ? "managing" : "waiting", title: tr("Hourly entry limit reached"), nextSlotAt: t.quota.nextEntrySlotAt };
  if (t.status === "active")
    return open
      ? { key: "managing", tone: "ok", mode: "managing", title: tr("Agent is managing your trades"), body: tr("{open} of {max} open", { open, max }) }
      : { key: "scanning", tone: "ok", mode: "scanning", title: tr("Agent is scanning the market") };
  if (t.status === "awaiting_engine") return { key: "starting", tone: "info", mode: "waiting", title: tr("Setting up your agent") };
  return { key: String(t.status), tone: "idle", mode: "paused", title: String(t.status).replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) };
}

/** What credited deposits still lack for real trading: max(0, minimum − credited), rounded up to the cent ("40", "39.5", "0"). */
export function realFundingNeed(t: Pick<Trial, "confirmedDeposits" | "minimumRealDeposit">): string {
  const left = sub(t.minimumRealDeposit, t.confirmedDeposits);
  return trimZeros(ceilTo(sign(left) > 0 ? left : "0", 2));
}

/** "12 of 50 trades used"; "All 50 trial trades used" once nothing is left (old accounts can be past the limit). */
export const trialUsage = (t: Pick<Trial, "used" | "limit" | "remaining">) =>
  t.remaining <= 0 ? tr("All {n} trial trades used", { n: t.limit }) : tr("{used} of {limit} trades used", { used: t.used, limit: t.limit });

/**
 * Home's trial card: a headline, the trades used ("5 / 50"), one short line on what's happening, and the one next step. `cta` is set
 * only when the server's next step is real funds, so a payment in progress is never replaced; `amount` prefills the deposit form
 * with what's missing.
 */
export type TrialView = {
  status: string;
  title: string;
  /** Trades used of the limit; after a deposit, the deposit total, which is what counts then. */
  counter: { value: string; label: string };
  pct: number;
  note: string;
  cta: { button: string; amount: string } | null;
};

/**
 * The trial in plain words, or null when there's nothing to show: no trial, real funds already in place, or a status this build
 * doesn't know. Counts come from the server as they are; the client never counts trades itself. Accounts from before the quota can
 * be past the limit: those read "50 / 50".
 */
export function trialCard(trial: Trial | null | undefined, cta: Pick<RecommendedCta, "code" | "reason">): TrialView | null {
  if (!trial) return null;
  const pct = trial.limit > 0 ? Math.min(100, Math.max(0, Math.round((trial.used / trial.limit) * 100))) : 0;
  const counter = { value: `${Math.min(trial.used, trial.limit)} / ${trial.limit}`, label: tr("trial trades used") };
  const min = fmt(trial.minimumRealDeposit, 0);
  const need = realFundingNeed(trial);
  const next = (button: string) => (cta.code === "continue_with_real_funds" ? { button, amount: need } : null);
  const realFunds = next(tr("Continue with real funds"));
  const running =
    trial.reserved > 0
      ? tr(trial.reserved === 1 ? "{n} entry being placed" : "{n} entries being placed", { n: trial.reserved })
      : tr("Your free trial includes {n} trade entries.", { n: trial.limit });
  const base = { status: trial.status, counter, pct };
  switch (trial.status) {
    case "ready":
      return { ...base, title: tr("Your XENO trial is ready"), note: running, cta: null };
    case "active":
      return { ...base, title: tr("XENO Trial is running"), note: running, cta: null };
    case "draining":
      return { ...base, title: tr("Trial entries completed"), note: tr("Finishing open trades and final settlements."), cta: realFunds };
    case "completed":
      return { ...base, title: tr("Your XENO trial is complete"), note: realFunds ? tr("Deposit {n} USDT to keep XENO trading.", { n: need }) : tr("XENO is paused until you add funds."), cta: realFunds };
    case "converted": {
      if (trial.realFundingReady) return null;
      // rounded down, so a credit just under the minimum never reads as reached (credits are what arrived, to 8 decimals)
      const funded = Math.min(99, Math.floor(ratio(trial.confirmedDeposits, trial.minimumRealDeposit) * 100));
      return {
        status: trial.status,
        title: tr("Almost ready for real trading"),
        counter: { value: `${trimZeros(fmt(floorTo(trial.confirmedDeposits, 2), 2))} / ${min}`, label: tr("USDT deposited") },
        pct: funded,
        note: tr("XENO waits until your deposits reach {min} USDT.", { min }),
        cta: next(tr("Deposit {n} USDT", { n: need })),
      };
    }
    default:
      return null;
  }
}

/**
 * An active trial doesn't mean XENO can enter right now, so "running" holds only while the agent works, the same rule as the orb's
 * green; otherwise just its name, and the orb says why. Not engine.blockedReason: the worker also writes routine steps there
 * (position_open, candle_already_evaluated), so it's rarely empty.
 */
export const trialTitle = (v: Pick<TrialView, "status" | "title">, mode: OrbMode) =>
  v.status === "active" && mode !== "scanning" && mode !== "managing" ? tr("XENO Trial") : v.title;

/**
 * The "How the trial works" page: a trial is free trades, not money. Numbers come from GET /trader; without them (still loading,
 * or no trial on the account) it says the same in words.
 */
export function trialGuide(t: Pick<Trader, "trial" | "trialProfitProtection"> | null | undefined) {
  const trial = t?.trial;
  const profit = t?.trialProfitProtection;
  const funding = trial ? `${fmt(trial.minimumRealDeposit, 0)} USDT` : tr("the required amount");
  const unlock = profit?.enabled ? `${fmt(profit.minimumDeposit, 0)} USDT` : funding;
  return {
    headline: trial ? tr("{n} free trades, not free money", { n: trial.limit }) : tr("Free trades, not free money"),
    lead: tr("Before you deposit, XENO trades for you so you can see how it works."),
    steps: [
      {
        title: trial ? tr("XENO makes up to {n} trades", { n: trial.limit }) : tr("XENO makes your trial trades"),
        text: trial
          ? tr("No deposit needed. A trade counts when it opens, not when it closes. Up to {h} new trades an hour, {o} open at once.", { h: trial.hourlyEntryLimit, o: trial.maxOpenPositions })
          : tr("No deposit needed. A trade counts when it opens, not when it closes."),
      },
      { title: tr("New trades stop"), text: tr("When they're used up, open trades finish on their own.") },
      { title: tr("Deposit to continue"), text: tr("XENO trades your real funds once your deposits reach {funding}. Any deposit ends the trial, even a small one.", { funding }) },
    ],
    faqs: [
      { q: tr("Is the trial money mine?"), a: tr("No. XENO trades with a Trial grant so you can see how it works. It isn't your money and can't be withdrawn.") },
      { q: tr("Why is my balance 0.00?"), a: tr("Account balance leaves out the Trial grant. It only counts your deposits and earnings, so it starts at 0.00.") },
      {
        q: tr("Can I withdraw my balance?"),
        a:
          profit && !profit.enabled
            ? tr("Only what Available to withdraw shows: your balance also counts open trades and locked amounts, so it can be higher and it moves.")
            : tr("First activate your account by depositing a total of {unlock}. Then, only what Available to withdraw shows: your balance also counts open trades and locked amounts, so it can be higher and it moves.", { unlock }),
      },
      {
        q: tr("What happens to trial profit?"),
        a: profit && !profit.enabled
          ? tr("It's added to your balance and follows the normal withdrawal rules.")
          : tr("It's added to your balance. You can withdraw it once your real deposits reach {unlock}. Other withdrawal rules still apply.", { unlock }),
      },
      { q: tr("What if a trial trade loses?"), a: tr("The loss lowers the Trial grant and any trial profit. Before you deposit, none of your own money is at risk.") },
    ],
  };
}

/**
 * Said under the deposit amount while it won't reach the real-trading total, and only to inform: the coin's own minimum is still
 * what the form checks. Any credited deposit ends the trial; XENO trades again only once credited deposits reach the minimum.
 */
export function realFundingNote(amount: string, trial: Trial | null | undefined): string | null {
  if (!trial || trial.realFundingReady || !isAmount(amount, 10, 2)) return null;
  const need = realFundingNeed(trial);
  if (cmp(amount, need) >= 0) return null;
  const min = fmt(trial.minimumRealDeposit, 0);
  return trial.status === "converted"
    ? tr("XENO trades again once your deposits total {min} USDT: {need} USDT to go.", { min, need })
    : tr("A credited deposit ends your trial. XENO trades again once your deposits total {min} USDT.", { min });
}

/** The first of the server's and the app's support links that is a real https URL; never "#", a guess or a dead link. */
export function supportHref(server: string | null | undefined, fallback: string): string | null {
  for (const v of [server, fallback]) {
    if (!v) continue;
    try {
      if (new URL(v).protocol === "https:") return v;
    } catch {}
  }
  return null;
}

const BLOCKED: Record<string, Key> = {
  migration_pending: "Withdrawals open once your previous trades finish settling.",
  funding_pending: "Funding is being settled. Withdrawals open again once it clears.",
  valuation_unavailable: "Fresh prices aren't available, so the withdrawable amount can't be confirmed yet.",
};

/** Why a withdrawal can't be asked for right now, or null. The server still checks again on POST. */
export function withdrawalBlock(
  t: Pick<Trader, "migrationState" | "withdrawalBlockedReason" | "withdrawalAvailable"> & { trialProfitProtection?: TrialProfitProtection | null },
): string | null {
  const reason: WithdrawalBlockedReason | null = t.migrationState !== "ready" ? "migration_pending" : t.withdrawalBlockedReason;
  if (reason === "trial_profit_locked") return trialProfitText(trialProfitLock(t.trialProfitProtection)) ?? tr("A deposit unlocks your trial profit, then it's yours to withdraw.");
  if (reason) return BLOCKED[reason] ? tr(BLOCKED[reason]) : tr("Withdrawals are unavailable: {reason}.", { reason: reason.replace(/_/g, " ") });
  return t.withdrawalAvailable ? null : tr("Withdrawals are unavailable right now.");
}

/**
 * Trial profit held back until real deposits reach the minimum (contract 2026-10-30), or null when there's nothing to say: the
 * rule is off, the condition is met or no profit is held. Amounts are the server's; the app never works them out.
 */
export function trialProfitLock(p: Pick<TrialProfitProtection, "enabled" | "fundingConditionMet" | "lockedProfit" | "depositRemaining" | "minimumDeposit"> | null | undefined) {
  if (!p?.enabled || p.fundingConditionMet || !(sign(p.lockedProfit) > 0)) return null;
  // amount: what to prefill in the deposit form, rounded up to the cent so it really reaches the minimum
  return { locked: p.lockedProfit, remaining: p.depositRemaining, minimum: p.minimumDeposit, amount: trimZeros(ceilTo(p.depositRemaining, 2)) };
}

/**
 * An invitation, never a demand: "Unlock your trial profit with a 50 USDT deposit, then it's yours to withdraw.", or "Just 30 USDT
 * more…" once some has been deposited. The amount is the one the deposit form opens with.
 */
export const trialProfitText = (l: ReturnType<typeof trialProfitLock>) =>
  l &&
  (cmp(l.remaining, l.minimum) < 0
    ? tr("Just {amount} USDT more unlocks your trial profit, then it's yours to withdraw.", { amount: l.amount })
    : tr("Unlock your trial profit with a {amount} USDT deposit, then it's yours to withdraw.", { amount: l.amount }));

/**
 * The figure beside open trades on Statement: the profit made on trial trades while it's held back, the same number as Home and
 * Wallet. Once the account is activated the server reports that as 0 though the profit was real, so the balance takes its place.
 * Never the account value: the grant is in it.
 */
export function statementFigure(t: { balances: Pick<Balances, "nonTrialEquity">; trialProfitProtection?: TrialProfitProtection | null }) {
  const p = t.trialProfitProtection;
  return p?.enabled && !p.fundingConditionMet
    ? { label: "Trial profit" as const, value: p.lockedProfit as string | null, profit: true }
    : { label: "Account balance" as const, value: t.balances.nonTrialEquity, profit: false };
}

/**
 * A new withdrawal asks for the account to be activated first: real deposits reaching the minimum, for every account. Product decision
 * of 2026-11-01, deliberately stricter than contract 2026-10-30, which would let other income (referrals) leave: the server still
 * accepts those, only the app doesn't offer them. Past withdrawals stay openable.
 */
export function withdrawActivation(t: { trialProfitProtection?: TrialProfitProtection | null }): { amount: string; step: string } | null {
  const p = t.trialProfitProtection;
  if (!p?.enabled || p.fundingConditionMet) return null;
  const amount = trimZeros(ceilTo(p.depositRemaining, 2));
  return { amount, step: cmp(p.depositRemaining, p.minimumDeposit) < 0 ? tr("To activate, you need to deposit at least {amount} USDT more.", { amount }) : tr("To activate, you need to deposit at least {amount} USDT.", { amount }) };
}

/** The same condition under Wallet's "Trial profit awaiting funding" row, with what's still to deposit in it. */
export const trialProfitFundingText = (l: ReturnType<typeof trialProfitLock>) =>
  l &&
  (cmp(l.remaining, l.minimum) < 0
    ? tr("Continue with real funds: deposit {amount} USDT more to meet the withdrawal requirement.", { amount: l.amount })
    : tr("Continue with real funds: deposit {amount} USDT to meet the withdrawal requirement.", { amount: l.amount }));

/** The server's withdrawal message, in plain words where we know it (no error codes exist for these yet). */
export function withdrawalErrorText(message: string): string {
  if (/trial principal/i.test(message)) return tr("Not enough withdrawable balance. The Trial grant itself can't be withdrawn.");
  if (/fresh prices unavailable/i.test(message)) return tr("Fresh prices aren't available, so nothing was reserved. Try again in a moment.");
  if (/funding/i.test(message)) return tr("Funding is being settled. Try again once it clears.");
  if (/migrat/i.test(message)) return tr("Your previous trades are still settling. Try again once that finishes.");
  return serverText(message);
}

// short: the name under a step on Home's setup track
const STEPS: Record<string, { title: Key; short: Key; body?: Key }> = {
  account_created: { title: "Account created", short: "Account" },
  tutorial_watched: { title: "Watch the tutorial", short: "Tutorial", body: "1 minute" },
  fund_account: { title: "Make a deposit", short: "Deposit", body: "Trial grant doesn't count" },
  trader_ready: { title: "Agent ready", short: "Agent ready" },
};
export const onboardingStep = (key: OnboardingStepKey) => {
  const s = STEPS[key];
  if (s) return { title: tr(s.title), short: tr(s.short), body: s.body ? tr(s.body) : "" };
  const plain = key.replace(/_/g, " ");
  return { title: plain, short: plain, body: "" };
};

/** Home's setup card: done steps first (in server order), then the open ones; `next` is the first open one. */
export function setupTrack<T extends { key: string; complete: boolean }>(steps: T[]) {
  const ordered = [...steps.filter((s) => s.complete), ...steps.filter((s) => !s.complete)];
  const n = ordered.length;
  const done = n - steps.filter((s) => !s.complete).length;
  return { ordered, done, pct: n ? Math.round((done / n) * 100) : 0, next: ordered[done]?.key ?? null };
}

/** Older than this, a feed item isn't news any more and stays out of the live bar. */
export const FEED_MAX_AGE_MS = 24 * 3_600_000;
/** Within this, the line may say "just". */
const JUST_MS = 2 * 60_000;

/**
 * `kind` picks the icon and colour. `value`: a withdrawal's or deposit's amount, a profit's ROI (never its amount) or a review's
 * rating. `pending`: a withdrawal still on its way.
 */
export type TickerLine = {
  kind: "profit" | "withdrawal" | "deposit" | "feedback";
  name: string;
  out: boolean;
  pending: boolean;
  verb: string;
  value: string;
  coin: string | null;
  when: string | null;
};

const PROCESSING = new Set(["queued", "signed", "broadcast"]);

/** A public withdrawal worth showing: confirmed, or processing in one of its public states; null for anything else (OTP, failed, review…). */
export function withdrawalState(i: Pick<CommunityItem, "type" | "status">): "confirmed" | "processing" | null {
  if (i.type === "withdrawal") return i.status == null || i.status === "confirmed" ? "confirmed" : null;
  if (i.type === "withdrawal_processing") return i.status && PROCESSING.has(i.status) ? "processing" : null;
  return null;
}

/** The server's eventKey; one key per withdrawal across its processing and confirmed versions, so a status change updates in place. */
export const feedKey = (i: Pick<CommunityItem, "type" | "id" | "eventKey">) =>
  i.eventKey ?? (i.type === "withdrawal" || i.type === "withdrawal_processing" ? `withdrawal:${i.id}` : `${i.type}:${i.id}`);

/** One item per feedKey, where it first appears; a confirmed withdrawal replaces its processing version. */
export function dedupeFeed<T extends Pick<CommunityItem, "type" | "id" | "eventKey">>(items: T[]): T[] {
  const at = new Map<string, number>();
  const out: T[] = [];
  for (const i of items) {
    const k = feedKey(i);
    const n = at.get(k);
    if (n == null) {
      at.set(k, out.length);
      out.push(i);
    } else if (i.type === "withdrawal" && out[n].type === "withdrawal_processing") out[n] = i;
  }
  return out;
}

/** What each row needs, for the types this build can draw; anything else is left out rather than drawn as a profit or withdrawal. */
const drawable = (i: CommunityItem) =>
  i.type === "trade_profit" || (i.type === "deposit" && i.amount != null) || (i.type === "feedback" && i.rating != null) || (!!withdrawalState(i) && i.amount != null);

/**
 * A community tab's rows, newest first: a freshly polled first page (`head`, once more pages are loaded) on top of the pages as
 * read, one row per eventKey. `type` is the filter the tab asked the server for (none for the mixed Live tab; withdrawal covers
 * processing ones too), checked again here so a tab never shows another type.
 */
export function feedRows(type: FeedType | undefined, head: CommunityItem[] | undefined, pages: { items: CommunityItem[] }[] | undefined): CommunityItem[] {
  const ofTab = (i: CommunityItem) => !type || (type === "withdrawal" ? !!withdrawalState(i) : i.type === type);
  return dedupeFeed([...(head ?? []), ...(pages ?? []).flatMap((p) => p.items)]).filter((i) => ofTab(i) && drawable(i));
}

/**
 * One line of the live bar for another user's settled profit, credited deposit, approved review or withdrawal: "Sar*** just
 * withdrew 99.50 USDT", "Ali*** is withdrawing 84.00 USDT · 12m ago", "Par*** earned +2.40% on ETH · 5m ago", "Kam*** deposited
 * 49.39 USDT", "Nil*** rated XENO 4/5". A profit shows its ROI, never the amount, and stays out without one; a deposit is never
 * called a profit. "just" only when it really is recent; null when too old, unknown or a type this build doesn't know.
 */
export function tickerLine(
  i: Pick<CommunityItem, "type" | "status" | "name" | "amount" | "asset" | "symbol" | "roiPercent" | "rating" | "occurredAt">,
  now: number,
): TickerLine | null {
  const ago = now - Date.parse(i.occurredAt);
  if (!(ago <= FEED_MAX_AGE_MS)) return null;
  const just = ago <= JUST_MS;
  const when = just ? null : ago < 3_600_000 ? tr("{n}m ago", { n: Math.max(1, Math.floor(ago / 60_000)) }) : tr("{n}h ago", { n: Math.floor(ago / 3_600_000) });
  const base = { name: i.name, out: false, pending: false, coin: null, when };
  const w = withdrawalState(i);
  if (w) {
    if (i.amount == null) return null;
    const pending = w === "processing";
    return { ...base, kind: "withdrawal", out: true, pending, verb: tr(pending ? "is withdrawing" : just ? "just withdrew" : "withdrew"), value: `${fmt(i.amount)} ${i.asset ?? "USDT"}` };
  }
  if (i.type === "trade_profit" && i.roiPercent != null)
    return { ...base, kind: "profit", verb: tr(just ? "just earned" : "earned"), value: roiText(i.roiPercent), coin: i.symbol?.replace(/USDT$/, "") ?? null };
  if (i.type === "deposit" && i.amount != null) return { ...base, kind: "deposit", verb: tr(just ? "just deposited" : "deposited"), value: `${fmt(i.amount)} ${i.asset ?? "USDT"}` };
  if (i.type === "feedback" && i.rating != null) return { ...base, kind: "feedback", verb: tr("rated XENO"), value: `${i.rating}/5` };
  return null;
}

/**
 * A closed trade's ROI on its initial margin (the entry notional for older trades without one), computed like the server's
 * for profit events; null without a positive margin. Display only.
 */
export function positionRoi(p: Pick<Position, "net_pnl" | "margin_amount" | "entry_notional">): string | null {
  const margin = p.margin_amount ?? p.entry_notional;
  if (p.net_pnl == null || !margin || sign(margin) <= 0) return null;
  // net ÷ (margin ÷ 100): margin ÷ 100 is exact at 18 decimals
  return div(p.net_pnl, div(margin, "100", 18)!, 8);
}

/** An ROI the server already gives as a percentage ("2.40000000" → "+2.40%"); unknown stays "—", never 0%. */
export const roiText = (v: string | null | undefined) => (v == null ? "—" : `${fmt(v, 2, { sign: true })}%`);

const ON_TRIAL: Key = "XENO is trading on your free trial";
const SOURCE: Record<SourceMode, Key> = {
  trial: ON_TRIAL,
  trial_with_profits: ON_TRIAL,
  mixed: "XENO is trading your funds",
  real: "XENO is trading your real funds",
  empty: "Add funds to continue trading",
  unavailable: "Updating your trading balance",
};

/** What XENO is trading with. While it can't trade, its real state instead: never "is trading" then. */
export function tradingSource(t: S & { balances: Pick<Balances, "sourceMode"> }): string {
  if (t.migrationState !== "ready" || t.status !== "active" || !t.engine.entriesEnabled) return traderState(t).title;
  // the grant can run out before the trial does: what's left is still no deposit, so never "real funds"
  if (t.trial && t.trial.status !== "converted") return tr(t.trial.status === "ready" ? "XENO is looking for its first trade" : ON_TRIAL);
  return tr(SOURCE[t.balances.sourceMode] ?? SOURCE.unavailable);
}

/** fund: adding capital, the main way off the trial; pending: something of the user's is waiting; info: a place to look. */
export type CtaKind = "fund" | "pending" | "info";
/** `button` is the full action; `short` is the same action in a word or two for the slim banner's pill. */
type Cta = { kind: CtaKind; title: string; text: string; button: string; short: string };
type CtaKeys = { kind: CtaKind; title: Key; text: Key; button: Key; short: Key };

// The server picks the code; the wording is ours. No promise of profit, and never "deposit to win back a loss".
const CTA: Record<CtaCode, CtaKeys> = {
  continue_deposit: { kind: "pending", title: "Complete your deposit", text: "Your deposit address is ready. Complete your payment.", button: "Continue deposit", short: "Continue" },
  deposit_processing: { kind: "info", title: "Deposit in progress", text: "Your deposit is being processed or needs a status check.", button: "View deposit", short: "View" },
  track_withdrawal: { kind: "info", title: "Withdrawal in progress", text: "Check the status of your withdrawal.", button: "Track withdrawal", short: "Track" },
  view_trader_status: { kind: "pending", title: "Trading status update", text: "Check XENO's current trading status.", button: "View status", short: "View" },
  restore_capital: { kind: "pending", title: "Trading capital is low", text: "Your withdrawal reduced trading capital below the required level.", button: "Fund XENO", short: "Fund XENO" },
  review_performance: { kind: "info", title: "Your recent results", text: "Review your recent trading results.", button: "View statement", short: "View" },
  retry_deposit: { kind: "info", title: "Deposit incomplete", text: "Your previous deposit was not completed.", button: "New deposit", short: "Deposit" },
  // fund: a short hook and one line for Home's banner; adding capital tops up the same XENO, never a second agent
  fund_after_trial: { kind: "fund", title: "Keep XENO trading", text: "Add your own funds to continue.", button: "Fund XENO", short: "Fund XENO" },
  fund_profitable_trial: { kind: "fund", title: "Your trial is in profit", text: "Start real trading with your own funds.", button: "Add your funds", short: "Add funds" },
  fund_trial: { kind: "fund", title: "Like what you see?", text: "Start real trading with your own funds.", button: "Fund XENO", short: "Fund XENO" },
  add_after_withdrawal: { kind: "fund", title: "Withdrawal done", text: "You can add capital to XENO any time.", button: "Add capital", short: "Add funds" },
  add_to_profitable_account: { kind: "fund", title: "Add to your XENO", text: "You can add more capital to your existing XENO.", button: "Add capital", short: "Add funds" },
  add_capital: { kind: "fund", title: "Add to your XENO", text: "Add funds to your existing XENO when you are ready.", button: "Add capital", short: "Add funds" },
  // the amounts are on Home's trial profit card and in the deposit form, which opens with what's missing
  fund_to_unlock_trial_profit: { kind: "fund", title: "Unlock your trial profit", text: "A deposit makes it yours to withdraw", button: "Fund XENO", short: "Fund XENO" },
  // Home's trial card shows this one in full; the banner words are only the fallback when that card isn't there
  continue_with_real_funds: {
    kind: "fund",
    title: "Continue with real funds — 50 USDT",
    text: "Your trial is complete. Keep XENO trading with your own funds.",
    button: "Continue with real funds — 50 USDT",
    short: "Continue",
  },
};

/** The words for the server's recommended next step; null for a code this build doesn't know (then nothing is shown). */
export function ctaCopy(code: string): Cta | null {
  const c = CTA[code as CtaCode];
  return c ? { kind: c.kind, title: tr(c.title), text: tr(c.text), button: tr(c.button), short: tr(c.short) } : null;
}
