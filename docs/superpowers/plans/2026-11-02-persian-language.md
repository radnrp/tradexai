# Persian Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Telegram mini app two languages, English (default) and Persian with Dana font and RTL layout, chosen from the Telegram language, by an explicit picker on a first campaign open, and changeable in Profile.

**Architecture:** A small module-level `t()` keyed by the English text, with a type-checked catalog in `lib/i18n/fa.ts`, so plain `lib/` functions can translate without hooks and English tests stay untouched. A pure `decideLang()` makes the language decision; a client provider applies it to `<html lang dir>` before any text renders. Layout uses logical CSS classes, which leave English unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, `next/font/local`, `node --test` with type stripping, Playwright in a scratchpad only.

**Spec:** `docs/superpowers/specs/2026-11-02-persian-language-design.md` (read it first; section 12 is the glossary).

## Global Constraints

- Never run `next build` or `npm run dev` in `/www/tradeXai`: `.next` is production on :3056. Builds happen only in a scratchpad copy.
- Typecheck with `npx tsc --noEmit --incremental false`. Unit tests: `node --test lib/*.test.ts` (baseline 76 pass, tsc clean, 2026-11-02).
- No commits and no deploy unless the user asks. This plan has no commit steps for that reason.
- No new dependency in `package.json`. Playwright and pixelmatch live in the scratchpad.
- The English UI must not change: same text, same layout, checked by pixel diff.
- Digit data stays ASCII. Never rewrite digits in strings for display; the font draws them Persian. Money math (`lib/money.ts`) is untouched.
- `lib/` files that tests import use `./i18n/index.ts` with the extension and no `@/`; `lib/i18n/index.ts` has no React import.
- Rename safely: add the new export, update importers, remove the old one last (next dev may be live to testers on :3054).
- The shell's `grep` is ugrep and rejects some patterns; use `perl` for regex scans.
- Persian copy rules (every translation task):
  - Glossary in spec section 12. Trading and product terms use English pronunciation (ترید, لوریج, استاپ‌لاس, فی, والت, فیدبک). واریز, برداشت and موجودی stay Persian.
  - The trial is "تریدهای رایگان". Never call it money, a gift or a balance; "هدیه" is banned. The one name for the grant is "گرنت تریال".
  - Written Persian with the plural polite verb ("واریز کنید"). Buttons are short ("واریز"). Use ZWNJ (می‌شود) and Persian punctuation (، ؛ ؟ « »).
  - Keep the meaning of risk and money sentences exactly; never soften "you can lose money".
  - Numbers from the server stay interpolated, never hard-coded.

## Review Focus

1. Sign-in fails or finishes while the picker is open: the picker stays, and after a choice the user sees the app or the existing error screen in the chosen language. Test: S7 and S10 in Task 6.
2. `localStorage` throws (private or locked WebView): the app still opens, the language is decided fresh each open, nothing crashes. Tests: `lib/i18n-resolve.test.ts` in Task 3, S8 in Task 6.
3. Changing language in Profile: stays on `/profile`, no welcome dialog or profit bubble replay, no broken router after the remount. Test: S9 in Task 6.
4. Persian text on a 320px screen: longer words in the bottom nav, `truncate` rows and `whitespace-nowrap` tabs must not overflow or hide meaning. Test: `scan()` overflow check run in Tasks 9 to 13.
5. A server message missing from the catalog: Persian title, the English detail shown as sent, never blank. Test: `lib/i18n-server-text.test.ts` in Task 8.

---

### Task 1: Visual harness and English baseline

No product code. Later tasks depend on this to prove English did not change, so it must run before any edit.

**Files (all under `$SP=/tmp/claude-0/-www-tradeXai/f75c6998-070d-4372-a544-315ea34825b5/scratchpad`):**
- Create: `$SP/harness/mock.mjs`, `$SP/harness/shots.mjs`, `$SP/harness/scenarios.mjs`, `$SP/harness/build.sh`

**Interfaces:**
- Produces:
  - `build.sh <dir> <port>`: rsync `/www/tradeXai` to `<dir>` excluding `.next` and `.git`, `cp -a node_modules`, write `.env.local` with `NEXT_PUBLIC_API_BASE_URL=http://mock-api.invalid`, `npx next build`, `npx next start -p <port>` in the background, write `<dir>/server.pid`.
  - `newPage(browser, { languageCode, startParam, userId = 42, width = 390, saved, failLogin, blockStorage }) -> { page, requests }` in `mock.mjs`. It installs the `window.Telegram.WebApp` mock (`initData`, `initDataUnsafe.user.language_code`, `start_param`, `auth_date`, `version: "8.0"`, `isVersionAtLeast`, `BackButton`, `HapticFeedback`, `ready`, `expand`, `setHeaderColor`, `setBackgroundColor`), fulfils `telegram.org` with an empty script, routes `**/v1/**` to fixtures, freezes `Date` with `page.clock.setFixedTime` (timers keep running), and uses `reducedMotion: "reduce"`. `requests` records every API call.
  - `shots.mjs <port> <outDir> <lang> <width>`: screenshots each screen in `SCREENS` and prints the `scan()` result.
  - `scan(page) -> { latin: string[], overflow: string[] }`: visible text nodes with Latin words outside `ALLOW` (XENO, EVO, LUMO, USDT, USDC, TradeXai, P&L, R/R, SL, TP, tickers from fixtures, addresses), plus elements where `scrollWidth > clientWidth` and the page's own horizontal overflow.
- `SCREENS`: `/`, `/agents`, `/agents/<id>`, `/wallet`, `/statements`, `/leaderboard`, `/activity`, `/profile`, `/referrals`, `/trial`, `/feedback`, `/nope`, plus the deposit sheet, withdraw sheet, agent tour and agent info dialog opened by clicking.

- [ ] **Step 1: Install Playwright in the harness**

Run in `$SP/harness`: `npm init -y && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright@1.49.1 pixelmatch pngjs`. Launch Chromium with `--no-sandbox` (cached `chromium-1148`).

- [ ] **Step 2: Write the fixtures from `lib/api/types.ts` and `lib/api/client.ts`**

Cover: an active trial with an open long and a closed losing trade, a statement with daily rows, one credited deposit, one waiting deposit, one broadcast withdrawal, referrals with a tier, a mixed community feed with one Persian name, feedback eligibility. Every screen must show real content, not an empty state.

- [ ] **Step 3: Build the baseline from the untouched tree and capture it**

Run: `build.sh $SP/baseline 3160`, then `node shots.mjs 3160 $SP/shots/base-en-390 en 390` and the same at width 320.
Expected: one PNG per screen, none showing the error or 404 screen except `/nope`. Read three PNGs to confirm real content. Stop the server with `kill $(cat $SP/baseline/server.pid)`. Never kill by process name.

---

### Task 2: Translation core

**Files:**
- Create: `lib/i18n/index.ts`, `lib/i18n/fa.ts`, `lib/i18n/rich.tsx`
- Test: `lib/i18n.test.ts`, `lib/i18n-coverage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/i18n/index.ts
  export type Lang = "en" | "fa";
  export type Key = keyof typeof fa;
  export type Values = Record<string, string | number>;
  export function getLang(): Lang;               // starts "en"
  export function setLang(l: Lang): void;
  export const dirSign: () => 1 | -1;            // multiply a horizontal motion offset by this
  export function t(key: Key, values?: Values): string;
  // lib/i18n/rich.tsx
  export function tx(key: Key, values: Record<string, React.ReactNode>): React.ReactNode;
  // lib/i18n/fa.ts
  export const fa = { "Language": "زبان", /* ... */ } satisfies Record<string, string>;
  ```
- `t` in `fa` wraps each interpolated value in FSI `⁨` and PDI `⁩`; in `en` it does not. `tx` joins parts with `createElement(Fragment, null, ...parts)`, wrapping non-element values the same way and elements in `<bdi>`.
- Tables built at import hold keys, typed `Key`, and call `t()` at render. Never write `const X = t(...)` at module level.

- [ ] **Step 1: Write the failing tests in `lib/i18n.test.ts`**

```ts
afterEach(() => setLang("en"));
test("english returns the key with values", () => assert.equal(t("Up to {n}×", { n: 200 }), "Up to 200×"));
test("persian returns the translation with isolated values", () => {
  setLang("fa");
  assert.equal(t("Up to {n}×", { n: 200 }), "تا ⁨200⁩×");
});
test("dirSign follows the language", () => {
  assert.equal(dirSign(), 1);
  setLang("fa");
  assert.equal(dirSign(), -1);
});
test("every catalog entry has the same placeholders as its key", ...);  // sorted {x} lists equal for all entries
test("no empty translations and no banned word", ...);                  // value non-empty; no "هدیه"
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test lib/i18n.test.ts`. Expected: FAIL, cannot find `lib/i18n/index.ts`.

- [ ] **Step 3: Implement `lib/i18n/index.ts`, `lib/i18n/fa.ts` (seed with `"Language"` and `"Up to {n}×": "تا {n}×"`), `lib/i18n/rich.tsx`**

- [ ] **Step 4: Run to verify it passes**

Run: `node --test lib/*.test.ts` and `npx tsc --noEmit --incremental false`. Expected: all pass, tsc clean.

- [ ] **Step 5: Write `lib/i18n-coverage.test.ts`**

Exports nothing. Holds `const COVERED: string[] = []` (paths; each later task appends its files) and `untranslated(source: string): string[]`, flagging on lines without `i18n-ignore`:
- JSX text with a Latin word: `>...[A-Za-z]{2,}...<` or a whole line of plain capitalized text between JSX lines.
- Attributes `title|subtitle|label|linkLabel|placeholder|aria-label|alt|body|caption|hint="...[A-Za-z]{2,}..."`.
- `toast(...)("` and `description: "`.
- `^const .* = t\(` (a module-level call).

Fixture tests:
```ts
assert.deepEqual(untranslated(`<p>Hello there</p>`), ["Hello there"]);
assert.deepEqual(untranslated(`<p>{t("Hello there")}</p>`), []);
assert.deepEqual(untranslated(`<Row label="Telegram ID">`).length, 1);
assert.deepEqual(untranslated(`toast.error("Nope")`).length, 1);
assert.deepEqual(untranslated(`<b>XENO</b>`), []);            // brand allowlist
assert.deepEqual(untranslated(`<b>Keep me</b> // i18n-ignore`), []);
```
Then a test that `untranslated(readFileSync(f))` is empty for every path in `COVERED`.

Expected: `node --test lib/i18n-coverage.test.ts` passes with an empty `COVERED`.

---

### Task 3: Language decision

**Files:**
- Create: `lib/i18n/resolve.ts`
- Modify: `lib/telegram.ts:5-11` (add `language_code?: string` to `TgUser`)
- Test: `lib/i18n-resolve.test.ts`

**Interfaces:**
- Consumes: `Lang` from Task 2; `campaignCode` from `lib/analytics.ts`.
- Produces:
  ```ts
  export type LangDecision = { kind: "use"; lang: Lang; save: boolean } | { kind: "ask" };
  export function isPersianCode(code: string | null | undefined): boolean;
  export function decideLang(o: { saved: unknown; telegramCode?: string | null; startParam?: string | null }): LangDecision;
  export function readSavedLang(userId: string, storage?: Pick<Storage, "getItem">): Lang | null;
  export function saveLang(userId: string, lang: Lang, storage?: Pick<Storage, "setItem">): void;
  ```
- The storage key is `txai.lang.<userId>`. `storage` defaults to `localStorage`, read inside a try/catch.

- [ ] **Step 1: Write the failing tests**

```ts
const use = (lang, save) => ({ kind: "use", lang, save });
test("a saved language wins, even on a campaign link", () => {
  assert.deepEqual(decideLang({ saved: "fa", telegramCode: "en", startParam: "cmp_x" }), use("fa", false));
  assert.deepEqual(decideLang({ saved: "en", telegramCode: "fa", startParam: "cmp_x" }), use("en", false));
});
test("a first campaign open asks whatever Telegram says", () => {
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "cmp_launch" }), { kind: "ask" });
  assert.deepEqual(decideLang({ saved: null, telegramCode: "en", startParam: "cmp_launch" }), { kind: "ask" });
  assert.deepEqual(decideLang({ saved: "junk", telegramCode: "en", startParam: "cmp_launch" }), { kind: "ask" });
});
test("other links follow Telegram", () => {
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "ABCD1234" }), use("fa", true));
  assert.deepEqual(decideLang({ saved: null, telegramCode: "fa", startParam: "ntf_a_b" }), use("fa", true));
  assert.deepEqual(decideLang({ saved: null, telegramCode: "en", startParam: "cmp_bad code" }), use("en", true));
});
test("only fa counts as Persian", () => {
  for (const c of ["fa", "FA", "fa-IR", "fa_IR"]) assert.equal(isPersianCode(c), true);
  for (const c of ["far", "en", "ar", "", null, undefined]) assert.equal(isPersianCode(c), false);
});
test("blocked storage reads as nothing saved and never throws", () => {
  const bad = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  assert.equal(readSavedLang("42", bad), null);
  assert.doesNotThrow(() => saveLang("42", "fa", bad));
});
test("a saved value is read back per user", ...);   // fake storage; other user id reads null; junk value reads null
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test lib/i18n-resolve.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement `lib/i18n/resolve.ts` and add the `TgUser` field**

- [ ] **Step 4: Run to verify it passes**

Run: `node --test lib/*.test.ts` and tsc. Expected: pass, clean.

---

### Task 4: Persian keyboard input

**Files:**
- Create: `lib/digits.ts`
- Modify: `lib/money.ts:8-12`, `components/withdraw/withdraw-status.tsx:153-161`, `components/withdraw/withdraw-sheet.tsx:272-275`, `components/ui/controls.tsx:107`, `components/money/flow-ui.tsx:137`
- Test: `lib/digits.test.ts`, `lib/money.test.ts`

**Interfaces:**
- Produces: `normalizeDigits(raw: string): string` (U+06F0-9 and U+0660-9 to ASCII digits, U+066B to `.`, U+066C to `,`) and `otpInput(raw: string): string` (ASCII digits only, at most 6).

- [ ] **Step 1: Write the failing tests**

```ts
assert.equal(normalizeDigits("۱۲۳٫۴۵"), "123.45");
assert.equal(normalizeDigits("٠١٢"), "012");
assert.equal(normalizeDigits("0xAb۱"), "0xAb1");
assert.equal(otpInput("۱۲۳ ۴۵۶۷"), "123456");
assert.equal(otpInput("12a3"), "123");
// lib/money.test.ts
assert.equal(normalizeAmountInput("۱٬۲۵۰٫۵"), "1250.5");
assert.equal(normalizeAmountInput("1,250.5 "), "1250.5");
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test lib/digits.test.ts lib/money.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement and wire the fields**

- `normalizeAmountInput` calls `normalizeDigits` first (`import` from `./digits.ts`).
- OTP `onChange` uses `otpInput`. Address `onChange` applies `normalizeDigits` after removing whitespace.
- Add `dir="ltr"` to both amount inputs, the address input, and the OTP label wrapper, so the six boxes fill left to right.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test lib/*.test.ts` and tsc. Expected: pass, clean.

---

### Task 5: Dates by language

**Files:**
- Modify: `lib/format.ts:1-5,9-25`, `components/trading/position-card.tsx:27`, `components/trading/candle-chart.tsx:18-24`
- Test: `lib/format.test.ts`

**Interfaces:**
- Consumes: `getLang` (import `./i18n/index.ts`).
- Produces: unchanged signatures for `fmtDateTime`, `fmtTime`, `fmtDateUtc`, `fmtDayUtc`, `fmtAgo`; new `fmtChartTime(epochSeconds: number): string` (date and time, UTC, because the chart's axis is UTC).

- [ ] **Step 1: Write the failing tests** (values checked against Node 24 ICU)

```ts
afterEach(() => setLang("en"));
const D = "2026-11-02T03:30:00Z";
test("english is unchanged", () => assert.equal(fmtDateUtc(D), "2 Nov 2026"));
test("persian uses the Jalali calendar", () => {
  setLang("fa");
  assert.equal(fmtDateUtc(D), "۱۱ آبان ۱۴۰۵");
  assert.equal(fmtDayUtc(D), "دوشنبه ۱۱ آبان");
});
test("persian relative time", () => {
  setLang("fa");
  assert.equal(fmtAgo(Date.now() - 300_000), "۵ دقیقه پیش");
});
test("the formatter follows a language switch", () => {
  setLang("fa"); fmtDateUtc(D);
  setLang("en");
  assert.equal(fmtDateUtc(D), "2 Nov 2026");
});
test("day keys never change", () => { setLang("fa"); assert.equal(utcDayKey(D), "2026-11-02"); });
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test lib/format.test.ts`. Expected: FAIL on the Persian cases.

- [ ] **Step 3: Implement**

- Build each formatter set lazily per language: `en-GB`/`en` exactly as today, `fa-IR`/`fa` with the same options.
- `position-card.tsx:27` uses `fmtTime`.
- `candle-chart.tsx` passes, only when `getLang() === "fa"`, `localization: { locale: "fa-IR", timeFormatter: fmtChartTime }`. English keeps today's options.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test lib/*.test.ts` and tsc. Expected: pass, clean.

---

### Task 6: Language gate, font and Profile row

The app can now reach Persian, so this task carries the font and CSS it needs.

**Files:**
- Create: `components/shell/language.tsx`, `components/shell/language-picker.tsx`
- Modify: `app/layout.tsx`, `app/globals.css`, `components/shell/app-providers.tsx`, `components/shell/boot-gate.tsx`, `app/profile/page.tsx`, `lib/i18n/fa.ts`, `lib/i18n-coverage.test.ts`

**Interfaces:**
- Consumes: `decideLang`, `readSavedLang`, `saveLang`, `setLang`, `t`, `waitForTelegram`.
- Produces:
  ```ts
  export type LangPhase = { kind: "resolving" } | { kind: "ask" } | { kind: "ready"; lang: Lang };
  export function LanguageProvider({ children }: { children: React.ReactNode }): JSX.Element;
  export function useLanguage(): { phase: LangPhase; choose: (l: Lang) => void };
  export function LanguagePicker(): JSX.Element;
  ```
- CSS utility `font-latin` (theme token `--font-latin: var(--font-inter), system-ui, sans-serif`) for later tasks.

- [ ] **Step 1: Font and CSS**

- `app/layout.tsx`: `localFont` with `../assets/Webfonts/woff2/DanaFaNum-{Regular,Medium,DemiBold,Bold}.woff2` at weights 400, 500, 600, 700, `variable: "--font-dana"`, `preload: false`, `display: "swap"`, `adjustFontFallback: false`. Add its variable to `<html className>`.
- `app/globals.css`:
  ```css
  [lang="fa"] {
    --font-sans: var(--font-dana), var(--font-inter), system-ui, sans-serif;
    --text-display--letter-spacing: 0;
    --text-h1--letter-spacing: 0;
    font-family: var(--font-sans);
    letter-spacing: 0;
  }
  [lang="fa"] [class*="tracking-"] { letter-spacing: 0; }
  ```

- [ ] **Step 2: Provider**

`LanguageProvider` starts at `resolving` on server and first client render, so there is no hydration mismatch. In an effect: `await waitForTelegram()`. With no `initData` or no user id, use English without saving. Otherwise read the saved value and call `decideLang`. Applying a language does `setLang(l)`, then sets `documentElement.lang` and `.dir`, then updates state, in that order. `choose` applies and saves, and Profile uses it too.

- [ ] **Step 3: Picker**

Full screen, not dismissable: `Logo`, title `Choose your language` and `<span lang="fa">زبان خود را انتخاب کنید</span>`, two `Button size="lg" variant="secondary" block` labelled `English` and `<span lang="fa">فارسی</span>`, neither preselected. Copy is fixed and bilingual, so mark those lines `// i18n-ignore`. Tap: `haptic.select()`, then `choose`.

- [ ] **Step 4: Wire `BootGate` and `AppProviders`**

- `AppProviders`: `LanguageProvider` wraps `BootGate` and the Toaster; the Toaster gets `dir` from the language (extract a small `AppToaster`).
- `BootGate`: leave `boot()` in its effect exactly as it is, so sign-in runs behind the picker.
  - `phase.kind === "ask"` renders `LanguagePicker` under `AnimatePresence` with key `"language"`, ahead of every boot state.
  - `resolving` renders `Gate` with the logo only, no heading, text or buttons.
  - In `ready`, wrap the app subtree in `<Fragment key={lang}>`.
- Translate every string in `boot-gate.tsx` (`Gate` and `OfflineBanner`) and add the file to `COVERED`.

- [ ] **Step 5: Profile row**

New `Card` between the account card and the links: label `t("Language")` above `Segmented<Lang>` with `layoutId="language"` and options `English` and `<span lang="fa">فارسی</span>`; `onChange` calls `choose`.

- [ ] **Step 6: Write `scenarios.mjs` and run it against a scratch build**

Run: `build.sh $SP/work 3161`, then `node scenarios.mjs 3161`. Assertions (each prints PASS/FAIL, exit non-zero on any FAIL):

| # | Setup | Expected |
|---|---|---|
| S1 | no saved, `cmp_x`, Telegram en | picker shown; tap فارسی: `html[lang=fa][dir=rtl]`, app visible, `txai.lang.42 = fa` |
| S2 | no saved, `cmp_x`, Telegram fa | picker shown; tap English: `html[lang=en][dir=ltr]`, saved `en` |
| S3 | no saved, no link, Telegram fa | no picker; rtl; saved `fa` |
| S4 | no saved, no link, Telegram en, then ar, then missing | no picker; ltr; saved `en` |
| S5 | saved en, `cmp_x`, Telegram fa | no picker; ltr |
| S6 | no saved, `ABCD1234`, Telegram fa | no picker; rtl |
| S7 | no saved, `cmp_x`, `failLogin` | picker stays; after فارسی: the error screen with a Persian title and retry button |
| S8 | `blockStorage`, no link, then `cmp_x` | app opens with no crash; the campaign open shows the picker |
| S9 | saved en, open `/profile`, switch to فارسی, then back | URL stays `/profile`, `dir` flips both ways, no welcome dialog, no profit bubble, Back still navigates |
| S10 | no saved, `cmp_x`, no tap for 2s, then tap | one `POST /auth/telegram` already sent before the tap; after it the app opens with no second sign-in |
| S11 | Telegram fa, delayed bundle | before resolve, body has no "Signing you in" |

Stop the server by PID. Expected: all PASS, `node --test lib/*.test.ts` and tsc clean.

---

### Task 7: RTL mechanics

**Files:** the classes and components listed below; `lib/i18n-coverage.test.ts`.

**Interfaces:**
- Consumes: `dirSign` (Task 2), `font-latin` (Task 6).

- [ ] **Step 1: Write the failing guard in `lib/i18n-coverage.test.ts`**

`physical(source)` finds `ml- mr- pl- pr- left- right- text-left text-right border-l border-r rounded-l- rounded-r- space-x-` (not `rounded-lg`) across `app` and `components`. Allowed only: `left-1/2`, `-translate-x-1/2` (centering), `left-0 translate-x-0` in `feedback-prompt.tsx`, and the price bar lines in `position-card.tsx` (225-229). Expected: `node --test lib/i18n-coverage.test.ts` FAILS listing the classes below.

- [ ] **Step 2: Convert to logical classes**

| Change | Where (current line) |
|---|---|
| `text-right` to `text-end` | `app/page.tsx:222`, `app/referrals/page.tsx:266`, `app/agents/[id]/page.tsx:204`, `components/money/flow-ui.tsx:43`, `components/statement/overview.tsx:107`, `components/trader/agent-info.tsx:56`, `components/trader/agent-card.tsx:61`, `components/ui/primitives.tsx:150`, `components/wallet/deposit-locks.tsx:74`, `components/withdraw/withdraw-status.tsx:63`, `components/withdraw/withdraw-sheet.tsx:227`, `components/trading/position-card.tsx:91` |
| `text-left` to `text-start` | `components/activity-item.tsx:27`, `app/referrals/page.tsx:190`, `app/wallet/page.tsx:207`, `components/trader/agent-tour.tsx:177`, `components/trader/account-cards.tsx:57`, `components/deposit/deposit-sheet.tsx:402,425`, `components/wallet/deposit-locks.tsx:48` |
| `ml-auto` to `ms-auto` | `components/shell/live-ticker.tsx:96`, `components/trader/account-cards.tsx:54`, `components/agents/shared.tsx:95`, `components/deposit/deposit-payment.tsx:397`, `components/deposit/deposit-sheet.tsx:274,291`, `components/trading/position-card.tsx:80` |
| `ml-1` to `ms-1`, `-ml-1` to `-ms-1` | `components/ui/primitives.tsx:66`, `components/trader/next-step.tsx:143` |
| `pl-13` to `ps-13` | `components/activity-item.tsx:51` |
| `pl-3 pr-2.5` to `ps-3 pe-2.5` | `components/withdraw/withdraw-sheet.tsx:257` |
| `-right-0.5` to `-end-0.5` | `components/deposit/deposit-sheet.tsx:456`, `components/withdraw/withdraw-sheet.tsx:219` |
| `ml-1.5 border-l`, `pl-4`, `-left-[4.5px]` to `ms-1.5 border-s`, `ps-4`, `-start-[4.5px]` | `components/trading/position-card.tsx:273,276,277` |

- [ ] **Step 3: Direction-aware pieces**

- Add `rtl:-scale-x-100` to directional icons: `ArrowRight01Icon` and `ArrowLeft01Icon` in `app/profile/page.tsx`, `app/page.tsx:118,151`, `app/agents/[id]/page.tsx:244,253`, `app/wallet/page.tsx:132`, `components/trader/account-cards.tsx:54`, `components/trader/status.tsx:75`, `components/trader/agent-tour.tsx:118`, `components/ui/primitives.tsx:99,129`, `components/trader/trial-card.tsx:56`, `components/statement/trades.tsx:109,115`; `ArrowRight02Icon` in `components/money/flow-ui.tsx:41`. Up and down arrows stay.
- `Page` in `components/ui/primitives.tsx:112`: `x: 12 * dirSign()`.
- `agent-tour.tsx:135-147`: multiply `enter` and `exit` x by `dirSign()`, and compare `info.offset.x * dirSign()` in `onDragEnd`.
- `Amount` (`primitives.tsx:64`): add `dir="ltr"`.
- `dir="ltr"` on the plot only, not captions: `daily-chart.tsx` bars row, `equity-chart.tsx` figure, the `candle-chart.tsx` element, and the `position-card.tsx:223` bar with its SL/Entry/TP label row.
- `font-latin` plus `dir="ltr"`: Telegram ID and referral code (`app/profile/page.tsx:39,41`) and the OTP boxes (`withdraw-status.tsx`). Text that already has `font-mono` needs nothing.
- `dir="auto"`: user text and names: the feedback `textarea`, feedback list text, the agent name input, community and referral names.

- [ ] **Step 4: Verify English did not move**

Run: `node --test lib/*.test.ts`, tsc, `build.sh $SP/work 3161`, `node shots.mjs 3161 $SP/shots/rtl-en-390 en 390`, then pixelmatch against `$SP/shots/base-en-390`. Expected: guard passes; 0 differing pixels on every screen, or each difference explained. Stop the server by PID.

- [ ] **Step 5: Verify RTL mirrors**

Run `shots.mjs` with `fa` at 390 and read the home, wallet, position and deposit sheet PNGs. Text is still mostly English at this point. Expected: layout mirrored, amounts keep sign and unit in order, charts run left to right.

---

### Task 8: Text inside `lib/` and server messages

**Files:**
- Create: `lib/i18n/server-text.ts`
- Modify: `lib/labels.ts`, `lib/trader.ts`, `lib/agent-info.ts`, `lib/partner.ts`, `lib/feedback.ts`, `lib/personal-pnl.ts`, `lib/valuation.ts`, `components/deposit/options.ts`, `components/statement/data.ts`, `components/trader/use-agent-status.ts`, `lib/i18n/fa.ts`
- Test: `lib/i18n-server-text.test.ts`, `lib/trader.test.ts`, `lib/agent-info.test.ts`

**Interfaces:**
- Consumes: `t`, `Key`, `getLang`.
- Produces: `serverText(message: string): string` (exact English message to Persian in `fa`; otherwise the message unchanged). The table is limited to messages a user can reach: withdrawal, deposit, feedback and sign-in from `src/withdrawals`, `src/wallet`, `src/payments`, `src/feedback`, `src/trader`, including `Minimum withdrawal is 10 USDT`, `Wait 60 seconds before resending`, `Invalid EVM address`, `Invalid code, expired or cancelled withdrawal`, `A withdrawal is awaiting confirmation`, `New deposit principal is locked for seven days`, `Too many deposit requests`, `Trial profit withdrawals require at least 50 USDT in confirmed real deposits`, `Feedback must contain 10–2000 characters`. Internal messages stay out.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/i18n-server-text.test.ts
test("a known message is translated in persian", () => {
  setLang("fa");
  assert.match(serverText("Minimum withdrawal is 10 USDT"), /برداشت/);
});
test("an unknown message stays as sent and is never blank", () => {
  setLang("fa");
  assert.equal(serverText("Some new server error"), "Some new server error");
});
test("english is untouched", () => assert.equal(serverText("Minimum withdrawal is 10 USDT"), "Minimum withdrawal is 10 USDT"));
// lib/trader.test.ts: a fa case
setLang("fa"); assert.doesNotMatch(trialGuide(undefined).headline, /[A-Za-z]{3}/);
assert.match(withdrawalErrorText("Insufficient free withdrawable balance; trial principal is not withdrawable"), /گرنت تریال/);
// lib/agent-info.test.ts: a fa case
setLang("fa"); assert.match(feeText({ feeBpsPerSide: 10, feeBasis: "margin" }), /فی|مارجین/);
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test lib/i18n-server-text.test.ts lib/trader.test.ts lib/agent-info.test.ts`. Expected: only the new cases FAIL.

- [ ] **Step 3: Translate**

- Tables in `labels.ts` (`INSTANCE`, `EXECUTION`, `DEPOSIT`, `WITHDRAWAL`, `JOURNAL`, `CLOSE_REASON`, `ENTRY_REJECTION`) and `trader.ts` (`STEPS` and similar) hold `Key` values; getters translate on call. `raw()` fallbacks stay as they are.
- `describeError` translates titles and static details and runs server details through `serverText`. Keep the dev-only English message.
- English server text must read correctly inside RTL: add `[unicode-bidi:plaintext]` to the Toaster's `description` class (`app-providers.tsx`) and the `Gate` body (`boot-gate.tsx`).
- `withdrawalErrorText` returns `serverText(message)` as its last line.
- Word order: replace concatenated fragments with one full-sentence key.
- Do not change any existing English sentence; the 76 baseline tests must pass without edits.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test lib/*.test.ts` and tsc. Expected: all pass, no existing test edited.

---

### Tasks 9 to 12: Text on screens

The same four steps per task; only the files differ. Each task's deliverable is its screens fully Persian, with money screens checked hardest.

**Interfaces:**
- Consumes: `t`, `tx`, `Key` (Task 2), `serverText` (Task 8), `scan` (Task 1).

**Steps for each task:**

- [ ] **Step 1: Append the task's files to `COVERED`**

Run: `node --test lib/i18n-coverage.test.ts`. Expected: FAIL listing the untranslated text.

- [ ] **Step 2: Wrap and translate**

`t("...")`, or `tx` where a sentence holds an element like `<Amount>`. Also `aria-label`, `placeholder`, `sr-only`, toasts. Add entries to `fa.ts` under a comment naming the screen. Tables become `Key`-typed.

- [ ] **Step 3: Static check**

Run: `node --test lib/*.test.ts` and tsc. Expected: pass, clean.

- [ ] **Step 4: Runtime check**

Run: `build.sh $SP/work 3161`, `shots.mjs` in `fa` at 390 and 320, and read each PNG the task touched. Expected: `scan` reports no Latin words outside `ALLOW` and no overflow on the task's screens. Stop the server by PID.

**Task 9: Shell, Home, Profile, Trial**
`components/shell/{bottom-nav,live-ticker,logo,notification-link}.tsx`, `components/ui/{primitives,controls,button,dialog,sheet,drawer}.tsx`, `app/page.tsx`, `app/profile/page.tsx`, `app/trial/page.tsx`, `app/error.tsx`, `app/not-found.tsx`, `components/trader/{trial-card,trial-profit-card,next-step,account-cards,status,agent-card}.tsx`.

**Task 10: Money flows**
`components/deposit/{deposit-sheet,deposit-payment,token-icon}.tsx`, `components/withdraw/{withdraw-sheet,withdraw-status}.tsx`, `components/money/flow-ui.tsx`, `app/wallet/page.tsx`, `components/wallet/deposit-locks.tsx`, `app/activity/page.tsx`, `components/activity-item.tsx`.
Extra requirements:
- `belowMin.message` (`deposit-sheet.tsx:190,334`) uses a catalog sentence in `fa`, with `minUsd` interpolated.
- `ui?.helpText` (`deposit-sheet.tsx:373`) uses `t("Need help with your deposit? Contact support")` in `fa` and the server's text in `en`.
- Regexes on `e.message` (`withdraw-sheet.tsx:403`) keep reading the raw server message.
- Copy warnings ("Don't send to this address") must keep their full force.

**Task 11: Agent and trades**
`app/agents/page.tsx`, `app/agents/[id]/page.tsx`, `app/agents/mine` (if it holds text), `components/agents/shared.tsx`, `components/trader/{agent-info,agent-tour,agent-orb,calculator,profit-events,welcome-dialog}.tsx`, `components/trading/{candle-chart,equity-chart,pnl,position-card}.tsx`.

**Task 12: Statements, community, referrals, feedback**
`app/statements/page.tsx`, `components/statement/{daily-chart,funding,overview,tile,trades}.tsx`, `app/leaderboard/page.tsx`, `app/referrals/page.tsx`, `app/feedback/page.tsx`, `components/feedback/{feedback-form,feedback-prompt,stars}.tsx`.

---

### Task 13: Whole-app check

**Files:** `lib/i18n-coverage.test.ts` (replace `COVERED` with a walk over every `.tsx` under `app` and `components`, so new files are covered by default).

- [ ] **Step 1: Static**

Run: `node --test lib/*.test.ts`, tsc, `npx eslint`. Expected: pass and clean, or only warnings that exist at baseline.

- [ ] **Step 2: Production build in the scratch copy**

Run: `build.sh $SP/work 3161`. Expected: the build succeeds and the Dana chunks exist under `.next/static/media`. In `en`, confirm from `requests` or the network log that no Dana file downloads.

- [ ] **Step 3: Scenarios**

Run: `node scenarios.mjs 3161`. Expected: S1 to S11 all PASS.

- [ ] **Step 4: Screens in both languages at both widths**

Run `shots.mjs` for `fa` and `en` at 390 and 320. Expected: in `fa`, `scan` reports no stray Latin words and no overflow on any screen. In `en`, 0 differing pixels against `$SP/shots/base-en-*`.

- [ ] **Step 5: Read the Persian**

Read every `fa` PNG and `lib/i18n/fa.ts` once more for meaning, glossary terms, half-spaces and clipped diacritics at caption size. Fix what you find and repeat Step 4 for those screens.

- [ ] **Step 6: Stop servers by PID and report to the user**

Report test counts, the scenario results, and any stray-text or pixel exceptions, and share a few `fa` screenshots for the user to judge the copy. Do not commit or deploy; ask.
