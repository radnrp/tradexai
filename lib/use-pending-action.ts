"use client";
import { useCallback, useState } from "react";
import { ApiError } from "./api/session";

type Pending<B> = { key: string; body: B; at: number };

const read = <B>(name: string): Pending<B> | null => {
  try {
    return JSON.parse(sessionStorage.getItem(`txai.pending.${name}`) ?? "null");
  } catch {
    return null;
  }
};

/**
 * Idempotency for money actions: the same body reuses the same key until the server gives a
 * definitive answer. Network errors / 5xx keep the draft (survives reload) so the user retries
 * the *same* request instead of creating a duplicate.
 */
export function usePendingAction<B>(name: string) {
  const [pending, setPending] = useState<Pending<B> | null>(() => (typeof window === "undefined" ? null : read<B>(name)));

  const settle = useCallback(() => {
    try {
      sessionStorage.removeItem(`txai.pending.${name}`);
    } catch {}
    setPending(null);
  }, [name]);

  const run = useCallback(
    async <R>(body: B, call: (body: B, key: string) => Promise<R>): Promise<R> => {
      const current = read<B>(name);
      const entry: Pending<B> =
        current && JSON.stringify(current.body) === JSON.stringify(body) ? current : { key: crypto.randomUUID(), body, at: Date.now() };
      try {
        sessionStorage.setItem(`txai.pending.${name}`, JSON.stringify(entry));
      } catch {}
      setPending(entry);
      try {
        const result = await call(body, entry.key);
        settle();
        return result;
      } catch (e) {
        if (!(e instanceof ApiError && e.uncertain)) settle();
        throw e;
      }
    },
    [name, settle],
  );

  return { pending, run, settle };
}
