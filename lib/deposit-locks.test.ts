// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { lockRows, timeLeft } from "./deposit-locks.ts";

const NOW = Date.parse("2026-10-27T10:00:00.000Z");

test("time left reads in the largest two units, and is gone once it passes", () => {
  assert.equal(timeLeft("2026-11-03T09:30:00.000Z", NOW), "6d 23h");
  assert.equal(timeLeft("2026-10-27T15:12:00.000Z", NOW), "5h 12m");
  assert.equal(timeLeft("2026-10-27T10:04:10.000Z", NOW), "4m 10s");
  // the device clock never frees anything: past means "ask the server again"
  assert.equal(timeLeft("2026-10-27T10:00:00.000Z", NOW), null);
  assert.equal(timeLeft("2026-10-26T10:00:00.000Z", NOW), null);
});

test("every deposit keeps its own clock, soonest first", () => {
  const rows = lockRows({
    items: [
      { depositId: "b", amount: "20.00000000", creditedAt: "2026-10-26T00:00:00.000Z", unlockAt: "2026-11-02T00:00:00.000Z" },
      { depositId: "a", amount: "100.00000000", creditedAt: "2026-10-25T00:00:00.000Z", unlockAt: "2026-11-01T00:00:00.000Z" },
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.depositId),
    ["a", "b"],
  );
});
