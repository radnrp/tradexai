import type { StaticImageData } from "next/image";
import { NETWORK_ICONS } from "@/assets/networkIcons";
import { TOKENS } from "@/assets/tokens";
import type { DepositCurrency } from "@/lib/api/types";

/** A coin the user can pay with. `code` is the gateway code the API takes as payCurrency ("usdtbsc"). */
export type DepositToken = {
  code: string;
  currency: string;
  network: string;
  icon: StaticImageData;
  /** Smallest deposit in USD, only when the server sends one; we never invent minimums. */
  minUsd?: string;
};

const NETWORKS: Record<string, { name: string; tag?: string }> = {
  BTC: { name: "Bitcoin" },
  ERC20: { name: "Ethereum", tag: "ERC20" },
  BSC: { name: "BNB Smart Chain", tag: "BEP20" },
  TRC20: { name: "Tron", tag: "TRC20" },
  TON: { name: "GRAM" },
  ARB: { name: "Arbitrum" },
  OP: { name: "Optimism" },
  MATIC: { name: "Polygon" },
  SOL: { name: "Solana" },
  XRP: { name: "XRP Ledger" },
  DOGE: { name: "Dogecoin" },
};

export const networkInfo = (id: string) => ({ id, ...(NETWORKS[id] ?? { name: id }), icon: NETWORK_ICONS[id] as StaticImageData | undefined });

/** Display info for a coin code from our local assets (icons, network); undefined if we don't know it. */
export function tokenByCode(code: string | null | undefined): DepositToken | undefined {
  const a = TOKENS.find((t) => t.fullname === code?.toLowerCase());
  return a && { code: a.fullname, currency: a.currency, network: a.network, icon: a.icon };
}

/**
 * Our curated coins (assets/tokens.tsx) that the server can take right now. The server returns the
 * gateway's whole catalogue, including coins switched off for payments; offering one of those makes
 * POST /deposits come back "rejected".
 */
export function depositTokens(server: (DepositCurrency | string)[] | undefined): DepositToken[] {
  const usable = new Map<string, DepositCurrency>();
  for (const entry of server ?? []) {
    const c: DepositCurrency = typeof entry === "string" ? { code: entry } : entry;
    if (c.enable === false || c.available_for_payment === false) continue;
    usable.set(c.code.toLowerCase(), c);
  }
  return TOKENS.filter((t) => usable.has(t.fullname)).map((t) => {
    const min = usable.get(t.fullname)?.minUsd;
    return { code: t.fullname, currency: t.currency, network: t.network, icon: t.icon, minUsd: min != null ? String(min) : undefined };
  });
}
