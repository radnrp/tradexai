// Thin typing over window.Telegram.WebApp (loaded from telegram.org in the root layout).

export interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser; start_param?: string };
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: {
    impactOccurred(s: "light" | "medium" | "heavy" | "rigid" | "soft"): void;
    notificationOccurred(t: "error" | "success" | "warning"): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg = (): TgWebApp | undefined => (typeof window === "undefined" ? undefined : window.Telegram?.WebApp);

/** The SDK script doesn't block hydration, so wait briefly for it. */
export async function waitForTelegram(timeoutMs = 4000): Promise<TgWebApp | undefined> {
  const start = Date.now();
  while (!tg() && Date.now() - start < timeoutMs) await new Promise((r) => setTimeout(r, 50));
  return tg();
}

const at = (v: string) => tg()?.isVersionAtLeast?.(v) ?? false;

export const haptic = {
  tap: () => at("6.1") && tg()?.HapticFeedback?.impactOccurred("light"),
  select: () => at("6.1") && tg()?.HapticFeedback?.selectionChanged(),
  success: () => at("6.1") && tg()?.HapticFeedback?.notificationOccurred("success"),
  error: () => at("6.1") && tg()?.HapticFeedback?.notificationOccurred("error"),
  warn: () => at("6.1") && tg()?.HapticFeedback?.notificationOccurred("warning"),
};

export function setupTelegramChrome(color: string) {
  const app = tg();
  if (!app) return;
  app.ready();
  app.expand();
  if (at("6.1")) {
    app.setHeaderColor(color);
    app.setBackgroundColor(color);
  }
  if (at("7.10")) app.setBottomBarColor?.(color);
  if (at("7.7")) app.disableVerticalSwipes?.(); // scrolling shouldn't swipe the app closed
}

export function openExternal(url: string) {
  const app = tg();
  if (url.startsWith("https://t.me/") && app && at("6.1")) app.openTelegramLink(url);
  else if (app && at("6.1")) app.openLink(url);
  else window.open(url, "_blank", "noopener");
}
