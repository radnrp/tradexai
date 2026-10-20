// Session + transport: Telegram initData login, single-flight refresh, one retry on 401.
import { API_BASE } from "@/lib/env";
import { tg, waitForTelegram } from "@/lib/telegram";
import type { Session, User } from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public details: unknown,
    public requestId: string | null = null,
    public retryAfter: string | null = null,
  ) {
    super(serverMessage(details) ?? (status === 0 ? "Can't reach the server." : `Server error (${status})`));
  }
  /** Network failure or 5xx: a money action may or may not have happened. */
  get uncertain() {
    return this.status === 0 || this.status >= 500;
  }
}

export class NotInTelegramError extends Error {}

/** Machine-readable error code from the body, e.g. "DEPOSIT_BELOW_MINIMUM". */
export const apiErrorCode = (e: unknown) =>
  e instanceof ApiError ? ((e.details as { code?: unknown } | null)?.code as string | undefined) : undefined;

function serverMessage(d: unknown): string | null {
  const m = (d as { message?: unknown } | null)?.message;
  if (Array.isArray(m)) return m.join("\n");
  return typeof m === "string" && m ? m : null;
}

type Opts = { method?: "GET" | "POST" | "PATCH"; body?: unknown; key?: string };

async function send(path: string, o: Opts, token: string | null): Promise<Response> {
  const headers: Record<string, string> = {};
  if (o.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  if (o.key) headers["Idempotency-Key"] = o.key;
  try {
    return await fetch(`${API_BASE}/v1${path}`, {
      method: o.method ?? "GET",
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, null);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: res.ok ? "Unexpected response from server." : text.slice(0, 200) };
    if (res.ok) throw new ApiError(502, data, res.headers.get("X-Request-ID"));
  }
  if (!res.ok) throw new ApiError(res.status, data, res.headers.get("X-Request-ID"), res.headers.get("Retry-After"));
  return data as T;
}

// Tokens live in memory. The refresh token is mirrored to sessionStorage only so a WebView reload
// survives (initData is single-use, so a reload can't log in again).
// shortcut: sessionStorage is readable by any script on this origin; move to a BFF httpOnly cookie if the threat model needs it.
const STORE = "txai.session";
let access: string | null = null;
let refreshTok: string | null = null;
let uid = "";
let refreshing: Promise<boolean> | null = null;
let booting: Promise<User> | null = null;
const expiredListeners = new Set<() => void>();

function store(s: Pick<Session, "accessToken" | "refreshToken">) {
  access = s.accessToken;
  refreshTok = s.refreshToken;
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ uid, rt: s.refreshToken }));
  } catch {}
}

export function clearSession() {
  access = refreshTok = null;
  booting = null;
  try {
    sessionStorage.removeItem(STORE);
  } catch {}
}

export function onSessionExpired(cb: () => void) {
  expiredListeners.add(cb);
  return () => void expiredListeners.delete(cb);
}

/** Never retried: reusing a rotated refresh token revokes the whole session. */
function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      if (!refreshTok) return false;
      try {
        store(await parse<Session>(await send("/auth/refresh", { method: "POST", body: { refreshToken: refreshTok } }, null)));
        return true;
      } catch {
        clearSession();
        return false;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doBoot(): Promise<User> {
  const app = await waitForTelegram();
  const initData = app?.initData;
  if (!app || !initData) throw new NotInTelegramError();
  uid = String(app.initDataUnsafe.user?.id ?? "");

  let saved: { uid?: string; rt?: string } | null = null;
  try {
    saved = JSON.parse(sessionStorage.getItem(STORE) ?? "null");
  } catch {}
  if (saved?.rt && saved.uid === uid) {
    refreshTok = saved.rt;
    if (await refresh()) return api<User>("/auth/me");
  }

  const s = await parse<Session>(await send("/auth/telegram", { method: "POST", body: { initData } }, null));
  store(s);
  return s.user;
}

/** Shared boot promise so re-renders/effects never send initData twice. */
export function boot(): Promise<User> {
  booting ??= doBoot().catch((e) => {
    booting = null;
    throw e;
  });
  return booting;
}

export async function api<T>(path: string, o: Opts = {}): Promise<T> {
  let res = await send(path, o, access);
  if (res.status === 401) {
    if (await refresh()) res = await send(path, o, access);
    else expiredListeners.forEach((l) => l());
  }
  return parse<T>(res);
}

export const telegramUser = () => tg()?.initDataUnsafe.user;
