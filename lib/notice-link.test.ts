// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { noticeDeposit, noticeLanding, noticeTarget } from "./notice-link.ts";

const token = "0123456789abcdef0123456789abcdef";

test("only an exact ntf_<32 hex>_<target> start param is a notification link", () => {
  assert.equal(noticeTarget(`ntf_${token}_home`), "home");
  assert.equal(noticeTarget(`ntf_${token}_statement`), "statement");
  assert.equal(noticeTarget(`ntf_${token}_deposit`), "deposit");
  assert.equal(noticeTarget(`ntf_${token}_feedback`), "feedback");
  // referral codes and campaigns keep their own meaning
  assert.equal(noticeTarget("ABCD1234"), null);
  assert.equal(noticeTarget("cmp_launch_20261025"), null);
  assert.equal(noticeTarget(undefined), null);
  assert.equal(noticeTarget(""), null);
  // no settings or support target, no upper case, no short or long token, nothing around it
  assert.equal(noticeTarget(`ntf_${token}_settings`), null);
  assert.equal(noticeTarget(`ntf_${token}_support`), null);
  assert.equal(noticeTarget(`ntf_${token.toUpperCase()}_home`), null);
  assert.equal(noticeTarget(`ntf_${token.slice(1)}_home`), null);
  assert.equal(noticeTarget(`ntf_${token}0_home`), null);
  assert.equal(noticeTarget(`ntf_${token}_home `), null);
  assert.equal(noticeTarget(`xntf_${token}_home`), null);
});

test("a checked link lands on its page; a deposit opens the payment by id, or a new deposit without one", () => {
  assert.deepEqual(noticeLanding("home", { target: "home", depositId: null, noticeKind: "daily_statement" }), { path: "/", deposit: null });
  assert.deepEqual(noticeLanding("statement", { target: "statement", depositId: null, noticeKind: "daily_statement" }), { path: "/statements", deposit: null });
  assert.deepEqual(noticeLanding("deposit", { target: "deposit", depositId: "d-1", noticeKind: "deposit_waiting" }), { path: "/", deposit: { id: "d-1" } });
  assert.deepEqual(noticeLanding("deposit", { target: "deposit", depositId: null, noticeKind: "trial_completed" }), { path: "/", deposit: { id: null } });
  assert.deepEqual(noticeLanding("feedback", { target: "feedback", depositId: null, noticeKind: "feedback_requested" }), { path: "/feedback", deposit: null });
});

test("a link the server turns down goes back to Home", () => {
  assert.deepEqual(noticeLanding("statement", null), { path: "/", deposit: null });
  assert.deepEqual(noticeLanding("deposit", null), { path: "/", deposit: null });
  // an answer naming a target this app doesn't know is treated the same
  assert.deepEqual(noticeLanding("statement", { target: "settings", depositId: null, noticeKind: "x" }), { path: "/", deposit: null });
  assert.deepEqual(noticeLanding("statement", { target: "constructor", depositId: null, noticeKind: "x" }), { path: "/", deposit: null });
});

test("server unreachable: the page still follows the link, but no deposit opens without the server's say", () => {
  assert.deepEqual(noticeLanding("statement", undefined), { path: "/statements", deposit: null });
  assert.deepEqual(noticeLanding("home", undefined), { path: "/", deposit: null });
  assert.deepEqual(noticeLanding("deposit", undefined), { path: "/", deposit: null });
  assert.deepEqual(noticeLanding("feedback", undefined), { path: "/feedback", deposit: null });
});

test("a deposit link opens the named payment, one under way, or a new one; an old trial-profit reminder only while it's true", () => {
  const free = { pending: null, lock: null };
  assert.deepEqual(noticeDeposit({ id: "d-1" }, "deposit_waiting", undefined), { id: "d-1" });
  assert.deepEqual(noticeDeposit({ id: null }, "trial_completed", free), {});
  assert.deepEqual(noticeDeposit({ id: null }, "trial_completed", undefined), {});
  // never a second payment next to one under way
  assert.deepEqual(noticeDeposit({ id: null }, "trial_completed", { pending: { id: "d-2" }, lock: null }), { id: "d-2" });
  const locked = { pending: null, lock: { amount: "30" } };
  assert.deepEqual(noticeDeposit({ id: null }, "trial_profit_unlock", locked), { amount: "30" });
  assert.deepEqual(noticeDeposit({ id: null }, "trial_profit_unlock", { ...locked, pending: { id: "d-3" } }), { id: "d-3" });
  // the condition was met since the message went out, or it can't be checked: nothing opens
  assert.equal(noticeDeposit({ id: null }, "trial_profit_unlock", free), null);
  assert.equal(noticeDeposit({ id: null }, "trial_profit_unlock", undefined), null);
});
