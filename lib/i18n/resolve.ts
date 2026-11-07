// Which language an open starts in. Saved first; a first open from a campaign link asks; otherwise Telegram's language.
import { campaignCode } from "../analytics.ts";
import type { Lang } from "./index.ts";

export type LangDecision = { kind: "use"; lang: Lang; save: boolean } | { kind: "ask" };

const isLang = (v: unknown): v is Lang => v === "en" || v === "fa";

/** "fa", "fa-IR" and "fa_IR" are Persian; a missing or other code isn't. */
export const isPersianCode = (code: string | null | undefined) => code?.toLowerCase().split(/[-_]/)[0] === "fa";

export function decideLang(o: { saved: unknown; telegramCode?: string | null; startParam?: string | null }): LangDecision {
  if (isLang(o.saved)) return { kind: "use", lang: o.saved, save: false };
  if (campaignCode(o.startParam)) return { kind: "ask" };
  return { kind: "use", lang: isPersianCode(o.telegramCode) ? "fa" : "en", save: true };
}

const KEY = "txai.lang.";

export function readSavedLang(userId: string, storage?: Pick<Storage, "getItem">): Lang | null {
  try {
    const v = (storage ?? localStorage).getItem(KEY + userId);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveLang(userId: string, lang: Lang, storage?: Pick<Storage, "setItem">) {
  try {
    (storage ?? localStorage).setItem(KEY + userId, lang);
  } catch {}
}
