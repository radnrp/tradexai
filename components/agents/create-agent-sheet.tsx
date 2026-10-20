"use client";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown01Icon, PencilEdit02Icon, PieChartIcon, Robot01Icon, ShieldEnergyIcon, Tick02Icon, Wallet01Icon } from "@hugeicons/core-free-icons";
import { readPolicy } from "@/lib/agent-info";
import { API } from "@/lib/api/client";
import { ApiError } from "@/lib/api/session";
import type { AgentModel } from "@/lib/api/types";
import { describeError } from "@/lib/labels";
import { add, cmp, fmt, isAmount, mulBps, sub, trimZeros } from "@/lib/money";
import { useInvalidateLedger } from "@/lib/queries";
import { haptic } from "@/lib/telegram";
import { usePendingAction } from "@/lib/use-pending-action";
import { AmountDial, FlowBar } from "@/components/money/flow-ui";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icon";
import { Notice } from "@/components/ui/primitives";

// coin, side, leverage, R/R, TP/SL and dates are the server's call; sending them gets the request rejected
type Body = { modelId: string; capital: string; name?: string; planId?: string };
type IconSvg = Parameters<typeof Icon>[0]["icon"];

/** Start form for one agent: how much money it gets (and a plan, for subscriptions). Lives inside the agent sheet; its start button goes into the sheet's footer. */
export function CreateForm({ model, available, footer, onClose }: { model: AgentModel; available: string; footer: HTMLElement | null; onClose: () => void }) {
  const router = useRouter();
  const invalidate = useInvalidateLedger();
  const { run, pending } = usePendingAction<Body>("create-agent");
  const draft = pending?.body.modelId === model.id ? pending.body : null;

  const [capital, setCapital] = useState(draft?.capital ?? "");
  const [name, setName] = useState(draft?.name ?? "");
  const [naming, setNaming] = useState(!!draft?.name);
  const subscription = model.billing_mode === "subscription";
  const plans = subscription ? (model.subscriptionPlans ?? []) : [];
  const [planId, setPlanId] = useState(draft?.planId ?? plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId);
  // the plan price is a cost on top of the agent's money, both paid from available
  const budget = plan ? sub(available, plan.price) : available;
  const [busy, setBusy] = useState(false);

  const capitalError = !capital
    ? null
    : !isAmount(capital, 18, 8)
      ? "Enter a valid amount"
      : cmp(capital, model.min_capital) < 0
        ? `Min. ${fmt(model.min_capital, 0)} USDT`
        : cmp(capital, budget) > 0
          ? plan
            ? `Max ${fmt(budget)} USDT after plan`
            : `You only have ${fmt(available)} USDT`
          : null;
  const ok = !!capital && !capitalError;
  const valid = ok && (!subscription || !!plan) && name.length <= 60;
  // the risk stop: the agent ends once its value falls to this share of the money it started with
  const floorBps = model.equityFloorBps ?? 2000;
  const max = cmp(budget, "0") > 0 ? trimZeros(budget) : "0";
  // preview of one entry at the starting value: margin is a share of the agent's current value, fees are on that margin, each side
  const margin = ok ? mulBps(capital, readPolicy(model.tradePolicy).budgetBps) : null;
  const sideFee = margin ? mulBps(margin, model.fee_bps) : null;

  async function submit() {
    const body: Body = { modelId: model.id, capital };
    if (name.trim()) body.name = name.trim();
    if (plan) body.planId = plan.id;
    setBusy(true);
    try {
      const inst = await run(body, API.createInstance);
      haptic.success();
      toast.success(`${inst.name} is ready`, { description: `${fmt(inst.initial_capital)} USDT allocated` });
      invalidate();
      onClose();
      router.push(`/agents/${inst.id}`);
    } catch (e) {
      haptic.error();
      const d = describeError(e);
      if (e instanceof ApiError && e.uncertain) toast.error("Result unknown", { description: "Retry. No duplicate will be created." });
      else toast.error(d.title, { description: d.detail });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {draft && <Notice tone="warn" title="Last try didn't finish">Retry. No duplicate will be created.</Notice>}

      <FlowBar
        dir="in"
        from={{ caption: "From", title: "Your balance", icon: <Icon icon={Wallet01Icon} size={16} /> }}
        to={{ caption: "To", title: `${model.name} agent`, icon: <Icon icon={Robot01Icon} size={16} /> }}
      />

      {subscription &&
        (plans.length ? (
          <div role="radiogroup" aria-label="Plan" className="grid grid-cols-2 gap-2">
            {plans.map((p) => {
              const on = p.id === planId;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    haptic.select();
                    setPlanId(p.id);
                  }}
                  className={`relative rounded-md border p-3 text-left transition-colors ${on ? "border-primary bg-primary/6" : "border-border bg-surface-raised"}`}
                >
                  {on && <Icon icon={Tick02Icon} size={14} strokeWidth={2} className="absolute right-2.5 top-2.5 text-primary" />}
                  <div className="text-body-sm font-semibold">{p.name}</div>
                  <div className="text-caption text-muted-foreground">
                    {p.duration_months} month{p.duration_months === 1 ? "" : "s"}, {fmt(p.price)} USDT
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <Notice tone="warn">No plan is on sale for {model.name} right now.</Notice>
        ))}

      <div>
        <AmountDial
          dir="in"
          label="Capital"
          unit="USDT"
          decimals={8}
          step="50"
          value={capital}
          onChange={setCapital}
          invalid={!!capitalError}
          quick={[
            { label: "Min", value: trimZeros(model.min_capital) },
            { label: "25%", value: trimZeros(mulBps(budget, 2500)) },
            { label: "50%", value: trimZeros(mulBps(budget, 5000)) },
            { label: "Max", value: max },
          ]}
          footer={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-caption text-muted-foreground">
              <Icon icon={Wallet01Icon} size={14} />
              Available <span className="font-semibold text-foreground tabular-nums">{fmt(available)}</span> USDT
            </span>
          }
        />
        <p role={capitalError ? "alert" : undefined} className={`mt-2 px-1 text-label ${capitalError ? "text-destructive" : "font-normal text-muted-foreground"}`}>
          {capitalError ?? `Min. ${fmt(model.min_capital, 0)} USDT, more is fine`}
        </p>
      </div>

      {/* what the chosen amount means, before anything is committed */}
      <div className="grid grid-cols-3 gap-2">
        <Preview icon={PieChartIcon} label="Margin per trade (USDT)" value={margin ? fmt(margin) : "—"} />
        <Preview icon={ShieldEnergyIcon} label="Stop-out at (USDT)" value={ok ? fmt(mulBps(capital, floorBps)) : "—"} warn />
        <Preview icon={Wallet01Icon} label="Remaining (USDT)" value={ok ? fmt(sub(budget, capital)) : "—"} />
      </div>
      {margin && sideFee && (
        <p className="-mt-2 px-1 text-caption text-muted-foreground tabular-nums">
          {cmp(sideFee, "0") > 0
            ? `One trade now: ${amt(margin)} margin + ${amt(sideFee)} entry fee + ${amt(sideFee)} kept for exit = ${amt(add(margin, add(sideFee, sideFee)))} USDT.`
            : `One trade now: ${amt(margin)} USDT margin.`}{" "}
          Leverage is picked per trade. Estimate; the server sets the final amounts.
        </p>
      )}
      {plan && ok && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-surface-raised px-3.5 py-2.5 text-body-sm">
          <span className="text-muted-foreground">
            {fmt(capital)} + {fmt(plan.price)} USDT plan
          </span>
          <span className="font-semibold tabular-nums">{fmt(add(capital, plan.price))} USDT total</span>
        </div>
      )}

      {naming ? (
        <div>
          <input
            aria-label="Agent name"
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            placeholder={`My ${model.name}`}
            className={inputCls}
          />
          {name.length > 60 && <p className="mt-1.5 px-1 text-caption text-destructive">60 characters max</p>}
        </div>
      ) : (
        <button type="button" onClick={() => setNaming(true)} className="hit-area inline-flex items-center gap-1.5 self-start px-1 text-label text-muted-foreground">
          <Icon icon={PencilEdit02Icon} size={15} /> Add name
          <Icon icon={ArrowDown01Icon} size={14} />
        </button>
      )}

      {footer &&
        createPortal(
          <Button size="lg" block disabled={!valid} loading={busy} onClick={submit}>
            {ok ? `Start with ${fmt(capital)} USDT` : "Start agent"}
          </Button>,
          footer,
        )}
    </div>
  );
}

const amt = (v: string) => trimZeros(fmt(v, 4));

function Preview({ icon, label, value, warn }: { icon: IconSvg; label: string; value: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-md bg-surface-raised p-2.5">
      <Icon icon={icon} size={15} className={warn ? "text-warning" : "text-muted-foreground"} />
      <div className="mt-1.5 truncate text-body-sm font-semibold tabular-nums">{value}</div>
      <div className="text-caption leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}
