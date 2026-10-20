"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Refresh01Icon, SentIcon, WifiOff01Icon } from "@hugeicons/core-free-icons";
import { boot, clearSession, NotInTelegramError, onSessionExpired } from "@/lib/api/session";
import type { User } from "@/lib/api/types";
import { BOT_USERNAME, MINI_APP_SHORT_NAME } from "@/lib/env";
import { describeError } from "@/lib/labels";
import { setupTelegramChrome, tg } from "@/lib/telegram";
import { DepositProvider } from "@/components/deposit/deposit-sheet";
import { WithdrawProvider } from "@/components/withdraw/withdraw-sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Logo } from "./logo";
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
      qc.clear();
      setState({ kind: "expired" });
    });
  }, [run, qc]);

  return (
    <AnimatePresence mode="wait">
      {state.kind === "ready" ? (
        <motion.div key="app" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
          <UserCtx.Provider value={{ user: state.user }}>
            <DepositProvider>
              <WithdrawProvider>
                <TelegramBackButton />
                <OfflineBanner />
                {children}
                <BottomNav />
              </WithdrawProvider>
            </DepositProvider>
          </UserCtx.Provider>
        </motion.div>
      ) : (
        <motion.div key={state.kind} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
          <Gate state={state} retry={retry} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Gate({ state, retry }: { state: Exclude<State, { kind: "ready" }>; retry: () => void }) {
  const botLink = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}${MINI_APP_SHORT_NAME ? `/${MINI_APP_SHORT_NAME}` : ""}` : null;
  const content = {
    booting: { title: "Signing you in", body: "Verifying your Telegram account…" },
    outside: { title: "Open TradeXai in Telegram", body: "This app runs inside Telegram." },
    error: { title: describeError((state as { error?: unknown }).error).title, body: describeError((state as { error?: unknown }).error).detail ?? "" },
    expired: { title: "Your session ended", body: "Reopen the app from Telegram." },
  }[state.kind];

  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Logo animated={state.kind === "booting"} size={64} />
      <h1 className="mt-6 text-h1">{content.title}</h1>
      <p className="mt-2 max-w-xs text-body-sm text-muted-foreground">{content.body}</p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
        {state.kind === "error" && (
          <Button size="lg" block onClick={retry} icon={<Icon icon={Refresh01Icon} size={18} />}>
            Try again
          </Button>
        )}
        {state.kind === "expired" && tg()?.initData && (
          <Button size="lg" variant="secondary" block onClick={() => tg()?.close()}>
            Close app
          </Button>
        )}
        {state.kind === "outside" && botLink && (
          <Button size="lg" block as="a" href={botLink} icon={<Icon icon={SentIcon} size={18} />}>
            Open in Telegram
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
            You&apos;re offline. We&apos;ll refresh when you reconnect.
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
