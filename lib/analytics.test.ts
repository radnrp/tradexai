// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { campaignCode, isUuid4, quietly, uuid4 } from "./analytics.ts";

test("campaign code comes only from cmp_ start params", () => {
  assert.equal(campaignCode("cmp_launch_20261025"), "launch_20261025");
  assert.equal(campaignCode("cmp_a-b_C9"), "a-b_C9");
  // a referral code keeps its old meaning and is never a campaign
  assert.equal(campaignCode("ABCD1234"), undefined);
  assert.equal(campaignCode("cmp_"), undefined);
  // the server would turn the whole visit down (400), so a malformed code is left out instead
  assert.equal(campaignCode("cmp_bad code"), undefined);
  assert.equal(campaignCode("cmp_" + "a".repeat(41)), undefined);
  assert.equal(campaignCode("cmp_" + "a".repeat(40)), "a".repeat(40));
  assert.equal(campaignCode(undefined), undefined);
  assert.equal(campaignCode(null), undefined);
});

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("uuid4 is a v4 UUID, with or without randomUUID", () => {
  assert.match(uuid4(), V4);
  // older WebViews have getRandomValues but no randomUUID
  for (let n = 0; n < 50; n++) assert.match(uuid4({ getRandomValues: (a) => crypto.getRandomValues(a) }), V4);
  assert.notEqual(uuid4(), uuid4());
});

test("isUuid4 accepts only what the server takes as a visit id", () => {
  assert.equal(isUuid4(uuid4()), true);
  assert.equal(isUuid4("8f14e45f-ceea-467a-9575-3b9d6a2f1c2e"), true);
  assert.equal(isUuid4("8f14e45f-ceea-167a-9575-3b9d6a2f1c2e"), false); // v1
  assert.equal(isUuid4("not-a-uuid"), false);
  assert.equal(isUuid4(undefined), false);
});

test("quietly retries only retryable errors and never throws", async () => {
  let n = 0;
  const ok = await quietly(
    async () => {
      if (++n < 3) throw new Error("net");
    },
    { tries: 3, delayMs: 0, retryable: () => true },
  );
  assert.equal(ok, true);
  assert.equal(n, 3);

  n = 0;
  const final = await quietly(
    async () => {
      n++;
      throw new Error("400");
    },
    { tries: 3, delayMs: 0, retryable: () => false },
  );
  assert.equal(final, false);
  assert.equal(n, 1);

  n = 0;
  const down = await quietly(
    async () => {
      n++;
      throw new Error("net");
    },
    { tries: 3, delayMs: 0, retryable: () => true },
  );
  assert.equal(down, false);
  assert.equal(n, 3);
});
