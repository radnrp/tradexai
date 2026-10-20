"use client";
import Image from "next/image";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  ArrowDown01Icon,
  ArrowDown02Icon,
  Coins01Icon,
  DollarCircleIcon,
  Globe02Icon,
  QrCodeIcon,
  Refresh01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { API } from "@/lib/api/client";
import { ApiError, apiErrorCode } from "@/lib/api/session";
import { describeError } from "@/lib/labels";
import { cmp, isAmount, trimZeros } from "@/lib/money";
import { qk } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { usePendingAction } from "@/lib/use-pending-action";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState, ErrorState, Notice, Skeleton } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";
import { DepositPayment } from "./deposit-payment";
import { depositTokens, networkInfo, tokenByCode, type DepositToken } from "./options";
import { TokenIcon } from "./token-icon";
import { AmountDial, DirectionBadge, Step } from "@/components/money/flow-ui";

type Body = { amount: string; payCurrency: string };
type View = { kind: "form" } | { kind: "payment"; id: string };

const OpenDeposit = createContext<(depositId?: string) => void>(() => { });

/** Opens the deposit sheet: empty for a new deposit, or on an existing one's payment details. */
export const useOpenDeposit = () => useContext(OpenDeposit);

/** Deposits live in one bottom sheet (no page): form first, then the payment details. */
export function DepositProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // kept after closing so the content doesn't vanish mid-animation
  const [view, setView] = useState<View>({ kind: "form" });
  const show = useCallback((depositId?: string) => {
    setView(depositId ? { kind: "payment", id: depositId } : { kind: "form" });
    setOpen(true);
  }, []);
  const close = () => setOpen(false);

  return (
    <OpenDeposit.Provider value={show}>
      {children}
      <Sheet
        open={open}
        onClose={close}
        title="Deposit"
        subtitle={view.kind === "form" ? "Add to your account" : "Send your payment"}
        icon={<DirectionBadge dir="in" icon={ArrowDown02Icon} />}
      >
        {view.kind === "form" ? (
          <DepositForm onCreated={(id) => setView({ kind: "payment", id })} />
        ) : (
          <DepositPayment key={view.id} id={view.id} onNew={() => setView({ kind: "form" })} onDone={close} />
        )}
      </Sheet>
    </OpenDeposit.Provider>
  );
}

function DepositForm({ onCreated }: { onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const currencies = useQuery({ queryKey: ["deposit-currencies"], queryFn: API.depositCurrencies, staleTime: 5 * 60_000 });
  const { run, pending, settle } = usePendingAction<Body>("deposit");
  const draft = tokenByCode(pending?.body.payCurrency);

  const [chosenNetwork, setNetwork] = useState<string | null>(draft?.network ?? null);
  const [code, setCode] = useState<string | null>(draft?.code ?? null);
  const [amount, setAmount] = useState(pending?.body.amount ?? "");
  const [picking, setPicking] = useState<"network" | "token" | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  // the server turned the last request down (coin, minimum or provider); the form stays filled in
  const [rejected, setRejected] = useState(false);
  // DEPOSIT_BELOW_MINIMUM: the server's message, and its minimum so the user can fix it in one tap
  const [belowMin, setBelowMin] = useState<{ message: string; minUsd?: string } | null>(null);
  const clearErrors = () => {
    setRejected(false);
    setBelowMin(null);
  };

  const tokens = useMemo(() => depositTokens(currencies.data?.currencies), [currencies.data]);
  const networks = [...new Set(tokens.map((t) => t.network))];
  // a refreshed list can drop the chosen network; then it simply counts as not chosen
  const network = chosenNetwork && networks.includes(chosenNetwork) ? chosenNetwork : null;
  const onNetwork = tokens.filter((t) => t.network === network);
  const token = onNetwork.find((t) => t.code === code) ?? null;
  const net = network ? networkInfo(network) : null;

  const minUsd = token?.minUsd;
  const underMin = !!minUsd && isAmount(amount, 10, 2) && cmp(amount, minUsd) < 0;
  const amountError = !amount
    ? "Enter an amount"
    : !isAmount(amount, 10, 2)
      ? "Max 2 decimals"
      : underMin
        ? `The minimum for ${token!.currency} is $${trimZeros(minUsd!)}`
        : null;
  // a too-small amount is worth saying as soon as it's typed; the rest waits for the button
  const showAmountError = !!token && !!amountError && (tried || underMin);

  function pickNetwork(id: string) {
    haptic.select();
    clearErrors();
    setNetwork(id);
    const coins = tokens.filter((t) => t.network === id);
    // one coin on this network: nothing to choose
    if (coins.length === 1) {
      setCode(coins[0].code);
      setPicking(null);
    } else {
      if (!coins.some((t) => t.code === code)) setCode(null);
      setPicking("token");
    }
  }

  async function submit() {
    setTried(true);
    if (!token) return setPicking(network ? "token" : "network");
    if (amountError) return haptic.error();
    setBusy(true);
    clearErrors();
    try {
      const d = await run({ amount, payCurrency: token.code }, API.createDeposit);
      qc.invalidateQueries({ queryKey: qk.deposits });
      // turned down on the spot: nothing to pay, so keep the user here to change coin or amount
      if (d.status === "rejected") {
        haptic.error();
        setRejected(true);
        return;
      }
      haptic.success();
      qc.setQueryData(["deposit", d.id], d);
      onCreated(d.id);
    } catch (e) {
      haptic.error();
      const code = apiErrorCode(e);
      // these three never create a deposit, so the next try starts fresh
      if (code === "DEPOSIT_BELOW_MINIMUM" && e instanceof ApiError) {
        settle();
        const min = (e.details as { details?: { minUsd?: unknown } } | null)?.details?.minUsd;
        setBelowMin({ message: e.message, minUsd: min != null ? String(min) : undefined });
      } else if (code === "DEPOSIT_CURRENCY_UNAVAILABLE") {
        settle();
        setCode(null);
        setPicking("token");
        qc.invalidateQueries({ queryKey: ["deposit-currencies"] });
        toast.error("Token unavailable", { description: "Pick another token." });
      } else if (code === "DEPOSIT_PROVIDER_UNAVAILABLE") {
        settle();
        toast.error("Deposits are busy", { description: "Try again shortly." });
      } else {
        const d = describeError(e);
        if (e instanceof ApiError && e.uncertain) toast.error("Not sure it worked", { description: "Retry. No duplicate will be created." });
        else toast.error(d.title, { description: d.detail });
      }
    } finally {
      setBusy(false);
    }
  }

  if (currencies.isPending)
    return (
      <div className="flex flex-col gap-3" aria-busy aria-label="Loading tokens">
        <Skeleton className="h-14 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-40 rounded-lg" />
      </div>
    );
  if (currencies.isError) return <ErrorState error={currencies.error} onRetry={() => currencies.refetch()} />;
  if (!tokens.length)
    return (
      <EmptyState
        icon={<Icon icon={Coins01Icon} size={28} />}
        title="Deposits are paused"
        body="Try again later."
        action={
          <Button variant="secondary" size="sm" icon={<Icon icon={Refresh01Icon} size={16} />} onClick={() => currencies.refetch()}>
            Try again
          </Button>
        }
      />
    );

  return (
    <div className="flex flex-col gap-4">
      {pending && (
        <Notice tone="warn" title="Last try didn't finish">
          Retry. You won&apos;t be charged twice.
        </Notice>
      )}

      <Step n={1} icon={Coins01Icon} title="Network & token" body="Must match your wallet" done={!!token}>
        <div className="grid grid-cols-2 gap-2">
          <Trigger
            label="Network"
            open={picking === "network"}
            onToggle={() => setPicking(picking === "network" ? null : "network")}
            placeholder="Select"
            value={net && <Picked icon={net.icon ? <Image src={net.icon} alt="" width={20} height={20} className="size-5 rounded-full" /> : <Icon icon={Globe02Icon} size={18} />} name={net.name} />}
          />
          <Trigger
            label="Token"
            open={picking === "token"}
            disabled={!network}
            onToggle={() => setPicking(picking === "token" ? null : "token")}
            placeholder={network ? "Select" : "Network first"}
            value={token && <Picked icon={<TokenIcon token={token} size={20} />} name={token.currency} />}
          />
        </div>
        <AnimatePresence initial={false}>
          {(picking === "network" || (picking === "token" && network)) && (
            <motion.ul
              role="listbox"
              aria-label={picking === "network" ? "Networks" : "Tokens"}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="mt-2 max-h-56 overflow-y-auto rounded-md border border-primary bg-surface-raised p-1.5"
            >
              {picking === "network"
                ? networks.map((id) => (
                    <Option key={id} selected={id === network} onSelect={() => pickNetwork(id)}>
                      <NetworkLabel id={id} />
                      <span className="ml-auto text-caption text-muted-foreground">
                        {tokens.filter((t) => t.network === id).length} token{tokens.filter((t) => t.network === id).length > 1 ? "s" : ""}
                      </span>
                    </Option>
                  ))
                : onNetwork.map((t) => (
                    <Option
                      key={t.code}
                      selected={t.code === code}
                      onSelect={() => {
                        haptic.select();
                        clearErrors();
                        setCode(t.code);
                        setPicking(null);
                      }}
                    >
                      <TokenLabel token={t} />
                      {t.minUsd && <span className="ml-auto text-caption text-muted-foreground tabular-nums">Min ${trimZeros(t.minUsd)}</span>}
                    </Option>
                  ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </Step>

      <Step n={2} icon={DollarCircleIcon} title="Amount" body={minUsd ? `USD · min $${trimZeros(minUsd)}` : "USD"} done={!!amount && !amountError} disabled={!token}>
        <AmountDial
          dir="in"
          label="You deposit"
          prefix="$"
          decimals={2}
          step="10"
          quick={["25", "50", "100", "250", "500"].map((v) => ({ label: `$${v}`, value: v }))}
          value={amount}
          onChange={(v) => {
            clearErrors();
            setAmount(v);
          }}
          invalid={showAmountError || !!belowMin}
          disabled={!token}
          footer={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-caption text-muted-foreground">
              {token ? (
                <>
                  Pay in <TokenIcon token={token} size={14} />
                  <span className="font-semibold text-foreground">{token.currency}</span>· get USDT
                </>
              ) : (
                "Pick a token first"
              )}
            </span>
          }
        />
        {showAmountError ? (
          <p role="alert" className="mt-2 px-1 text-label text-destructive">
            {amountError}
          </p>
        ) : (
          belowMin && (
            <div role="alert" className="mt-2 flex items-center justify-between gap-3 px-1">
              <p className="text-label text-destructive">{belowMin.message}</p>
              {belowMin.minUsd && (
                <button
                  type="button"
                  onClick={() => {
                    haptic.select();
                    setAmount(trimZeros(String(Math.ceil(Number(belowMin.minUsd) * 100) / 100)));
                    setBelowMin(null);
                  }}
                  className="hit-area shrink-0 rounded-full bg-surface-raised px-3 py-1.5 text-label font-semibold text-foreground"
                >
                  Use ${trimZeros(belowMin.minUsd)}
                </button>
              )}
            </div>
          )
        )}
      </Step>

      {rejected && (
        <Notice tone="bad" title="Couldn't start this deposit">
          Try a bigger amount or another token.
        </Notice>
      )}

      <Button size="lg" block loading={busy} icon={<Icon icon={QrCodeIcon} size={18} />} onClick={submit}>
        Get deposit address
      </Button>
    </div>
  );
}

/** Compact picker button: caption on top, the chosen value (or a hint) underneath. */
function Trigger({
  label,
  open,
  onToggle,
  disabled,
  placeholder,
  value,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  disabled?: boolean;
  placeholder: string;
  value: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-expanded={open}
      className={`flex min-h-14 w-full items-center gap-2 rounded-md border bg-surface-raised px-3 py-2 text-left transition-colors disabled:opacity-50 ${open ? "border-primary" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-caption text-muted-foreground">{label}</span>
        {value ?? <span className="block text-body-sm text-subtle">{placeholder}</span>}
      </span>
      <Icon icon={ArrowDown01Icon} size={16} className={`shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
    </button>
  );
}

function Picked({ icon, name }: { icon: React.ReactNode; name: string }) {
  return (
    <span className="mt-0.5 flex items-center gap-1.5">
      <span className="shrink-0">{icon}</span>
      <span className="line-clamp-2 text-body-sm leading-tight font-semibold">{name}</span>
    </span>
  );
}

function Option({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <li role="option" aria-selected={selected}>
      <button type="button" onClick={onSelect} className={`flex min-h-13 w-full items-center gap-3 rounded-sm px-2 text-left transition-colors ${selected ? "bg-foreground/8" : "active:bg-foreground/5"}`}>
        {children}
        <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-foreground bg-foreground text-background" : "border-subtle"}`}>
          {selected && <Icon icon={Tick02Icon} size={12} strokeWidth={2.5} />}
        </span>
      </button>
    </li>
  );
}

function NetworkLabel({ id }: { id: string }) {
  const n = networkInfo(id);
  return (
    <span className="flex min-w-0 items-center gap-3">
      {n.icon ? <Image src={n.icon} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full" /> : <Icon icon={Globe02Icon} size={24} />}
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold">{n.name}</span>
        {n.tag && <span className="block text-caption text-muted-foreground">{n.tag}</span>}
      </span>
    </span>
  );
}

function TokenLabel({ token }: { token: DepositToken }) {
  const badge = networkInfo(token.network).icon;
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className="relative shrink-0">
        <TokenIcon token={token} size={32} />
        {/* small network badge, the way wallets show "USDT on BSC" */}
        {badge && (
          <Image src={badge} alt="" width={14} height={14} className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-surface-raised" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-body-sm font-semibold">{token.currency}</span>
        <span className="block text-caption text-muted-foreground">on {networkInfo(token.network).name}</span>
      </span>
    </span>
  );
}
