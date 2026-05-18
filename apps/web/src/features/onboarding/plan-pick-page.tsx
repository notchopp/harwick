"use client";

import { motion } from "motion/react";
import { type FormEvent, useState } from "react";

import { getPlanMaterial, type PlanMaterial } from "../marketing/plan-card-material";

type PlanKey = "free" | "solo" | "team" | "brokerage";

type PlanCard = {
  key: PlanKey;
  name: string;
  price: string;
  cadence: string;
  capacity: string;
  highlight: boolean;
};

const PLAN_CARDS: ReadonlyArray<PlanCard> = [
  {
    key: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    capacity: "1 seat",
    highlight: false,
  },
  {
    key: "solo",
    name: "Solo",
    price: "$299",
    cadence: "/ month",
    capacity: "2 seats",
    highlight: false,
  },
  {
    key: "team",
    name: "Team",
    price: "$799",
    cadence: "/ month",
    capacity: "10 seats",
    highlight: true,
  },
  {
    key: "brokerage",
    name: "Brokerage",
    price: "$1,500",
    cadence: "/ month",
    capacity: "Unlimited seats",
    highlight: false,
  },
];

const PAID_PLANS: ReadonlySet<PlanKey> = new Set<PlanKey>(["solo", "team", "brokerage"]);

const fade = {
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] as const } },
};

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
    <main
      data-fixed-viewport="true"
      className="relative bg-[#0a0d0f] px-5 text-white"
      style={{
        paddingTop: "max(env(safe-area-inset-top), 24px)",
        paddingBottom: "max(env(safe-area-inset-bottom), 24px)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse at 20% 0%, rgba(123,166,255,0.08), transparent 55%),"
            + "radial-gradient(ellipse at 80% 100%, rgba(154,181,170,0.08), transparent 55%)",
        }}
      />

      <div className="relative mx-auto flex h-full w-full max-w-[460px] flex-col justify-center overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as const }}
          className="mb-8 flex justify-center"
        >
          <img
            src="/harwick-gemini-logo.png"
            alt="Harwick"
            className="h-14 w-auto select-none"
            draggable={false}
          />
        </motion.div>

        <motion.header
          variants={fade}
          initial="initial"
          animate="animate"
          transition={{ delay: 0.2 }}
          className="mb-8 text-center"
        >
          <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.02em] sm:text-[32px]">
            Pick your starting plan.
          </h1>
        </motion.header>

        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2.5">
            {PLAN_CARDS.map((card, index) => (
              <motion.div
                key={card.key}
                initial={{ opacity: 0, y: 28 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: 0.35 + index * 0.08,
                  duration: 0.55,
                  ease: [0.16, 1, 0.3, 1] as const,
                }}
              >
                <PlanRow
                  card={card}
                  selected={selected === card.key}
                  onSelect={() => setSelected(card.key)}
                />
              </motion.div>
            ))}
          </div>

          <motion.div
            variants={fade}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.75 }}
            className="mt-7"
          >
            <label className="block">
              <span className="mb-1.5 block text-[11px] uppercase tracking-[0.12em] text-white/55">
                Workspace name
              </span>
              <input
                autoComplete="organization"
                className="h-11 w-full rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5 text-[14px] text-white outline-none transition placeholder:text-white/35 focus:border-[#b8d3c5]/55 focus:bg-white/[0.07] focus:shadow-[0_0_0_3px_rgba(184,211,197,0.18)]"
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="e.g. Prestige Realty"
                required
                value={workspaceName}
              />
            </label>
          </motion.div>

          {error !== null ? (
            <div className="mt-4 rounded-[12px] border border-red-400/25 bg-red-500/10 px-3.5 py-2.5 text-[12.5px] leading-5 text-red-200">
              {error}
            </div>
          ) : null}

          <motion.div
            variants={fade}
            initial="initial"
            animate="animate"
            transition={{ delay: 0.85 }}
            className="mt-7"
          >
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-12 w-full items-center justify-center rounded-full bg-white px-6 text-[13.5px] font-semibold text-[#0a0d0f] shadow-[0_18px_40px_-15px_rgba(255,255,255,0.4)] transition hover:brightness-105 disabled:opacity-60"
            >
              {isSubmitting
                ? "Setting up..."
                : PAID_PLANS.has(selected)
                ? "Continue to checkout"
                : "Start with Free"}
            </button>
          </motion.div>
        </form>
      </div>
    </main>
  );
}

function PlanRow({
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
      className="group relative flex w-full items-center justify-between overflow-hidden rounded-[16px] px-5 py-4 text-left transition-transform duration-300 will-change-transform hover:-translate-y-[1px]"
      style={{
        background: material.background,
        border: `1px solid ${selected ? material.accentColor : material.ringColor}`,
        boxShadow: selected
          ? `${material.edgeShadow}, 0 0 0 2px ${material.accentColor}55, 0 30px 60px -25px rgba(0,0,0,0.6), 0 0 70px -30px ${material.ringColor}`
          : `${material.edgeShadow}, 0 24px 48px -28px rgba(0,0,0,0.55)`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.06)_50%,transparent_65%)] bg-[length:250%_100%] transition-transform duration-1000 ease-out group-hover:translate-x-full"
      />

      <div className="relative flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-display text-[15px] font-semibold tracking-[-0.01em] text-white">
            {card.name}
          </span>
          {card.highlight ? (
            <span
              className="rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]"
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
        <span className="text-[11.5px] text-white/55">{card.capacity}</span>
      </div>

      <div className="relative flex items-baseline gap-1.5">
        <span
          className="bg-clip-text text-[22px] font-semibold leading-none tracking-[-0.02em] text-transparent"
          style={{
            backgroundImage: material.textShimmer,
            fontFamily: "var(--font-display)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {card.price}
        </span>
        <span className="text-[10.5px] text-white/45">{card.cadence}</span>
      </div>
    </button>
  );
}
