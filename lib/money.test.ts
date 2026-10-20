// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { add, cmp, div, fmt, fmtPrice, isAmount, mulBps, normalizeAmountInput, ratio, sub, toUnits, trimZeros } from "./money.ts";

test("exact add/sub without float drift", () => {
  assert.equal(add("0.1", "0.2"), "0.30000000");
  assert.equal(sub("10.00", "0.50000000"), "9.50000000");
  assert.equal(sub("1", "2.5"), "-1.50000000");
});

test("compare, bps and ratio", () => {
  assert.equal(cmp("100.00", "100"), 0);
  assert.equal(cmp("99.99999999", "100"), -1);
  assert.equal(mulBps("250", 2000), "50.00000000");
  assert.equal(mulBps("1", 3), "0.00030000");
  assert.equal(ratio("25", "100"), 0.25);
  assert.equal(ratio("1", "0"), 0);
});

test("rounding beyond scale is half-up", () => {
  assert.equal(toUnits("0.123456785"), BigInt(12345679));
  assert.equal(toUnits("-0.000000015"), BigInt(-2));
  assert.throws(() => toUnits("1e5"));
});

test("display formatting", () => {
  assert.equal(fmt("1234567.891"), "1,234,567.89");
  assert.equal(fmt("-0.005"), "−0.01");
  assert.equal(fmt("12", 2, { sign: true }), "+12.00");
  assert.equal(fmt(null), "—");
  assert.equal(fmt("0.00000000", 2, { sign: true }), "0.00");
});

test("input normalization and validation", () => {
  assert.equal(normalizeAmountInput("1,250.5 "), "1250.5");
  assert.equal(normalizeAmountInput("1.2.3"), "1.23");
  assert.ok(isAmount("100.00", 10, 2));
  assert.ok(!isAmount("100.001", 10, 2));
  assert.ok(!isAmount("0.00", 18, 8));
  assert.equal(trimZeros("250.00000000"), "250");
  assert.equal(trimZeros("0.50000000"), "0.5");
});

test("prices get decimals by size", () => {
  assert.equal(fmtPrice("64012.345"), "64,012.3");
  assert.equal(fmtPrice("152.456"), "152.46");
  assert.equal(fmtPrice("0.123456"), "0.12346");
  assert.equal(fmtPrice(null), "—");
});

test("exact division rounds half away from zero", () => {
  assert.equal(div("2", "1"), "2.0000");
  assert.equal(div("1", "3", 2), "0.33");
  assert.equal(div("2", "3", 2), "0.67");
  assert.equal(div("-2", "3", 2), "-0.67");
  assert.equal(div("0.00000004", "0.00000002", 2), "2.00");
  assert.equal(div("1", "0"), null);
});
