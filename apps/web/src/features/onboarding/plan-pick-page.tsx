"use client";

import { Check } from "lucide-react";
import { type FormEvent, useState } from "react";

import { getPlanMaterial, type PlanMaterial } from "../marketing/plan-card-material";

type PlanKey = "free" | "solo" | "team" | "brokerage";

type PlanCard = {
  key: PlanKey;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  highlight: boolean;
  features: ReadonlyArray<string>;
};

const PLAN_CARDS: ReadonlyArray<PlanCard> = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "A live demo using your real leads.",
    highlight: false,
    features: [
      "100 social turns / month",
      "50 voice minutes / month",
      "3 listings, 1 seat",
      "Approval-first replies",
      "Pay-as-you-go past the free quota",
    ],
  },
  {
    key: "solo",
    name: "Solo",
    price: "$299",
    cadence: "/ month",
    tagline: "Single agent running a serious desk.",
    highlight: false,
    features: [
      "2,000 social turns + 500 voice minutes",
      "10 listings, 2 seats",
      "Auto-send when policy allows",
      "Follow Up Boss sync",
      "Workspace memory",
    ],
  },
  {
    key: "team",
    name: "Team",
    price: "$799",
    cadence: "/ month",
    tagline: "Small team, one operator.",
    highlight: true,
    features: [
      "8,000 social turns + 2,000 voice minutes",
      "50 listings, 10 seats",
      "Routing profiles + agent assignment",
      "Calendar showings + tour booking",
      "Cross-deal workspace memory",
    ],
  },
  {
    key: "brokerage",
    name: "Brokerage",
    price: "$1,500",
    cadence: "/ month",
    tagline: "Multi-agent operation.",
    highlight: false,
    features: [
      "25,000 social turns + 6,000 voice minutes",
      "Unlimited listings + seats",
      "Owner review queue",
      "Multi-Page / IG support",
      "Priority support",
    ],
  },
];

const PAID_PLANS: ReadonlySet<PlanKey> = new Set<PlanKey>(["solo", "team", "brokerage"]);

export function PlanPickPage({ defaultWorkspaceName }: { defaultWorkspaceName: string }) {
  const [workspaceName, setWorkspaceName] = useState(defaultWorkspaceName);
  const [selected, setSelected] = useState<PlanKey>("team");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const trimmedName = workspaceName.trim();
      if (trimmedName.length < 2) {
        setError("Give your workspace a name (at least 2 characters).");
        setIsSubmitting(false);
        return;
      }

      const createResponse = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, planTier: selected }),
      });
      if (!createResponse.ok) {
        setError("Could not create the workspace. Try again.");
        setIsSubmitting(false);
        return;
      }
      const { workspaceId } = (await createResponse.json()) as { workspaceId: string };

      if (!PAID_PLANS.has(selected)) {
        window.location.assign("/onboarding/setup");
        return;
      }

      const checkoutResponse = await fetch(
        `/api/workspaces/${workspaceId}/billing/checkout`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            planTier: selected,
            billingInterval: "month",
            returnPath: "/onboarding/setup",
          }),
        },
      );
      if (!checkoutResponse.ok) {
        setError("Created your workspace, but Stripe checkout failed to start. Open Settings to pick a plan.");
        setIsSubmitting(false);
        return;
      }
      const { url } = (await checkoutResponse.json()) as { url: string };
      window.location.assign(url);
    } catch {
      setError("Network error. Try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0d0f] px-5 py-10 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(123,166,255,0.08), transparent 55%)," +
            "radial-gradient(ellipse at 80% 100%, rgba(154,181,170,0.08), transparent 55%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[1180px]">
        <header className="mb-10 text-center">
          <div className="font-display text-[14px] uppercase tracking-[0.18em] text-white/45">
            step 1 of 2
          </div>
          <h1 className="mt-3 font-display text-[34px] font-medium leading-tight tracking-[-0.02em] sm:text-[40px]">
            Pick your starting plan.
          </h1>
          <p className="mx-auto mt-3 max-w-[560px] text-[14px] leading-6 text-white/65">
            No card required for Free. Paid plans unlock workspace memory, FUB sync, auto-send, and more seats.
            You can change tier anytime.
          </p>
        </header>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="mx-auto mb-8 max-w-[520px]">
            <label className="block">
              <span className="mb-2 block text-[11px] uppercase tracking-[0.12em] text-white/55">
                Workspace name
              </span>
              <input
                autoComplete="organization"
                className="h-12 w-full rounded-[14px] border border-white/15 bg-white/[0.04] px-4 text-[15px] text-white placeholder-white/35 outline-none transition focus:border-white/35 focus:bg-white/[0.06]"
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="e.g. Prestige Realty"
                required
                value={workspaceName}
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_CARDS.map((card) => (
              <PlanRadio
                key={card.key}
                card={card}
                selected={selected === card.key}
                onSelect={() => setSelected(card.key)}
              />
            ))}
          </div>

          {error !== null ? (
            <div className="mx-auto mt-6 max-w-[520px] rounded-[12px] border border-red-400/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
              {error}
            </div>
          ) : null}

          <div className="mx-auto mt-10 flex max-w-[520px] flex-col items-center gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-6 text-[14px] font-semibold text-[#0a0d0f] shadow-[0_18px_40px_-15px_rgba(255,255,255,0.4)] transition hover:brightness-105 disabled:opacity-60"
            >
              {isSubmitting
                ? "Setting up..."
                : PAID_PLANS.has(selected)
                ? `Continue to checkout — ${PLAN_CARDS.find((card) => card.key === selected)?.price}/mo`
                : "Start with Free"}
            </button>
            <p className="text-[11px] text-white/40">
              {PAID_PLANS.has(selected)
                ? "Stripe handles billing. You'll come back here after payment."
                : "You can add a payment method anytime in Settings."}
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

function PlanRadio({
  card,
  selected,
  onSelect,
}: {
  card: PlanCard;
  selected: boolean;
  onSelect: () => void;
}) {
  const material: PlanMaterial = getPlanMaterial(card.key);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="group relative flex flex-col overflow-hidden rounded-[18px] p-5 text-left transition-transform duration-300 will-change-transform hover:-translate-y-0.5"
      style={{
        background: material.background,
        border: `1px solid ${selected ? material.accentColor : material.ringColor}`,
        boxShadow: selected
          ? `${material.edgeShadow}, 0 0 0 2px ${material.accentColor}55, 0 30px 60px -25px rgba(0,0,0,0.6), 0 0 70px -30px ${material.ringColor}`
          : `${material.edgeShadow}, 0 30px 60px -25px rgba(0,0,0,0.6), 0 0 70px -30px ${material.ringColor}`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.06)_50%,transparent_65%)] bg-[length:250%_100%] transition-transform duration-1000 ease-out group-hover:translate-x-full"
      />

      <div className="relative flex items-center justify-between">
        <h3 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-white">
          {card.name}
        </h3>
        {card.highlight ? (
          <span
            className="rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.1em]"
            style={{
              background: `${material.accentColor}1f`,
              borderColor: material.ringColor,
              color: material.accentColor,
              fontFamily: "var(--font-mono)",
            }}
          >
            most teams
          </span>
        ) : null}
      </div>

      <div className="relative mt-3 flex items-baseline gap-1.5">
        <span
          className="bg-clip-text text-[32px] font-semibold leading-none tracking-[-0.03em] text-transparent"
          style={{
            backgroundImage: material.textShimmer,
            fontFamily: "var(--font-display)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {card.price}
        </span>
        <span className="text-[11px] text-white/45">{card.cadence}</span>
      </div>
      <p className="relative mt-1 text-[12px] text-white/65">{card.tagline}</p>

      <ul className="relative mt-4 flex-1 space-y-1.5 text-[12px] text-white/85">
        {card.features.map((feature) => (
          <li key={feature} className="flex items-start gap-1.5">
            <Check
              className="mt-0.5 size-3 shrink-0"
              aria-hidden="true"
              style={{ color: material.accentColor }}
            />
            {feature}
          </li>
        ))}
      </ul>

      <div
        className="relative mt-5 inline-flex h-8 items-center justify-center rounded-full px-3 text-[11px] font-medium transition"
        style={{
          background: selected ? `${material.accentColor}33` : "rgba(255,255,255,0.04)",
          color: selected ? material.accentColor : "rgba(255,255,255,0.65)",
          border: `1px solid ${selected ? material.accentColor : material.ringColor}`,
        }}
      >
        {selected ? "Selected" : "Choose this plan"}
      </div>
    </button>
  );
}
