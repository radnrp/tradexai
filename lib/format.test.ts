import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fmtAgo, fmtChartTime, fmtDateUtc, fmtDayUtc, utcDayKey } from "./format.ts";
import { setLang } from "./i18n/index.ts";

afterEach(() => setLang("en"));

const D = "2026-11-02T03:30:00Z";

test("english dates are what they always were", () => {
  assert.equal(fmtDateUtc(D), "2 Nov 2026");
  assert.equal(fmtAgo(Date.now() - 300_000), "5 minutes ago");
});

test("persian dates use the Jalali calendar", () => {
  setLang("fa");
  assert.equal(fmtDateUtc(D), "۱۱ آبان ۱۴۰۵");
  assert.equal(fmtDayUtc(D), "دوشنبه ۱۱ آبان");
});

test("persian relative time", () => {
  setLang("fa");
  assert.equal(fmtAgo(Date.now() - 300_000), "۵ دقیقه پیش");
});

test("a formatter follows a language switch", () => {
  setLang("fa");
  fmtDateUtc(D);
  setLang("en");
  assert.equal(fmtDateUtc(D), "2 Nov 2026");
});

test("day keys never change with the language", () => {
  setLang("fa");
  assert.equal(utcDayKey(D), "2026-11-02");
});

test("chart time reads in UTC like the chart's own axis", () => {
  const s = Date.parse(D) / 1000;
  assert.equal(fmtChartTime(s), "2 Nov, 03:30");
  setLang("fa");
  assert.equal(fmtChartTime(s), "۱۱ آبان، ۰۳:۳۰");
});
