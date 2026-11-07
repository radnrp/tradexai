import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { setLang } from "./i18n/index.ts";
import { serverText } from "./i18n/server-text.ts";

afterEach(() => setLang("en"));

test("a known message is translated in persian", () => {
  setLang("fa");
  assert.match(serverText("Minimum withdrawal is 10 USDT"), /برداشت/);
});

test("an unknown message stays as sent and is never blank", () => {
  setLang("fa");
  assert.equal(serverText("Some new server error"), "Some new server error");
});

test("english is untouched", () => assert.equal(serverText("Minimum withdrawal is 10 USDT"), "Minimum withdrawal is 10 USDT"));
