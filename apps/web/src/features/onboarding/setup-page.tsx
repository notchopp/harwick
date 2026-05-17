"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  Globe,
  Hammer,
  Loader2,
  MessageSquare,
  Plus,
  Sparkles,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ComponentType,
  type SVGProps,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from "react";

import { FacebookGlyph, InstagramGlyph, PhoneGlyph } from "../../components/harwick-icons";

import type {
  OnboardingChannel,
  OnboardingChannelMode,
  WorkspaceOnboardingState,
  WorkspaceType,
} from "@realty-ops/core";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import { cn } from "../../lib/utils";

type SetupPageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  initialState: WorkspaceOnboardingState;
  planTier: "free" | "solo" | "team" | "brokerage";
};

type StepKey = "welcome" | "identity" | "reply_examples" | "channels" | "done";

const STEP_ORDER: ReadonlyArray<StepKey> = [
  "welcome",
  "identity",
  "reply_examples",
  "channels",
  "done",
];

/**
 * Per-step holographic palette. Drives the bloom behind the card and the
 * accent color on selected states / progress dot. Picked to feel like steady
 * progression: cool intro → warm character → cool craft → confident violet →
 * sage finish.
 */
const STEP_PALETTES: Record<StepKey, { bloom: string; accent: string; ring: string }> = {
  welcome: {
    bloom:
      "radial-gradient(circle at 50% 18%, rgba(154,181,170,0.42), transparent 56%),"
      + "radial-gradient(circle at 18% 80%, rgba(123,166,255,0.16), transparent 60%)",
    accent: "#b6d1c5",
    ring: "rgba(154,181,170,0.55)",
  },
  identity: {
    bloom:
      "radial-gradient(circle at 22% 12%, rgba(240,184,122,0.34), transparent 55%),"
      + "radial-gradient(circle at 82% 78%, rgba(227,160,103,0.22), transparent 60%)",
    accent: "#f0b87a",
    ring: "rgba(227,160,103,0.5)",
  },
  reply_examples: {
    bloom:
      "radial-gradient(circle at 20% 14%, rgba(168,194,255,0.34), transparent 55%),"
      + "radial-gradient(circle at 80% 80%, rgba(116,165,210,0.18), transparent 60%)",
    accent: "#a8c2ff",
    ring: "rgba(123,166,255,0.5)",
  },
  channels: {
    bloom:
      "radial-gradient(circle at 24% 14%, rgba(200,174,240,0.34), transparent 55%),"
      + "radial-gradient(circle at 78% 82%, rgba(183,147,230,0.2), transparent 60%)",
    accent: "#c8aef0",
    ring: "rgba(183,147,230,0.5)",
  },
  done: {
    bloom:
      "radial-gradient(circle at 50% 30%, rgba(154,181,170,0.5), transparent 55%),"
      + "radial-gradient(circle at 50% 80%, rgba(176,210,196,0.22), transparent 65%)",
    accent: "#b6d1c5",
    ring: "rgba(154,181,170,0.6)",
  },
};

type WorkspaceTypeOption = {
  key: WorkspaceType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const WORKSPACE_TYPE_OPTIONS: ReadonlyArray<WorkspaceTypeOption> = [
  { key: "solo", label: "Solo agent", description: "One agent running the desk", icon: Briefcase },
  { key: "team", label: "Team", description: "2–10 agents, one operator", icon: Users },
  { key: "brokerage", label: "Brokerage", description: "Multi-agent shop, multiple Pages", icon: Building2 },
  { key: "wholesaler", label: "Wholesaler", description: "Distressed sellers, fast contracts", icon: Hammer },
  { key: "property_manager", label: "Property manager", description: "Tenants + vacancies + renewals", icon: Building2 },
  { key: "developer", label: "Developer / new build", description: "Reservations, phases, long timelines", icon: Hammer },
  { key: "other", label: "Something else", description: "Tell Harwick in the next step", icon: Sparkles },
];

type ChannelIcon = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

type ChannelOption = {
  key: OnboardingChannel;
  label: string;
  description: string;
  icon: ChannelIcon;
};

const CHANNEL_OPTIONS: ReadonlyArray<ChannelOption> = [
  { key: "instagram", label: "Instagram", description: "DMs and comments on posts/reels", icon: InstagramGlyph },
  { key: "facebook", label: "Facebook", description: "Page messages and comments", icon: FacebookGlyph },
  { key: "sms", label: "SMS", description: "Text-message inbound and follow-ups", icon: MessageSquare },
  { key: "voice", label: "Voice (Retell)", description: "Inbound calls answered by Harwick", icon: PhoneGlyph },
  { key: "website", label: "Website", description: "Web forms + chat widget", icon: Globe },
];

type ChannelMode = OnboardingChannelMode | "off";

const CHANNEL_MODE_OPTIONS: ReadonlyArray<{ key: ChannelMode; short: string; full: string }> = [
  { key: "off", short: "Off", full: "Not using this channel" },
  { key: "suggest_only", short: "Draft", full: "Harwick drafts, you send" },
  { key: "approval_first", short: "Approve", full: "Harwick drafts, you tap approve" },
  { key: "auto_send", short: "Auto", full: "Harwick sends when safe" },
];

// -----------------------------------------------------------------------------
// Shared chrome
// -----------------------------------------------------------------------------

function OnboardingShell({
  currentStep,
  totalSteps,
  children,
  paletteKey,
}: {
  currentStep: number;
  totalSteps: number;
  paletteKey: StepKey;
  children: React.ReactNode;
}) {
  const palette = STEP_PALETTES[paletteKey];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0d0f] text-white">
      {/* Layer 1 — base noise + radial blooms per step (recolored per step). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{ background: palette.bloom }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_30%,rgba(0,0,0,0.55)_88%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[520px] flex-col items-center justify-between px-5 py-8 sm:py-12">
        {/* Top spacer / brand mark */}
        <div className="flex w-full items-center justify-between text-[11px] uppercase tracking-[0.18em] text-white/45">
          <span className="font-display text-white/75">Harwick</span>
        </div>

        {/* Glass card — animated swap per step */}
        <div className="my-6 flex w-full flex-1 items-center justify-center">{children}</div>

        {/* Step dots */}
        <StepDots accent={palette.accent} current={currentStep} total={totalSteps} />
      </div>
    </main>
  );
}

function StepDots({ accent, current, total }: { accent: string; current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, index) => {
        const isCurrent = index === current;
        const isDone = index < current;
        return (
          <span
            key={index}
            aria-hidden="true"
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              isCurrent ? "w-7" : "w-1.5",
            )}
            style={{
              background: isCurrent ? accent : isDone ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.18)",
            }}
          />
        );
      })}
    </div>
  );
}

function GlassCard({
  children,
  paletteKey,
  motionKey,
}: {
  children: React.ReactNode;
  paletteKey: StepKey;
  motionKey: string;
}) {
  const palette = STEP_PALETTES[paletteKey];
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={motionKey}
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-[28px] border border-white/12",
            "bg-white/[0.045] backdrop-blur-2xl",
          )}
          style={{
            boxShadow:
              "0 30px 80px -20px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06), 0 0 80px -40px "
              + palette.ring,
          }}
        >
          {/* Glossy top highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]"
          />
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function CardEyebrow({ stepLabel, accent }: { stepLabel: string; accent: string }) {
  return (
    <div className="mb-1 inline-flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.18em]">
      <span className="size-1.5 rounded-full" style={{ background: accent }} />
      <span className="text-white/55">{stepLabel}</span>
    </div>
  );
}

function PrimaryCta({
  accent,
  loading,
  disabled,
  children,
  onClick,
  type = "button",
}: {
  accent: string;
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
}) {
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex h-12 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[13.5px] font-semibold text-[#0a0d0f] shadow-[0_18px_40px_-15px_rgba(255,255,255,0.35)] transition hover:brightness-105 disabled:opacity-60 [&_svg]:shrink-0"
      style={{ background: accent }}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      <span className="inline-flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap leading-none">
        {children}
      </span>
    </Button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className="h-9 rounded-full bg-white/[0.04] px-3 text-[12px] font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
    >
      <ArrowLeft className="size-3.5" aria-hidden="true" />
      <span>Back</span>
    </Button>
  );
}

// -----------------------------------------------------------------------------
// Step components
// -----------------------------------------------------------------------------

function WelcomeStep({
  operatorName,
  workspaceName,
  planTier,
  onContinue,
}: {
  operatorName: string;
  workspaceName: string;
  planTier: SetupPageProps["planTier"];
  onContinue: () => void;
}) {
  const palette = STEP_PALETTES.welcome;
  const firstName = operatorName.split(/\s+/)[0] ?? operatorName;

  return (
    <GlassCard motionKey="welcome" paletteKey="welcome">
      <div className="px-7 pb-7 pt-9 text-center">
        {/* Holographic mark */}
        <div
          aria-hidden="true"
          className="mx-auto mb-6 size-16 rounded-[18px] border border-white/15"
          style={{
            background:
              "conic-gradient(from 140deg, rgba(154,181,170,0.85), rgba(123,166,255,0.6), rgba(200,174,240,0.55), rgba(154,181,170,0.85))",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), 0 12px 32px -10px " + palette.ring,
          }}
        />

        <div className="mb-1 text-[10.5px] uppercase tracking-[0.18em] text-white/45">
          welcome, {firstName.toLowerCase()}
        </div>
        <h1 className="font-display text-[28px] font-medium leading-tight tracking-[-0.015em] text-white">
          Let&apos;s get Harwick set up
          <br />
          for {workspaceName}.
        </h1>
        <p className="mx-auto mt-3 max-w-[360px] text-[13px] leading-5 text-white/65">
          Three quick steps. Harwick will learn how you talk, what you sell, and how you want it
          handling leads — then you&apos;re live.
        </p>

        <div className="mt-7 flex flex-col gap-2">
          <PrimaryCta accent={palette.accent} onClick={onContinue}>
            Let&apos;s get started
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
          <p className="text-[11px] text-white/40">
            You picked the <span className="text-white/65">{planLabel(planTier)}</span> plan ·
            takes about 90 seconds.
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

function planLabel(tier: SetupPageProps["planTier"]): string {
  if (tier === "free") return "Free";
  if (tier === "solo") return "Solo";
  if (tier === "team") return "Team";
  return "Brokerage";
}

// -----------------------------------------------------------------------------

type IdentityFormState = {
  workspaceType: WorkspaceType | null;
  areas: string[];
  areaDraft: string;
  toneDescription: string;
};

function IdentityStep({
  workspaceId,
  onBack,
  onComplete,
}: {
  workspaceId: string;
  onBack: () => void;
  onComplete: () => void;
}) {
  const palette = STEP_PALETTES.identity;
  const [form, setForm] = useState<IdentityFormState>({
    workspaceType: null,
    areas: [],
    areaDraft: "",
    toneDescription: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addArea() {
    const trimmed = form.areaDraft.trim();
    if (trimmed.length === 0 || form.areas.includes(trimmed) || form.areas.length >= 8) return;
    setForm((current) => ({ ...current, areas: [...current.areas, trimmed], areaDraft: "" }));
  }

  function handleAreaKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addArea();
    } else if (event.key === "Backspace" && form.areaDraft.length === 0 && form.areas.length > 0) {
      setForm((current) => ({ ...current, areas: current.areas.slice(0, -1) }));
    }
  }

  const canSubmit =
    form.workspaceType !== null
    && form.areas.length > 0
    && form.toneDescription.trim().length >= 8
    && !submitting;

  async function submit() {
    if (!canSubmit || form.workspaceType === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/onboarding-step/identity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceType: form.workspaceType,
          primaryAreas: form.areas,
          toneDescription: form.toneDescription.trim(),
        }),
      });
      if (!response.ok) {
        setError("Could not save. Try again.");
        setSubmitting(false);
        return;
      }
      onComplete();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <GlassCard motionKey="identity" paletteKey="identity">
      <div className="px-7 pb-7 pt-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <CardEyebrow accent={palette.accent} stepLabel="step 1 of 3 · identity" />
            <h2 className="font-display text-[22px] font-medium leading-tight tracking-[-0.01em] text-white">
              Who are we running for?
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-white/60">
              Harwick adapts its qualification and tone per workspace type.
            </p>
          </div>
          <BackButton onClick={onBack} />
        </div>

        <div className="space-y-5">
          <div>
            <Label className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/55">
              Workspace type
            </Label>
            <div className="grid gap-1.5">
              {WORKSPACE_TYPE_OPTIONS.map((option) => {
                const selected = form.workspaceType === option.key;
                const Icon = option.icon;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, workspaceType: option.key }))}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-[14px] border px-3 py-2.5 text-left transition",
                      selected
                        ? "border-transparent bg-white/[0.07]"
                        : "border-white/10 bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.04]",
                    )}
                    style={selected ? { borderColor: palette.accent + "66" } : undefined}
                  >
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-[10px] border transition",
                        selected ? "border-white/10" : "border-white/8 bg-white/[0.04]",
                      )}
                      style={
                        selected
                          ? { background: palette.accent + "22", borderColor: palette.accent + "55" }
                          : undefined
                      }
                    >
                      <Icon
                        className="size-4"
                        aria-hidden="true"
                        style={selected ? { color: palette.accent } : { color: "rgba(255,255,255,0.55)" }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-white">{option.label}</span>
                      <span className="block text-[11.5px] leading-4 text-white/50">{option.description}</span>
                    </span>
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border transition",
                        selected ? "" : "border-white/15",
                      )}
                      style={
                        selected
                          ? {
                              background: palette.accent,
                              borderColor: palette.accent,
                            }
                          : undefined
                      }
                    >
                      {selected ? (
                        <Check className="size-3 text-[#0a0d0f]" strokeWidth={3} aria-hidden="true" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label
              className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/55"
              htmlFor="onboarding-areas"
            >
              Primary areas
            </Label>
            <div className="flex flex-wrap gap-1.5 rounded-[14px] border border-white/10 bg-white/[0.025] px-2.5 py-2">
              {form.areas.map((area) => (
                <Badge
                  key={area}
                  variant="secondary"
                  className="gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-[11.5px] font-medium text-white"
                >
                  {area}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        areas: current.areas.filter((entry) => entry !== area),
                      }))
                    }
                    aria-label={`Remove ${area}`}
                    className="text-white/55 transition hover:text-white"
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
              <Input
                id="onboarding-areas"
                className="h-7 flex-1 min-w-[120px] border-0 bg-transparent px-1 text-[13px] text-white shadow-none placeholder:text-white/35 focus-visible:ring-0"
                placeholder={form.areas.length === 0 ? "e.g. Bethesda, Northwest DC…" : "Add another"}
                value={form.areaDraft}
                onChange={(event) => setForm((current) => ({ ...current, areaDraft: event.target.value }))}
                onKeyDown={handleAreaKey}
                onBlur={addArea}
              />
            </div>
            <p className="mt-1.5 text-[10.5px] text-white/40">
              Press Enter or comma to add. Up to 8.
            </p>
          </div>

          <div>
            <Label
              className="mb-2 block text-[11px] font-medium uppercase tracking-[0.12em] text-white/55"
              htmlFor="onboarding-voice"
            >
              How do you sound?
            </Label>
            <Textarea
              id="onboarding-voice"
              rows={3}
              className="resize-none rounded-[14px] border border-white/10 bg-white/[0.025] px-3 py-2.5 text-[13px] text-white shadow-none placeholder:text-white/35 focus-visible:border-white/30 focus-visible:bg-white/[0.04]"
              placeholder="e.g. warm, low-key, direct. Lowercase. No emojis. Never promises certainty."
              maxLength={500}
              value={form.toneDescription}
              onChange={(event) =>
                setForm((current) => ({ ...current, toneDescription: event.target.value }))
              }
            />
            <p className="mt-1.5 text-[10.5px] text-white/40">
              One or two sentences. Harwick matches this on the first lead.
            </p>
          </div>
        </div>

        {error !== null ? (
          <div className="mt-4 rounded-[10px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6">
          <PrimaryCta accent={palette.accent} disabled={!canSubmit} loading={submitting} onClick={() => void submit()}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </div>
      </div>
    </GlassCard>
  );
}

// -----------------------------------------------------------------------------

function ReplyExamplesStep({
  workspaceId,
  onBack,
  onComplete,
}: {
  workspaceId: string;
  onBack: () => void;
  onComplete: () => void;
}) {
  const palette = STEP_PALETTES.reply_examples;
  const [examples, setExamples] = useState<string[]>([""]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateAt(index: number, value: string) {
    setExamples((current) => current.map((entry, position) => (position === index ? value : entry)));
  }

  function addExample() {
    if (examples.length >= 8) return;
    setExamples((current) => [...current, ""]);
  }

  function removeAt(index: number) {
    setExamples((current) => current.filter((_, position) => position !== index));
  }

  const trimmedExamples = useMemo(
    () => examples.map((entry) => entry.trim()).filter((entry) => entry.length >= 8),
    [examples],
  );
  const canSubmit = trimmedExamples.length >= 1 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/onboarding-step/reply-examples`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          examples: trimmedExamples.map((body) => ({ body, source: "onboarding_paste" as const })),
        }),
      });
      if (!response.ok) {
        setError("Could not save. Try again.");
        setSubmitting(false);
        return;
      }
      onComplete();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <GlassCard motionKey="reply_examples" paletteKey="reply_examples">
      <div className="px-7 pb-7 pt-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <CardEyebrow accent={palette.accent} stepLabel="step 2 of 3 · reply examples" />
            <h2 className="font-display text-[22px] font-medium leading-tight tracking-[-0.01em] text-white">
              Show Harwick how you reply.
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-white/60">
              Paste 1 – 8 real messages you&apos;ve sent leads. The more honest, the better the match.
            </p>
          </div>
          <BackButton onClick={onBack} />
        </div>

        <div className="space-y-2">
          {examples.map((example, index) => (
            <div
              key={index}
              className="group relative rounded-[14px] border border-white/10 bg-white/[0.025] transition focus-within:border-white/30 focus-within:bg-white/[0.04]"
            >
              <Textarea
                rows={3}
                placeholder={
                  index === 0
                    ? "e.g. hey marcus — thanks for reaching out. saw you asked about bethesda. quick q before i set up a tour: are you pre-approved yet?"
                    : "Another reply…"
                }
                maxLength={8000}
                className="resize-none border-0 bg-transparent px-3 py-2.5 text-[13px] text-white shadow-none placeholder:text-white/35 focus-visible:ring-0"
                value={example}
                onChange={(event) => updateAt(index, event.target.value)}
              />
              {examples.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeAt(index)}
                  aria-label="Remove example"
                  className="absolute right-2 top-2 rounded-full bg-white/[0.04] p-1 text-white/45 opacity-0 transition hover:bg-white/[0.1] hover:text-white group-hover:opacity-100"
                >
                  <Trash2 className="size-3" aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>

        {examples.length < 8 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addExample}
            className="mt-3 h-9 rounded-full bg-white/[0.03] text-[12px] font-medium text-white/70 hover:bg-white/[0.06] hover:text-white"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            <span>Add another</span>
          </Button>
        ) : null}

        <p className="mt-2 text-[10.5px] text-white/40">
          {trimmedExamples.length} of {examples.length} usable · need at least one (8+ characters).
        </p>

        {error !== null ? (
          <div className="mt-4 rounded-[10px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6">
          <PrimaryCta accent={palette.accent} disabled={!canSubmit} loading={submitting} onClick={() => void submit()}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </div>
      </div>
    </GlassCard>
  );
}

// -----------------------------------------------------------------------------

type ChannelsFormState = Record<OnboardingChannel, ChannelMode>;

function ChannelsStep({
  workspaceId,
  planTier,
  onBack,
  onComplete,
}: {
  workspaceId: string;
  planTier: SetupPageProps["planTier"];
  onBack: () => void;
  onComplete: () => void;
}) {
  const palette = STEP_PALETTES.channels;
  const [form, setForm] = useState<ChannelsFormState>({
    instagram: "approval_first",
    facebook: "off",
    sms: "off",
    voice: "off",
    website: "off",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const autoSendAllowed = planTier !== "free";

  const activeIntents = useMemo(
    () =>
      (Object.entries(form) as Array<[OnboardingChannel, ChannelMode]>)
        .filter(([, mode]) => mode !== "off")
        .map(([channel, mode]) => ({ channel, desiredMode: mode as OnboardingChannelMode })),
    [form],
  );
  const canSubmit = activeIntents.length >= 1 && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/onboarding-step/channels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intents: activeIntents }),
      });
      if (!response.ok) {
        setError("Could not save. Try again.");
        setSubmitting(false);
        return;
      }
      onComplete();
    } catch {
      setError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <GlassCard motionKey="channels" paletteKey="channels">
      <div className="px-7 pb-7 pt-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <CardEyebrow accent={palette.accent} stepLabel="step 3 of 3 · channels" />
            <h2 className="font-display text-[22px] font-medium leading-tight tracking-[-0.01em] text-white">
              Where does Harwick run, and how hot?
            </h2>
            <p className="mt-1 text-[12.5px] leading-5 text-white/60">
              Pick a mode per channel. Switch any of these later in Settings.
            </p>
          </div>
          <BackButton onClick={onBack} />
        </div>

        <div className="space-y-2">
          {CHANNEL_OPTIONS.map((option) => {
            const mode = form[option.key];
            const Icon = option.icon;
            const enabled = mode !== "off";
            return (
              <div
                key={option.key}
                className={cn(
                  "rounded-[14px] border bg-white/[0.025] transition",
                  enabled ? "border-white/15" : "border-white/8",
                )}
                style={enabled ? { borderColor: palette.accent + "44" } : undefined}
              >
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-white/10"
                    style={
                      enabled
                        ? { background: palette.accent + "1f", borderColor: palette.accent + "55" }
                        : { background: "rgba(255,255,255,0.04)" }
                    }
                  >
                    <Icon
                      className="size-4"
                      aria-hidden="true"
                      style={enabled ? { color: palette.accent } : { color: "rgba(255,255,255,0.55)" }}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-white">{option.label}</div>
                    <div className="text-[11px] leading-4 text-white/50">{option.description}</div>
                  </div>
                </div>
                <div className="flex gap-1 px-2 pb-2">
                  {CHANNEL_MODE_OPTIONS.filter(
                    (modeOption) => modeOption.key !== "auto_send" || autoSendAllowed,
                  ).map((modeOption) => {
                    const isActive = mode === modeOption.key;
                    return (
                      <button
                        key={modeOption.key}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({ ...current, [option.key]: modeOption.key }))
                        }
                        title={modeOption.full}
                        className={cn(
                          "flex-1 rounded-[10px] px-2 py-1.5 text-[11.5px] font-medium transition",
                          isActive
                            ? "text-[#0a0d0f]"
                            : "text-white/55 hover:bg-white/[0.05] hover:text-white/85",
                        )}
                        style={isActive ? { background: palette.accent } : undefined}
                      >
                        {modeOption.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {!autoSendAllowed ? (
          <p className="mt-3 text-[10.5px] text-white/40">
            Auto-send unlocks on Solo and up. Free plan stays approval-first.
          </p>
        ) : null}

        {error !== null ? (
          <div className="mt-4 rounded-[10px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6">
          <PrimaryCta accent={palette.accent} disabled={!canSubmit} loading={submitting} onClick={() => void submit()}>
            {activeIntents.length === 0
              ? "Pick at least one channel"
              : `Finish setup (${activeIntents.length} channel${activeIntents.length === 1 ? "" : "s"})`}
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </div>
      </div>
    </GlassCard>
  );
}

// -----------------------------------------------------------------------------

function DoneStep({ workspaceName }: { workspaceName: string }) {
  const palette = STEP_PALETTES.done;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign("/home");
    }, 3200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <GlassCard motionKey="done" paletteKey="done">
      <div className="px-7 pb-7 pt-9 text-center">
        <div
          aria-hidden="true"
          className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full border border-white/15"
          style={{
            background: palette.accent,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.32), 0 12px 32px -10px " + palette.ring,
          }}
        >
          <Check className="size-7 text-[#0a0d0f]" strokeWidth={3} aria-hidden="true" />
        </div>

        <div className="mb-1 text-[10.5px] uppercase tracking-[0.18em] text-white/45">
          all set
        </div>
        <h1 className="font-display text-[26px] font-medium leading-tight tracking-[-0.015em] text-white">
          {workspaceName} is ready.
        </h1>
        <p className="mx-auto mt-3 max-w-[340px] text-[13px] leading-5 text-white/65">
          Harwick will start handling inbound the moment your first channel connects. Opening your
          workspace…
        </p>

        <div className="mt-7">
          <PrimaryCta accent={palette.accent} onClick={() => window.location.assign("/home")}>
            Open my workspace
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </div>
      </div>
    </GlassCard>
  );
}

// -----------------------------------------------------------------------------
// Orchestrator
// -----------------------------------------------------------------------------

function deriveInitialStepIndex(state: WorkspaceOnboardingState): number {
  // If the user has already done identity, start them on reply_examples, etc.
  // Welcome is only shown as the first screen for fresh entries.
  if (state.identityDone && state.replyExamplesDone && state.channelIntentDone) return 4;
  if (state.identityDone && state.replyExamplesDone) return 3;
  if (state.identityDone) return 2;
  // Fresh — show welcome.
  if (!state.identityDone && !state.replyExamplesDone && !state.channelIntentDone) return 0;
  return 1;
}

export function OnboardingSetupPage(props: SetupPageProps) {
  const [stepIndex, setStepIndex] = useState(() => deriveInitialStepIndex(props.initialState));
  const stepKey = STEP_ORDER[stepIndex] ?? "welcome";

  function goTo(next: StepKey) {
    const nextIndex = STEP_ORDER.indexOf(next);
    if (nextIndex !== -1) setStepIndex(nextIndex);
  }

  function goBack() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  return (
    <OnboardingShell currentStep={stepIndex} paletteKey={stepKey} totalSteps={STEP_ORDER.length}>
      {stepKey === "welcome" ? (
        <WelcomeStep
          operatorName={props.operatorName}
          planTier={props.planTier}
          workspaceName={props.workspaceName}
          onContinue={() => goTo("identity")}
        />
      ) : null}

      {stepKey === "identity" ? (
        <IdentityStep
          workspaceId={props.workspaceId}
          onBack={goBack}
          onComplete={() => goTo("reply_examples")}
        />
      ) : null}

      {stepKey === "reply_examples" ? (
        <ReplyExamplesStep
          workspaceId={props.workspaceId}
          onBack={goBack}
          onComplete={() => goTo("channels")}
        />
      ) : null}

      {stepKey === "channels" ? (
        <ChannelsStep
          workspaceId={props.workspaceId}
          planTier={props.planTier}
          onBack={goBack}
          onComplete={() => goTo("done")}
        />
      ) : null}

      {stepKey === "done" ? <DoneStep workspaceName={props.workspaceName} /> : null}
    </OnboardingShell>
  );
}
