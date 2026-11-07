import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

/** Every screen and shared component, so a new file is checked from its first line. */
const SCREENS = ["app", "components"].flatMap((d) => (readdirSync(d, { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx")).map((f) => `${d}/${f}`));

/** Names and codes that stay in Latin in both languages. */
const BRANDS = /^(XENO|EVO|LUMO|USDT|USDC|TradeXai|English|ROI|P&L|R\/R|SL|TP|UTC)$/;
const hasWords = (s: string) => s.split(/[^A-Za-z&/]+/).some((w) => w.length > 1 && !BRANDS.test(w));

/** English text left in a source file. Tables of keys aren't flagged: `label: "Home"` is fine when t() reads it at render. */
function untranslated(source: string): string[] {
  const found: string[] = [];
  for (const line of source.split("\n")) {
    if (line.includes("i18n-ignore") || /^\s*(\/\/|\*|\/\*|\{\/\*|import )/.test(line)) continue;
    const add = (s: string) => found.push(s.trim());
    // a tag's > never follows a space or =, unlike a comparison or an arrow
    for (const m of line.matchAll(/(?<![=\s])>([^<>{}]*[A-Za-z]{2}[^<>{}]*)[<{]/g)) if (hasWords(m[1]) && !/&&|&nbsp;|\["|^\(/.test(m[1])) add(m[1]);
    for (const m of line.matchAll(/\b(?:title|subtitle|label|linkLabel|placeholder|aria-label|alt|body|caption|hint)="([^"]*[A-Za-z]{2}[^"]*)"/g)) if (hasWords(m[1])) add(m[1]);
    for (const m of line.matchAll(/\btoast(?:\.\w+)?\(\s*"([^"]+)"/g)) add(m[1]);
    for (const m of line.matchAll(/\bdescription:\s*"([A-Z][^"]+)"/g)) add(m[1]);
    // a word between two values: {n} token{s}, {n} paid</span>
    const code = line.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/`[^`]*`/g, "``");
    for (const m of code.matchAll(/\}\s?([A-Za-z]{2,}[a-z ]*)[{<]/g)) if (hasWords(m[1]) && !/^(else|catch|finally|satisfies|while|as)\b/.test(m[1])) add(m[1]);
    // a whole line of text between JSX lines
    const bare = line.match(/^\s*([A-Z][a-z]+(?:[ ,.'’:!?-]+[A-Za-z0-9’']+)*[.!?]?)\s*$/);
    if (bare && hasWords(bare[1])) add(bare[1]);
    if (/^const \w+[^=]*= t\(/.test(line)) add(line);
  }
  return found;
}

test("finds english in markup, attributes and toasts", () => {
  assert.deepEqual(untranslated(`<p>Hello there</p>`), ["Hello there"]);
  assert.deepEqual(untranslated(`<span> · target {rr}</span>`), ["· target"]);
  assert.deepEqual(untranslated(`<Row label="Telegram ID">`), ["Telegram ID"]);
  assert.deepEqual(untranslated(`toast.error("Nope")`), ["Nope"]);
  assert.deepEqual(untranslated(`toast.error(d.title, { description: "Try again." })`), ["Try again."]);
  assert.deepEqual(untranslated(`        Try again`), ["Try again"]);
  assert.deepEqual(untranslated(`const LABEL = t("Home");`).length, 1);
});

test("leaves translated text, brands, code and marked lines alone", () => {
  assert.deepEqual(untranslated(`<p>{t("Hello there")}</p>`), []);
  assert.deepEqual(untranslated(`<b>XENO</b>`), []);
  assert.deepEqual(untranslated(`<b>Keep me</b> // i18n-ignore`), []);
  assert.deepEqual(untranslated(`  // A comment about Home`), []);
  assert.deepEqual(untranslated(`  const label = "Home";`), []);
  assert.deepEqual(untranslated(`        </Button>`), []);
  assert.deepEqual(untranslated(`const c = s > 0 ? "text-primary" : s < 0 ? "text-destructive" : "";`), []);
  assert.deepEqual(untranslated(`const art = (size: string) => (look.icon ? <Icon />);`), []);
  assert.deepEqual(untranslated(`{i ? <Split /> : inst.isPending && <Skeleton />}`), []);
  assert.deepEqual(untranslated(`const rr = pick<number>(p.config, ["rr"]) ?? pick<number>(p.rules);`), []);
  assert.deepEqual(untranslated(`<span>≈&nbsp;</span>`), []);
});

test("screens have no english left outside t()", () => {
  assert.deepEqual(SCREENS.flatMap((f) => untranslated(readFileSync(f, "utf8")).map((s) => `${f}: ${s}`)), []);
});

const PHYSICAL = /(?<![\w-])-?(?:ml|mr|pl|pr)-[\w.[\]/-]+|(?<![\w-])-?(?:left|right)-[\w.[\]/%-]+|(?<![\w-])text-(?:left|right)\b|(?<![\w-])rounded-(?:l|r|tl|tr|bl|br)-\w+|(?<![\w-])border-[lr]\b|(?<![\w-])space-x-\w+/g;
/** Centering is the same both ways, and the price bar runs low to high whatever the language. */
const SAME_BOTH_WAYS = /left-1\/2|translate-x-0|left-0 rounded-l-full|right-0 rounded-r-full/;

/** left and right spelled out in a class, which RTL can't mirror. */
function physical(source: string): string[] {
  return source.split("\n").flatMap((line) => (SAME_BOTH_WAYS.test(line) ? [] : (line.match(PHYSICAL) ?? [])));
}

test("spots physical classes and leaves logical ones and centering", () => {
  assert.deepEqual(physical(`className="ml-auto text-right pl-3"`), ["ml-auto", "text-right", "pl-3"]);
  assert.deepEqual(physical(`className="-right-0.5 border-l rounded-l-full"`), ["-right-0.5", "border-l", "rounded-l-full"]);
  assert.deepEqual(physical(`className="ms-auto text-end ps-3 rounded-lg border-s place-items-center"`), []);
  assert.deepEqual(physical(`className="left-1/2 -translate-x-1/2"`), []);
});

test("screens use logical classes, so RTL mirrors them", () => {
  const found = SCREENS.flatMap((f) => physical(readFileSync(f, "utf8")).map((c) => `${f}: ${c}`));
  assert.deepEqual(found, []);
});

/** The opening tags of elements in monospace, which hold addresses and ids, that don't say they read left to right. */
function monoWithoutLtr(source: string): string[] {
  const found: string[] = [];
  for (let at = source.indexOf("font-mono"); at !== -1; at = source.indexOf("font-mono", at + 1)) {
    const tag = source.slice(source.lastIndexOf("<", at), source.indexOf(">", at) + 1);
    if (!tag.includes('dir="ltr"')) found.push(tag.slice(0, 80));
  }
  return found;
}

test("addresses and ids read left to right: in RTL a wrapped address comes out in the wrong order, and money goes with it", () => {
  assert.deepEqual(monoWithoutLtr(`<div className="flex font-mono">{a}</div>`).length, 1);
  assert.deepEqual(monoWithoutLtr(`<div dir="ltr" className="flex font-mono">{a}</div>`), []);
  assert.deepEqual(SCREENS.flatMap((f) => monoWithoutLtr(readFileSync(f, "utf8")).map((t) => `${f}: ${t}`)), []);
});

test("finds a word between two values in markup", () => {
  assert.deepEqual(untranslated("{a.length} token{a.length > 1 ? 's' : ''}"), ["token"]);
  assert.deepEqual(untranslated("<span>{n} paid</span>"), ["paid"]);
  assert.deepEqual(untranslated("} else {"), []);
  assert.deepEqual(untranslated("} catch {"), []);
  assert.deepEqual(untranslated("} from \"x\";"), []);
  assert.deepEqual(untranslated(`{t("{a} of {b}", { a, b })}`), []);
  assert.deepEqual(untranslated(`SL {price} USDT</span>`), []);
  assert.deepEqual(untranslated("if (a) { return b; } else if (c) {"), []);
});
