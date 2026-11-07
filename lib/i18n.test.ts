import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dirSign, getLang, setLang, t } from "./i18n/index.ts";
import { fa } from "./i18n/fa.ts";
import { tx } from "./i18n/rich.ts";

afterEach(() => setLang("en"));

test("the language starts as english", () => assert.equal(getLang(), "en"));

test("english returns the key with its values", () => {
  assert.equal(t("Language"), "Language");
  assert.equal(t("Up to {n}×", { n: 200 }), "Up to 200×");
});

test("persian returns the translation", () => {
  setLang("fa");
  assert.equal(t("Language"), "زبان");
});

test("persian isolates each value so a sign or percent can't jump sides in the sentence", () => {
  setLang("fa");
  assert.equal(t("Up to {n}×", { n: 200 }), "تا ⁨200⁩×");
});

test("dirSign follows the language", () => {
  assert.equal(dirSign(), 1);
  setLang("fa");
  assert.equal(dirSign(), -1);
});

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every catalog entry has the same placeholders as its key", () => {
  for (const [key, value] of Object.entries(fa)) assert.deepEqual(holes(value), holes(key), key);
});

test("no translation is empty and none calls the trial a gift", () => {
  for (const [key, value] of Object.entries(fa)) {
    assert.ok(value.trim(), key);
    assert.ok(!value.includes("هدیه"), key);
  }
});

test("tx keeps an element inside the sentence", () => {
  const b = createElement("b", null, "200");
  assert.equal(renderToStaticMarkup(tx("Up to {n}×", { n: b })), "Up to <b>200</b>×");
  setLang("fa");
  assert.equal(renderToStaticMarkup(tx("Up to {n}×", { n: b })), "تا <bdi><b>200</b></bdi>×");
  assert.equal(renderToStaticMarkup(tx("Up to {n}×", { n: 200 })), "تا ⁨200⁩×");
});

test("money and risk sentences keep their full meaning in persian", () => {
  setLang("fa");
  assert.match(t("All {n} trial trades used", { n: 50 }), /^همهٔ/);
  assert.equal(fa["Didn't pass the entry checks"], "بررسی‌های ورود را پاس نکرد");
  assert.equal(fa["Paid too little"], "کمتر از مبلغ لازم پرداخت شده");
  // sending the wrong coin loses the user's money; the tokens themselves aren't what's lost
  assert.match(fa["Send only {coin}. Other tokens or networks are lost."], /پولتان از بین می‌رود/);
  assert.match(fa["Send only {coin} on {network}. Other tokens or networks are lost."], /پولتان از بین می‌رود/);
  // "you can lose money" is not "you may make a loss"
  assert.match(fa["Results aren't guaranteed. You can lose money."], /پولتان را از دست بدهید/);
});
