// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { bountyActive, earningNote, programActive, qualificationLabel, rewardState, tierProgress } from "./partner.ts";

const tier = (qualifiedCount: number, minimum: number | null, next: { minimum: number; remaining: number } | null) => ({
  id: "partner",
  name: "Partner",
  qualifiedCount,
  commissionBps: 3000,
  minimum,
  maximum: 9,
  next: next && { id: "pro_partner", name: "Pro Partner", commissionBps: 4000, ...next },
});

test("the tiered program and its reward show only when the server says they're on", () => {
  assert.equal(programActive({ program: { active: true, state: "active", policyVersion: 2, activatedAt: "x", preparedVersion: 2, bountyEnabled: true } }), true);
  // an older server without the field, or a prepared program, is the flat legacy rate
  assert.equal(programActive({}), false);
  assert.equal(programActive({ program: { active: false, state: "prepared", policyVersion: 1, activatedAt: null, preparedVersion: 2, bountyEnabled: false } }), false);
  const program = { active: true, state: "active", policyVersion: 2, activatedAt: "x", preparedVersion: 2, bountyEnabled: true };
  const bounty = (enabled: boolean) => ({ amount: "1.00000000", enabled, paidCount: 0, qualifiedUnpaidCount: 0, qualifiedUnpaidAmount: "0", destination: "main_trading_balance", newPrincipalLock: false });
  assert.equal(bountyActive({ program, bounty: bounty(true) }), true);
  assert.equal(bountyActive({ program, bounty: bounty(false) }), false);
  assert.equal(bountyActive({ program: { ...program, active: false }, bounty: bounty(true) }), false);
});

test("tier progress runs from this tier's minimum to the next one's", () => {
  // Partner starts at 3, Pro Partner at 10: 3 of 7 steps done at 6
  const p = tierProgress(tier(6, 3, { minimum: 10, remaining: 4 }));
  assert.ok(p);
  assert.equal(p.remaining, 4);
  assert.equal(p.next.name, "Pro Partner");
  assert.ok(Math.abs(p.ratio - 3 / 7) < 1e-9);
  assert.equal(tierProgress(tier(3, 3, { minimum: 10, remaining: 7 }))?.ratio, 0);
  // top tier and the legacy tier have no next step
  assert.equal(tierProgress(tier(30, 25, null)), null);
  assert.equal(tierProgress(undefined), null);
});

test("qualification uses the server's status, worded as the contract asks", () => {
  assert.deepEqual(qualificationLabel("qualified"), { label: "Qualified", tone: "ok" });
  assert.equal(qualificationLabel("awaiting_settled_trade").label, "Awaiting a settled funded trade");
  assert.equal(qualificationLabel("awaiting_funding").label, "Awaiting qualifying deposit");
  assert.equal(qualificationLabel("something_new").label, "something new");
});

test("a qualified friend's reward is paid or pending, never an error", () => {
  assert.equal(rewardState({ qualified: true, bountyPaid: true }), "paid");
  assert.equal(rewardState({ qualified: true, bountyPaid: false }), "pending");
  assert.equal(rewardState({ qualified: false, bountyPaid: false }), null);
});

test("an earning shows its own rate, and nothing is guessed for old rows", () => {
  const base = { id: "e1", amount: "0.48000000", asset: "USDT", createdAt: "2026-10-27T10:00:00.000Z", referredUserId: null, qualifiedCount: 3 };
  assert.equal(earningNote({ ...base, type: "commission", policyVersion: 2, grossFee: "1.60000000", commissionBps: 3000 }), "30% of a 1.60 USDT fee");
  // the legacy 15%: no gross fee was recorded
  assert.equal(earningNote({ ...base, type: "commission", policyVersion: 1, grossFee: null, commissionBps: 1500, qualifiedCount: null }), "15% · earlier program");
  assert.equal(earningNote({ ...base, type: "bounty", policyVersion: 2, grossFee: null, commissionBps: null, qualifiedCount: null }), "One-time reward");
  // small fees keep their digits
  assert.equal(earningNote({ ...base, type: "commission", policyVersion: 2, grossFee: "0.01600000", commissionBps: 2000 }), "20% of a 0.016 USDT fee");
});
