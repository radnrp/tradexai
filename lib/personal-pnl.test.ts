// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { actualNet, coverOf, pnlNote, positionPnl } from "./personal-pnl.ts";

const closed = { status: "closed", funding_state: "settled", pnl_status: "settled", unrealizedNetEstimate: null };
const open = { status: "open", net_pnl: null };

test("a fully covered closed loss: personal zero, the actual loss and the cover beside it", () => {
  const v = positionPnl({ ...closed, net_pnl: "0.00000000", account_net_pnl: "-2.00000000", trial_loss_covered: "2.00000000" });
  assert.deepEqual(v, { value: "0.00000000", actual: "-2.00000000", cover: "2.00000000", state: "settled" });
  assert.equal(pnlNote(v), "Trade −2.00 · Trial grant covered 2.00");
});

test("a partial cover keeps the rest of the loss in personal P&L", () => {
  const v = positionPnl({ ...closed, net_pnl: "-1.50000000", account_net_pnl: "-2.00000000", trial_loss_covered: "0.50000000" });
  assert.equal(v.value, "-1.50000000");
  assert.equal(pnlNote(v), "Trade −2.00 · Trial grant covered 0.50");
});

test("no cover, no note", () => {
  const v = positionPnl({ ...closed, net_pnl: "3.00000000", account_net_pnl: "3.00000000", trial_loss_covered: "0.00000000" });
  assert.equal(v.cover, null);
  assert.equal(pnlNote(v), null);
});

test("pending funding keeps its number and says so, never zero", () => {
  const v = positionPnl({ ...closed, funding_state: "pending", pnl_status: "pending_funding", net_pnl: "-2.00000000", account_net_pnl: "-2.00000000", trial_loss_covered: "0.00000000" });
  assert.equal(v.state, "funding_pending");
  assert.equal(v.value, "-2.00000000");
  // an older response without pnl_status still reads funding_state
  assert.equal(positionPnl({ status: "closed", funding_state: "pending", net_pnl: "-2.00000000", unrealizedNetEstimate: null }).state, "funding_pending");
});

test("open trade: the estimated cover is marked as an estimate", () => {
  const v = positionPnl({ ...open, unrealizedNetEstimate: "-0.40000000", accountUnrealizedNetEstimate: "-1.20000000", trialLossCoveredEstimate: "0.80000000", pnlStatus: "estimate" });
  assert.deepEqual(v, { value: "-0.40000000", actual: "-1.20000000", cover: "0.80000000", state: "estimate" });
  assert.equal(pnlNote(v), "Trade −1.20 · Trial grant covers ~0.80");
});

test("open trade with the cover unknown: personal is pending, the trade's own estimate stays visible", () => {
  const v = positionPnl({ ...open, unrealizedNetEstimate: null, accountUnrealizedNetEstimate: "-1.20000000", trialLossCoveredEstimate: null, pnlStatus: "coverage_unavailable" });
  assert.equal(v.value, null);
  assert.equal(v.state, "cover_pending");
  assert.equal(pnlNote(v), "Trade −1.20 · Trial grant cover being checked");
});

test("open trade without a price is pending, not zero", () => {
  const v = positionPnl({ ...open, unrealizedNetEstimate: null, accountUnrealizedNetEstimate: null, trialLossCoveredEstimate: null, pnlStatus: "coverage_unavailable" });
  assert.equal(v.state, "no_price");
  assert.equal(pnlNote(v), null);
});

test("an older response without the new fields reads as it did: actual = net, no cover", () => {
  assert.deepEqual(positionPnl({ status: "closed", net_pnl: "-2.00000000", funding_state: "settled", unrealizedNetEstimate: null }), {
    value: "-2.00000000",
    actual: "-2.00000000",
    cover: null,
    state: "settled",
  });
  assert.equal(positionPnl({ ...open, unrealizedNetEstimate: "-1.00000000" }).actual, "-1.00000000");
  assert.equal(actualNet({ net_pnl: "-2.00000000" }), "-2.00000000");
  assert.equal(actualNet({ net_pnl: "0.00000000", account_net_pnl: "-2.00000000" }), "-2.00000000");
  assert.equal(actualNet({ net_pnl: null, account_net_pnl: null }), null);
});

test("cover lines only for a positive cover", () => {
  assert.equal(coverOf("2.00000000"), "2.00000000");
  assert.equal(coverOf("0.00000000"), null);
  assert.equal(coverOf(null), null);
  assert.equal(coverOf(undefined), null);
});
