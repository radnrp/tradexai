"use client";
import { createContext, Fragment, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Refresh01Icon, SentIcon, WifiOff01Icon } from "@hugeicons/core-free-icons";
import { boot, clearSession, NotInTelegramError, onSessionExpired } from "@/lib/api/session";
import type { User } from "@/lib/api/types";
import { BOT_USERNAME, MINI_APP_SHORT_NAME } from "@/lib/env";
import { t } from "@/lib/i18n";
import { describeError } from "@/lib/labels";
import { setupTelegramChrome, tg } from "@/lib/telegram";
import { DepositProvider } from "@/components/deposit/deposit-sheet";
import { resetProfitEvents } from "@/components/trader/profit-events";
import { WithdrawProvider } from "@/components/withdraw/withdraw-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { useLanguage } from "./language";
import { LanguagePicker } from "./language-picker";
import { LiveTicker } from "./live-ticker";
import { Logo } from "./logo";
import { FeedbackPrompt } from "@/components/feedback/feedback-prompt";
import { NotificationLink } from "./notification-link";
import { BottomNav, TAB_ROOTS } from "./bottom-nav";

type State =
  | { kind: "booting" }
  | { kind: "ready"; user: User }
  | { kind: "outside" }
  | { kind: "error"; error: unknown }
  | { kind: "expired" };

const UserCtx = createContext<{ user: User } | null>(null);

export function useSession() {
  const v = useContext(UserCtx);
  if (!v) throw new Error("useSession outside BootGate");
  return v;
}

export function BootGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ kind: "booting" });
  const { phase } = useLanguage();
  const qc = useQueryClient();

  const run = useCallback(() => {
    boot()
      .then((user) => setState({ kind: "ready", user }))
      .catch((error) => setState(error instanceof NotInTelegramError ? { kind: "outside" } : { kind: "error", error }));
  }, []);
  const retry = useCallback(() => {
    setState({ kind: "booting" });
    run();
  }, [run]);

  useEffect(() => {
    setupTelegramChrome("#181a1c");
    run();
    return onSessionExpired(() => {
      clearSession();
      // the profit-event cursor belongs to this session only
      resetProfitEvents();
      qc.clear();
      setState({ kind: "expired" });
    });
  }, [run, qc]);

  return (
    <AnimatePresence mode="wait">
      {phase.kind === "ask" ? (
        <motion.div key="language" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <LanguagePicker />
        </motion.div>
      ) : state.kind === "ready" && phase.kind === "ready" ? (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <UserCtx.Provider value={{ user: state.user }}>
            {/* a language change re-renders every screen in the new language; the query cache sits above this and stays */}
            <Fragment key={phase.lang}>
              <DepositProvider>
                <WithdrawProvider>
                  <TelegramBackButton />
                  <NotificationLink />
                  <FeedbackPrompt userId={state.user.id} />
                  <OfflineBanner />
                  <LiveTicker />
                  {children}
                  <BottomNav />
                </WithdrawProvider>
              </DepositProvider>
            </Fragment>
          </UserCtx.Provider>
        </motion.div>
      ) : (
        <motion.div key={state.kind === "ready" ? "booting" : state.kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <Gate state={state.kind === "ready" ? { kind: "booting" } : state} retry={retry} silent={phase.kind === "resolving"} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** `silent`: the logo alone, while the language isn't known yet. */
function Gate({ state, retry, silent }: { state: Exclude<State, { kind: "ready" }>; retry: () => void; silent: boolean }) {
  const botLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}${MINI_APP_SHORT_NAME ? `/${MINI_APP_SHORT_NAME}` : ""}` : null;
  if (silent) {
    return (
      <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-8 text-center">
        <Logo animated size={64} />
      </main>
    );
  }
  const content = {
    booting: { title: t("Signing you in"), body: t("Verifying your Telegram account…") },
    outside: { title: t("Open TradeXai in Telegram"), body: t("This app runs inside Telegram.") },
    error: { title: describeError((state as { error?: unknown }).error).title, body: describeError((state as { error?: unknown }).error).detail ?? "" },
    expired: { title: t("Your session ended"), body: t("Reopen the app from Telegram.") },
  }[state.kind];

  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Logo animated={state.kind === "booting"} size={64} />
      <h1 className="mt-6 text-h1">{content.title}</h1>
      <p className="mt-2 max-w-xs text-body-sm text-muted-foreground [unicode-bidi:plaintext]">{content.body}</p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        {state.kind === "error" && (
          <Button size="lg" block onClick={retry} icon={<Icon icon={Refresh01Icon} size={18} />}>
            {t("Try again")}
          </Button>
        )}
        {state.kind === "expired" && tg()?.initData && (
          <Button size="lg" variant="secondary" block onClick={() => tg()?.close()}>
            {t("Close app")}
          </Button>
        )}
        {state.kind === "outside" && botLink && (
          <Button size="lg" block as="a" href={botLink} icon={<Icon icon={SentIcon} size={18} />}>
            {t("Open in Telegram")}
          </Button>
        )}
      </div>
    </main>
  );
}

/** Network state is always visible; React Query refetches by itself once the connection is back. */
function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="pt-safe pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4"
        >
          <div className="mt-2 flex items-center gap-2 rounded-full bg-surface-raised px-4 py-2 text-label text-foreground shadow-[0_8px_24px_-12px_rgb(0_0_0/0.6)]">
            <Icon icon={WifiOff01Icon} size={16} className="text-warning" />
            {t("You're offline. We'll refresh when you reconnect.")}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TelegramBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    const back = tg()?.BackButton;
    if (!back || !tg()?.isVersionAtLeast("6.1")) return;
    const onBack = () => (window.history.length > 1 ? router.back() : router.push("/"));
    if (TAB_ROOTS.includes(pathname)) back.hide();
    else back.show();
    back.onClick(onBack);
    return () => back.offClick(onBack);
  }, [pathname, router]);
  return null;
}
