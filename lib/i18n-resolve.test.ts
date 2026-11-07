import assert from "node:assert/strict";
import { test } from "node:test";
import { decideLang, isPersianCode, readSavedLang, saveLang } from "./i18n/resolve.ts";

const use = (lang: string, save: boolean) => ({ kind: "use", lang, save });

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const blocked = {
  getItem(): string | null {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
};

test("a saved language wins, even on a campaign link", () => {
  assert.deepEqual(decideLang({ saved: "fa", telegramCode: "en", startParam: "cmp_x" }), use("fa", false));
  assert.deepEqual(decideLang({ saved: "en", telegramCode: "fa", startParam: "cmp_x" }), use("en", false));
});

test("a first campaign open asks whatever Telegram says", () => {
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "cmp_launch" }), { kind: "ask" });
  assert.deepEqual(decideLang({ saved: null, telegramCode: "en", startParam: "cmp_launch" }), { kind: "ask" });
  assert.deepEqual(decideLang({ saved: "junk", telegramCode: "en", startParam: "cmp_launch" }), { kind: "ask" });
});

test("a referral, a notification or a malformed campaign link follows Telegram", () => {
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "ABCD1234" }), use("fa", true));
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "ntf_a_b" }), use("fa", true));
  assert.deepEqual(decideLang({ saved: null, telegramCode: "en", startParam: "cmp_bad code" }), use("en", true));
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "cmp_" }), use("fa", true));
});

test("no link follows Telegram, and anything but Persian is english", () => {
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa" }), use("fa", true));
  assert.deepEqual(decideLang({ saved: null, telegramCode: "ar" }), use("en", true));
  assert.deepEqual(decideLang({ saved: null }), use("en", true));
});

test("only fa counts as Persian", () => {
  for (const c of ["fa", "FA", "fa-IR", "fa_IR"]) assert.equal(isPersianCode(c), true, c);
  for (const c of ["far", "en", "ar", "", null, undefined]) assert.equal(isPersianCode(c), false, String(c));
});

test("blocked storage reads as nothing saved and never throws", () => {
  assert.equal(readSavedLang("42", blocked), null);
  assert.doesNotThrow(() => saveLang("42", "fa", blocked));
});

test("a saved value is read back for its own user only", () => {
  const s = memory();
  saveLang("42", "fa", s);
  assert.equal(readSavedLang("42", s), "fa");
  assert.equal(readSavedLang("43", s), null);
});

test("a stored value that isn't a language reads as nothing", () => {
  const s = memory();
  s.setItem("txai.lang.42", "de");
  assert.equal(readSavedLang("42", s), null);
});
