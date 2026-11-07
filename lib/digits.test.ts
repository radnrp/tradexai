import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDigits, otpInput } from "./digits.ts";

test("persian and arabic digits become ascii", () => {
  assert.equal(normalizeDigits("۱۲۳٫۴۵"), "123.45");
  assert.equal(normalizeDigits("٠١٢"), "012");
  assert.equal(normalizeDigits("۱٬۲۵۰"), "1,250");
});

test("everything else is left as it is", () => {
  assert.equal(normalizeDigits("0xAb۱"), "0xAb1");
  assert.equal(normalizeDigits("1,250.5 "), "1,250.5 ");
  assert.equal(normalizeDigits(""), "");
});

test("a one-time code keeps six ascii digits, whatever the keyboard", () => {
  assert.equal(otpInput("۱۲۳ ۴۵۶۷"), "123456");
  assert.equal(otpInput("12a3"), "123");
  assert.equal(otpInput("٠٠٠"), "000");
});
