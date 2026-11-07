// Campaign analytics helpers (contract 2026-10-25). Pure: no app imports, so the session layer can use them without a cycle.
// Analytics never carries initData, a token, the Telegram id or a wallet address, and its failures are never logged.

const PREFIX = "cmp_";
const CODE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * The campaign in a start param ("cmp_launch_20261025" → "launch_20261025"), or undefined. Anything else, a referral code
 * included, isn't a campaign. A malformed code is left out: the server would turn the whole visit down.
 */
export function campaignCode(startParam: string | null | undefined): string | undefined {
  if (!startParam?.startsWith(PREFIX)) return undefined;
  const code = startParam.slice(PREFIX.length);
  return CODE.test(code) ? code : undefined;
}

type RandomSource = { randomUUID?: () => string; getRandomValues: (array: Uint8Array) => Uint8Array };

/** A random v4 UUID; built from getRandomValues on WebViews without crypto.randomUUID. */
export function uuid4(c: RandomSource = crypto): string {
  if (typeof c.randomUUID === "function") return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** A stored id is reused only when the server would take it; anything else would get the sign-in turned down. */
export const isUuid4 = (v: unknown): v is string => typeof v === "string" && V4.test(v);

/**
 * Runs `send` until it succeeds, retrying only `retryable` errors, up to `tries` times with a doubling delay. Never throws:
 * analytics must not break sign-in or a deposit. The caller keeps the same ids across tries, so the server counts it once.
 */
export async function quietly(send: () => Promise<unknown>, o: { tries: number; delayMs: number; retryable: (e: unknown) => boolean }): Promise<boolean> {
  for (let n = 0; n < o.tries; n++) {
    try {
      await send();
      return true;
    } catch (e) {
      if (!o.retryable(e) || n === o.tries - 1) return false;
      await new Promise((r) => setTimeout(r, o.delayMs * 2 ** n));
    }
  }
  return false;
}
