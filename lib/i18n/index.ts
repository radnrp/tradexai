// The app's two languages. The English text is the key, so plain lib/ functions translate without hooks and read as they did.
// A table built at import keeps keys and calls t() at render: at import the language isn't known yet.
import { fa } from "./fa.ts";

export type Lang = "en" | "fa";
export type Key = keyof typeof fa;
export type Values = Record<string, string | number>;

let lang: Lang = "en";

export const getLang = (): Lang => lang;

export function setLang(l: Lang) {
  lang = l;
}

/** Multiply a horizontal motion offset by this: forward runs the other way in RTL. */
export const dirSign = (): 1 | -1 => (lang === "fa" ? -1 : 1);

/** Keeps a value's sign, percent or Latin text in one piece inside a Persian sentence. */
export const isolate = (v: string | number) => `⁨${v}⁩`;

export function t(key: Key, values?: Values): string {
  const text: string = lang === "fa" ? (fa[key] ?? key) : key;
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (hole, name) => {
    if (!(name in values)) return hole;
    return lang === "fa" ? isolate(values[name]) : String(values[name]);
  });
}
