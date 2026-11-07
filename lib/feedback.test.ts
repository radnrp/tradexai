// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFeedback, countOpen, feedbackCooldown, feedbackProblem, feedbackStatus, neverSentFeedback, promptShown } from "./feedback.ts";

test("a rating of 1 to 5 and 10–2000 characters after trimming", () => {
  assert.equal(feedbackProblem(4, "Works well for me"), null);
  assert.equal(feedbackProblem(0, "Works well for me"), "Choose a rating");
  assert.equal(feedbackProblem(6, "Works well for me"), "Choose a rating");
  assert.equal(feedbackProblem(3.5, "Works well for me"), "Choose a rating");
  // spaces around it don't count
  assert.equal(feedbackProblem(5, "   short    "), "At least 10 characters");
  assert.equal(feedbackProblem(5, "x".repeat(2000)), null);
  assert.equal(feedbackProblem(5, "x".repeat(2001)), "At most 2000 characters");
  assert.equal(feedbackProblem(5, "fine\u0007 and more text"), "Remove special characters");
  // new lines and tabs are fine
  assert.equal(feedbackProblem(5, "line one\nline\ttwo"), null);
});

test("the text goes as NFC, trimmed", () => {
  assert.equal(cleanFeedback("  café is good  "), "café is good");
});

test("cooldown only while the server's next time is ahead", () => {
  const now = Date.parse("2026-10-30T12:00:00.000Z");
  assert.equal(feedbackCooldown({ nextEligibleAt: "2026-11-02T12:00:00.000Z" }, now), "2026-11-02T12:00:00.000Z");
  assert.equal(feedbackCooldown({ nextEligibleAt: "2026-10-29T12:00:00.000Z" }, now), null);
  assert.equal(feedbackCooldown({ nextEligibleAt: null }, now), null);
  assert.equal(feedbackCooldown(undefined, now), null);
});

test("review states in plain words", () => {
  assert.equal(feedbackStatus("pending").label, "In review");
  assert.equal(feedbackStatus("approved").tone, "ok");
  assert.equal(feedbackStatus("rejected").label, "Rejected");
  assert.equal(feedbackStatus("something_new").label, "something new");
});

test("the rating popup is due on every 5th open or after 3 days, whichever comes first", () => {
  const t0 = Date.parse("2026-10-30T12:00:00.000Z");
  const hour = 3_600_000;
  // the first open starts the clock and isn't due
  let r = countOpen(null, t0);
  assert.deepEqual(r, { memo: { opens: 1, since: t0 }, due: false });
  for (let n = 2; n <= 4; n++) {
    r = countOpen(r.memo, t0 + n * hour);
    assert.equal(r.due, false, `open ${n}`);
  }
  r = countOpen(r.memo, t0 + 5 * hour);
  assert.equal(r.due, true);
  // once shown it starts over: the next 4 opens aren't due, the 5th is
  let m = promptShown(t0 + 5 * hour);
  for (let n = 1; n <= 4; n++) {
    r = countOpen(m, t0 + (5 + n) * hour);
    m = r.memo;
    assert.equal(r.due, false, `after shown, open ${n}`);
  }
  assert.equal(countOpen(m, t0 + 10 * hour).due, true);
  // or 3 days later, even on the second open
  assert.equal(countOpen({ opens: 1, since: t0 }, t0 + 72 * hour).due, true);
  assert.equal(countOpen({ opens: 1, since: t0 }, t0 + 71 * hour).due, false);
  // a broken memo starts again rather than firing
  assert.deepEqual(countOpen({ opens: Number.NaN, since: t0 }, t0 + hour), { memo: { opens: 1, since: t0 + hour }, due: false });
});

test("only someone who has never sent feedback is asked", () => {
  assert.equal(neverSentFeedback({ nextEligibleAt: null }), true);
  assert.equal(neverSentFeedback({ nextEligibleAt: "2026-11-02T12:00:00.000Z" }), false);
  // unknown: don't ask
  assert.equal(neverSentFeedback(undefined), false);
});
