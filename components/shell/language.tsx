"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { setLang, type Lang } from "@/lib/i18n";
import { decideLang, readSavedLang, saveLang } from "@/lib/i18n/resolve";
import { tg, waitForTelegram } from "@/lib/telegram";

export type LangPhase = { kind: "resolving" } | { kind: "ask" } | { kind: "ready"; lang: Lang };

const LangCtx = createContext<{ phase: LangPhase; choose: (l: Lang) => void } | null>(null);

export function useLanguage() {
  const v = useContext(LangCtx);
  if (!v) throw new Error("useLanguage outside LanguageProvider");
  return v;
}

// before the state update: the first render in a language reads t()
function apply(lang: Lang) {
  setLang(lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
}

const telegramUserId = () => {
  const id = tg()?.initDataUnsafe.user?.id;
  return id == null ? null : String(id);
};

/**
 * Starts as "resolving" on the server and in the first client render: the language needs Telegram's SDK, and until it's known
 * the boot screen shows only the logo, so a Persian user never sees English first.
 */
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<LangPhase>({ kind: "resolving" });

  useEffect(() => {
    let alive = true;
    waitForTelegram().then((app) => {
      if (!alive) return;
      const id = app?.initData ? telegramUserId() : null;
      // outside Telegram there's no one to remember a choice for
      const d = id == null ? ({ kind: "use", lang: "en", save: false } as const) : decideLang({ saved: readSavedLang(id), telegramCode: app?.initDataUnsafe.user?.language_code, startParam: app?.initDataUnsafe.start_param });
      if (d.kind === "ask") return setPhase({ kind: "ask" });
      apply(d.lang);
      if (d.save && id != null) saveLang(id, d.lang);
      setPhase({ kind: "ready", lang: d.lang });
    });
    return () => {
      alive = false;
    };
  }, []);

  const choose = useCallback((lang: Lang) => {
    apply(lang);
    const id = telegramUserId();
    if (id != null) saveLang(id, lang);
    setPhase({ kind: "ready", lang });
  }, []);

  const value = useMemo(() => ({ phase, choose }), [phase, choose]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
