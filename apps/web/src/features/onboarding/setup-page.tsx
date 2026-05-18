"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  Crown,
  Database,
  DoorOpen,
  Gauge,
  Globe,
  Home,
  KeyRound,
  Loader2,
  MapPin,
  MessageSquare,
  Plus,
  Route,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ComponentType,
  type KeyboardEvent,
  type SVGProps,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  OnboardingChannel,
  OnboardingChannelMode,
  WorkspaceOnboardingState,
  WorkspaceRole,
  WorkspaceType,
} from "@realty-ops/core";

import {
  CalendarHeart as PhosphorCalendarHeart,
  ChartLineUp as PhosphorChartLineUp,
  Door as PhosphorDoor,
  HardHat as PhosphorHardHat,
  HouseLine as PhosphorHouseLine,
  type Icon as PhosphorIcon,
  Key as PhosphorKey,
  MapPin as PhosphorMapPin,
} from "@phosphor-icons/react";

import { FacebookGlyph, InstagramGlyph, PhoneGlyph } from "../../components/harwick-icons";
import { HarwickMark } from "../../components/harwick-rail/harwick-mark";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { cn } from "../../lib/utils";

import { AreaSearchInput, MarketMap, type ResolvedArea } from "./market-map";
import {
  DarkInlineInput,
  DarkInlineTextarea,
  DarkTextarea,
} from "./primitives";

type SetupPageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  initialState: WorkspaceOnboardingState;
  planTier: "free" | "solo" | "team" | "brokerage";
};

type SceneKey =
  | "welcome"
  | "primary_areas"
  | "lead_types"
  | "price_bands"
  | "listing_focus"
  | "voice_tone"
  | "reply_examples"
  | "channels"
  | "autonomy"
  | "activation"
  | "done";

const SCENE_ORDER: ReadonlyArray<SceneKey> = [
  "welcome",
  "primary_areas",
  "lead_types",
  "price_bands",
  "listing_focus",
  "voice_tone",
  "reply_examples",
  "channels",
  "autonomy",
  "activation",
  "done",
];

type PhaseKey = "welcome" | "market" | "voice" | "rules" | "connect" | "done";

const SCENE_TO_PHASE: Record<SceneKey, PhaseKey> = {
  welcome: "welcome",
  primary_areas: "market",
  lead_types: "market",
  price_bands: "market",
  listing_focus: "market",
  voice_tone: "voice",
  reply_examples: "voice",
  channels: "rules",
  autonomy: "rules",
  activation: "connect",
  done: "done",
};

const PHASE_LABELS: Record<PhaseKey, string> = {
  welcome: "",
  market: "Tell us about your market",
  voice: "Teach Harwick your voice",
  rules: "Set your rules",
  connect: "Connect",
  done: "",
};

const HARWICK_GLOW = {
  base:
    "radial-gradient(circle at 50% 18%, rgba(191,221,207,0.5), transparent 35%),"
    + "radial-gradient(circle at 18% 84%, rgba(216,196,135,0.2), transparent 42%),"
    + "radial-gradient(circle at 82% 76%, rgba(73,112,94,0.34), transparent 48%),"
    + "linear-gradient(180deg, #07110d 0%, #050908 100%)",
  card:
    "radial-gradient(circle at 50% 0%, rgba(198,226,212,0.2), transparent 54%),"
    + "linear-gradient(180deg, rgba(255,255,255,0.075), rgba(255,255,255,0.035))",
  accent: "#b8d3c5",
  accentStrong: "#d8c487",
  muted: "#7fa18e",
  ink: "#07100d",
  ring: "rgba(184,211,197,0.58)",
};

type LeadTypeOption = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const LEAD_TYPE_OPTIONS: ReadonlyArray<LeadTypeOption> = [
  { key: "buyer", label: "Buyer", description: "Budget, area, financing, timeline", icon: KeyRound },
  { key: "seller", label: "Seller", description: "Valuation, listing intent, timing", icon: Home },
  { key: "renter", label: "Renter", description: "Lease criteria and urgency", icon: DoorOpen },
  { key: "investor", label: "Investor", description: "Returns, inventory, repeat deals", icon: TrendingUp },
  { key: "new construction", label: "New build", description: "Builder, incentives, community fit", icon: Building2 },
  { key: "open house", label: "Open house", description: "Register, remind, follow up", icon: CalendarDays },
];

const PRICE_BAND_OPTIONS = ["under $300k", "$300k-$500k", "$500k-$750k", "$750k-$1m", "$1m+"];

type ListingFocusOption = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

const LISTING_FOCUS_OPTIONS: ReadonlyArray<ListingFocusOption> = [
  { key: "new construction", label: "New construction", description: "Builders, incentives, communities", icon: Building2 },
  { key: "first-time buyers", label: "First-time buyers", description: "Lender handoff and education", icon: KeyRound },
  { key: "luxury", label: "Luxury", description: "High-touch and approval-first", icon: Crown },
  { key: "relocation", label: "Relocation", description: "Area fit and remote coordination", icon: MapPin },
  { key: "investors", label: "Investors", description: "Yield, rent, resale, repeat buyers", icon: TrendingUp },
  { key: "rentals", label: "Rentals", description: "Availability and urgency", icon: DoorOpen },
  { key: "open houses", label: "Open houses", description: "Event capture and reminders", icon: CalendarDays },
];

type ChannelIcon = LucideIcon | ComponentType<SVGProps<SVGSVGElement>>;

type ChannelOption = {
  key: OnboardingChannel;
  label: string;
  description: string;
  icon: ChannelIcon;
  minimumPlan: SetupPageProps["planTier"];
};

const CHANNEL_OPTIONS: ReadonlyArray<ChannelOption> = [
  { key: "instagram", label: "Instagram", description: "DMs and comments on posts/reels", icon: InstagramGlyph, minimumPlan: "free" },
  { key: "facebook", label: "Facebook", description: "Page messages and comments", icon: FacebookGlyph, minimumPlan: "free" },
  { key: "website", label: "Listings site", description: "Public listings and inquiry capture", icon: Globe, minimumPlan: "free" },
  { key: "sms", label: "SMS", description: "Text follow-up and nurture", icon: MessageSquare, minimumPlan: "solo" },
  { key: "voice", label: "Voice", description: "Retell-powered inbound call handling", icon: PhoneGlyph, minimumPlan: "solo" },
];

type ChannelMode = OnboardingChannelMode | "off";

const CHANNEL_MODE_OPTIONS: ReadonlyArray<{ key: ChannelMode; short: string; full: string }> = [
  { key: "off", short: "Off", full: "Not using this channel yet" },
  { key: "suggest_only", short: "Draft", full: "Harwick drafts, a human sends" },
  { key: "approval_first", short: "Approve", full: "Harwick queues a send decision" },
  { key: "auto_send", short: "Auto", full: "Harwick sends safe replies automatically" },
];

type ActivationItem = {
  key: string;
  label: string;
  description: string;
  icon: ChannelIcon;
  minimumPlan: SetupPageProps["planTier"];
  roles: WorkspaceRole[];
};

const ACTIVATION_ITEMS: ReadonlyArray<ActivationItem> = [
  {
    key: "social",
    label: "Connect social inboxes",
    description: "Instagram and Facebook become Harwick intake channels.",
    icon: InstagramGlyph,
    minimumPlan: "free",
    roles: ["owner", "admin", "team_lead"],
  },
  {
    key: "fub",
    label: "Test Follow Up Boss",
    description: "Qualified leads sync through the worker with visible retries.",
    icon: Database,
    minimumPlan: "solo",
    roles: ["owner", "admin", "team_lead", "lead_manager"],
  },
  {
    key: "calendar",
    label: "Connect calendars",
    description: "Request-and-approve showing workflows before auto-booking.",
    icon: CalendarDays,
    minimumPlan: "solo",
    roles: ["owner", "admin", "team_lead", "agent"],
  },
  {
    key: "team",
    label: "Invite the team",
    description: "Agents get scoped access, routing profiles, and preferences.",
    icon: Users,
    minimumPlan: "team",
    roles: ["owner", "admin"],
  },
  {
    key: "routing",
    label: "Verify routing policy",
    description: "Area, price, property type, capacity, and source credit.",
    icon: Route,
    minimumPlan: "team",
    roles: ["owner", "admin", "team_lead", "lead_manager"],
  },
  {
    key: "permissions",
    label: "Review permissions",
    description: "Owner/admin capability stays separate from agent access.",
    icon: ShieldCheck,
    minimumPlan: "team",
    roles: ["owner", "admin"],
  },
  {
    key: "brokerage",
    label: "Brokerage launch review",
    description: "Multi-team readiness, health checks, usage, and support handoff.",
    icon: Crown,
    minimumPlan: "brokerage",
    roles: ["owner", "admin"],
  },
];

const PLAN_RANK: Record<SetupPageProps["planTier"], number> = {
  free: 0,
  solo: 1,
  team: 2,
  brokerage: 3,
};

type SetupDraft = {
  workspaceType: WorkspaceType | null;
  areas: string[];
  areaDraft: string;
  leadTypes: string[];
  priceBands: string[];
  listingFocus: string[];
  toneDescription: string;
  replyExamples: string[];
  channels: Record<OnboardingChannel, ChannelMode>;
  autonomy: "draft" | "approval" | "safe_auto";
};

function createInitialDraft(planTier: SetupPageProps["planTier"]): SetupDraft {
  return {
    // Workspace shape is derived from the plan tier the operator already
    // picked at /onboarding/plan-pick — Free + Solo plans are 1- or 2-seat
    // operations, Team plan is up to 10 seats, Brokerage is unlimited.
    // "team" and "seats" mean the same thing inside Harwick. Operators
    // never re-pick this in onboarding.
    workspaceType: workspaceTypeFromPlan(planTier),
    areas: [],
    areaDraft: "",
    leadTypes: [],
    priceBands: [],
    listingFocus: [],
    toneDescription: "",
    replyExamples: [""],
    channels: {
      instagram: "approval_first",
      facebook: "off",
      website: "suggest_only",
      sms: planMeets(planTier, "solo") ? "approval_first" : "off",
      voice: "off",
    },
    autonomy: planTier === "free" ? "approval" : "safe_auto",
  };
}

function planMeets(current: SetupPageProps["planTier"], minimum: SetupPageProps["planTier"]) {
  return PLAN_RANK[current] >= PLAN_RANK[minimum];
}

function planLabel(tier: SetupPageProps["planTier"]): string {
  if (tier === "free") return "Free";
  if (tier === "solo") return "Solo";
  if (tier === "team") return "Team";
  return "Brokerage";
}

// Plan tier → workspace shape. Inside Harwick "team" and "seats" mean the
// same thing — Team plan ships 10 seats, so Team plan = team-shaped
// workspace. Free + Solo are single-operator shapes by definition.
function workspaceTypeFromPlan(planTier: SetupPageProps["planTier"]): WorkspaceType {
  if (planTier === "team") return "team";
  if (planTier === "brokerage") return "brokerage";
  return "solo";
}

function roleLabel(role: WorkspaceRole): string {
  return role.replace(/_/g, " ");
}

function roleLens(role: WorkspaceRole): string {
  if (role === "owner" || role === "admin") {
    return "Full setup: integrations, autonomy, team access, routing policy, and launch checks.";
  }
  if (role === "team_lead" || role === "lead_manager") {
    return "Operational setup: routing, load, SLA, approval rules, and team handoffs.";
  }
  if (role === "agent") {
    return "Personal setup: areas, lead types, calendar, showing preferences, and assigned-lead workflow.";
  }
  if (role === "operator") {
    return "Queue setup: approvals, escalation, triage, and clean handoff expectations.";
  }
  return "Read-only orientation: see what Harwick is doing without changing owner-level controls.";
}

function previousScene(current: SceneKey): SceneKey {
  const currentIndex = SCENE_ORDER.indexOf(current);
  return SCENE_ORDER[Math.max(currentIndex - 1, 0)] ?? "welcome";
}

function deriveInitialScene(state: WorkspaceOnboardingState): SceneKey {
  if (state.identityDone && state.replyExamplesDone && state.channelIntentDone) return "activation";
  if (state.identityDone && state.replyExamplesDone) return "channels";
  if (state.identityDone) return "reply_examples";
  return "welcome";
}

function canManageAutomation(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "team_lead";
}

function updateSelection(current: string[], value: string, max = 8) {
  if (current.includes(value)) return current.filter((entry) => entry !== value);
  if (current.length >= max) return current;
  return [...current, value];
}

function Shell({
  scene,
  children,
  onBack,
}: {
  scene: SceneKey;
  children: React.ReactNode;
  onBack: (() => void) | null;
}) {
  const currentIndex = SCENE_ORDER.indexOf(scene);

  const isFlowScene = scene !== "welcome" && scene !== "done";

  return (
    <main
      data-fixed-viewport="true"
      className="relative bg-[#070d0b] text-white"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Static atmospheric backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: HARWICK_GLOW.base }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_30%,rgba(0,0,0,0.58)_84%)]"
      />

      <div className="relative mx-auto flex h-full w-full max-w-[520px] flex-col px-5">
        <header className="flex items-center justify-between pt-3 pb-1">
          <button
            type="button"
            onClick={onBack ?? undefined}
            disabled={onBack === null}
            aria-label="Back"
            className={cn(
              "flex size-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition",
              onBack === null ? "opacity-0 pointer-events-none" : "hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          {isFlowScene ? (
            <button
              type="button"
              onClick={() => window.location.assign("/home")}
              className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/40 transition hover:text-white/75"
            >
              Finish later
            </button>
          ) : null}
        </header>

        <div className="flex flex-1 items-center overflow-y-auto py-3">
          <AnimatePresence mode="wait">
            <motion.section
              key={scene}
              initial={{ opacity: 0, x: 28, filter: "blur(6px)" }}
              animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -24, filter: "blur(6px)" }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              {children}
            </motion.section>
          </AnimatePresence>
        </div>

        {isFlowScene ? (
          <div className="space-y-1.5 pb-2">
            <div className="text-center text-[10.5px] uppercase tracking-[0.18em] text-white/40">
              {PHASE_LABELS[SCENE_TO_PHASE[scene]]}
            </div>
            <StepDots current={currentIndex} total={SCENE_ORDER.length} />
          </div>
        ) : null}
      </div>
    </main>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 pb-1">
      {Array.from({ length: total }).map((_, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <span
            key={index}
            aria-hidden="true"
            className={cn("h-1.5 rounded-full transition-all duration-300", active ? "w-8" : "w-1.5")}
            style={{
              background: active
                ? HARWICK_GLOW.accent
                : done
                  ? "rgba(216,196,135,0.72)"
                  : "rgba(255,255,255,0.18)",
            }}
          />
        );
      })}
    </div>
  );
}

function SceneFrame({
  eyebrow,
  title,
  description,
  visual,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  visual: React.ReactNode;
  children?: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[760px] flex-col justify-between gap-6">
      <div>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#b8d3c5]/80">{eyebrow}</p>
          <h1 className="mx-auto mt-3 max-w-[430px] font-display text-[32px] font-medium leading-[1.05] text-white">
            {title}
          </h1>
          {description !== undefined ? (
            <p className="mx-auto mt-3 max-w-[390px] text-[13px] leading-5 text-white/58">{description}</p>
          ) : null}
        </div>

        <div className="mx-auto mt-7 w-full max-w-[420px]">{visual}</div>
        {children !== undefined ? <div className="mt-6">{children}</div> : null}
      </div>

      <div className="space-y-3">{footer}</div>
    </div>
  );
}

function PrimaryCta({
  loading,
  disabled,
  children,
  onClick,
}: {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex h-13 min-h-13 w-full items-center justify-center gap-2 rounded-full text-[13.5px] font-semibold text-[#07100d] shadow-[0_18px_44px_-16px_rgba(184,211,197,0.75)] transition hover:brightness-105 disabled:opacity-50 [&_svg]:shrink-0"
      style={{
        background: "linear-gradient(180deg, #e1f2ea 0%, #b8d3c5 58%, #93b1a2 100%)",
      }}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
      <span className="inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap">
        {children}
      </span>
    </Button>
  );
}

function GhostCta({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium text-white/48 transition hover:bg-white/[0.05] hover:text-white/72"
    >
      {children}
    </button>
  );
}

function GlassPanel({
  selected,
  children,
  onClick,
  className,
}: {
  selected?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Component = onClick === undefined ? "div" : "button";
  return (
    <Component
      type={onClick === undefined ? undefined : "button"}
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-[24px] border p-4 text-left backdrop-blur-2xl transition",
        selected
          ? "border-[#b8d3c5]/55 bg-white/[0.105] shadow-[0_22px_60px_-32px_rgba(184,211,197,0.9)]"
          : "border-white/10 bg-white/[0.055] hover:border-white/18 hover:bg-white/[0.075]",
        className,
      )}
      style={{ backgroundImage: HARWICK_GLOW.card }}
    >
      {children}
    </Component>
  );
}

function SmallCheck({ selected }: { selected: boolean }) {
  return (
    <span
      className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-transparent" : "border-white/15")}
      style={selected ? { background: HARWICK_GLOW.accent } : undefined}
    >
      {selected ? <Check className="size-3 text-[#07100d]" strokeWidth={3} aria-hidden="true" /> : null}
    </span>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[16px] border border-red-400/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-100">
      {children}
    </div>
  );
}

function WelcomeVisual() {
  return (
    <motion.img
      alt=""
      aria-hidden="true"
      src="/harwick-gemini-logo.png"
      className="mx-auto size-[140px] object-contain"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    />
  );
}


// MarketMapVisual was a hand-drawn SVG placeholder. Replaced by the real
// Mapbox-backed <MarketMap /> component in ./market-map.tsx, which geocodes
// each area the operator types and drops a real pin. Kept as a function
// name so call-sites elsewhere don't need to change.
function MarketMapVisual({
  areas,
  resolvedAreas,
  onResolve,
}: {
  areas: string[];
  resolvedAreas?: ReadonlyMap<string, ResolvedArea>;
  onResolve?: (resolved: ResolvedArea) => void;
}) {
  return (
    <MarketMap
      areas={areas}
      {...(resolvedAreas === undefined ? {} : { resolvedAreas })}
      {...(onResolve === undefined ? {} : { onResolve })}
    />
  );
}

function LeadTypeVisual({ selected }: { selected: string[] }) {
  // Artistic glyph composition that builds as the operator picks lead types.
  // Each pick lights up a hand-positioned phosphor glyph with a colored
  // halo. Empty state shows a faint outline of all glyphs so the operator
  // gets a preview of the canvas.
  const glyphSize = 56;
  const radiusPercent = 36; // % of container — distance from center to glyph center

  return (
    <div className="relative mx-auto aspect-[1.04]">
      {/* Concentric arcs — passive composition. SVG sits directly on bg. */}
      <svg viewBox="0 0 320 320" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <radialGradient id="lead-canvas-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(184,211,197,0.16)" />
            <stop offset="100%" stopColor="rgba(184,211,197,0)" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="160" r="120" fill="url(#lead-canvas-halo)" />
        <circle cx="160" cy="160" r="116" fill="none" stroke="rgba(184,211,197,0.18)" strokeWidth="0.6" strokeDasharray="2 6" />
        <circle cx="160" cy="160" r="70" fill="none" stroke="rgba(184,211,197,0.1)" strokeWidth="0.6" />
      </svg>

      {/* Glyphs evenly distributed around the circle, clock-style starting
       *  at the top. Order matches LEAD_TYPE_OPTIONS so the operator can
       *  follow their toggles below to the position above. */}
      <div className="absolute inset-0">
        {LEAD_GLYPH_ENTRIES.map((entry, index) => {
          const isActive = selected.includes(entry.key);
          const Icon = entry.icon;
          const angle = (index / LEAD_GLYPH_ENTRIES.length) * Math.PI * 2 - Math.PI / 2;
          const xPercent = 50 + Math.cos(angle) * radiusPercent;
          const yPercent = 50 + Math.sin(angle) * radiusPercent;

          return (
            <motion.div
              key={entry.key}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center"
              style={{
                left: `${xPercent}%`,
                top: `${yPercent}%`,
                width: glyphSize,
                height: glyphSize,
              }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{
                scale: isActive ? 1 : 0.82,
                opacity: isActive ? 1 : 0.22,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
            >
              {isActive ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 rounded-full blur-2xl"
                  style={{ background: `${entry.glow}66` }}
                />
              ) : null}
              <span
                className="relative flex size-full items-center justify-center rounded-2xl border"
                style={{
                  borderColor: isActive ? `${entry.glow}aa` : "rgba(255,255,255,0.08)",
                  background: isActive
                    ? `linear-gradient(160deg, ${entry.glow}33, ${entry.glow}10)`
                    : "rgba(255,255,255,0.025)",
                  boxShadow: isActive
                    ? `inset 0 1px 0 rgba(255,255,255,0.15), 0 12px 24px -10px ${entry.glow}66`
                    : "inset 0 1px 0 rgba(255,255,255,0.04)",
                }}
              >
                <Icon
                  className="size-[55%]"
                  weight={isActive ? "duotone" : "regular"}
                  color={isActive ? entry.glow : "rgba(255,255,255,0.45)"}
                />
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Count label floating below the circle */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.18em] text-white/45">
        {selected.length === 0 ? "pick what you handle" : `${selected.length} lead type${selected.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}

type LeadGlyphEntry = {
  key: string;
  icon: PhosphorIcon;
  glow: string;
};

// Order matters — glyphs render around the clock starting at 12 and going
// clockwise. Keep this aligned with LEAD_TYPE_OPTIONS so the toggle list
// position maps to the canvas position.
const LEAD_GLYPH_ENTRIES: ReadonlyArray<LeadGlyphEntry> = [
  { key: "buyer", icon: PhosphorKey, glow: "#b8d3c5" },
  { key: "seller", icon: PhosphorHouseLine, glow: "#d8c487" },
  { key: "investor", icon: PhosphorChartLineUp, glow: "#c9b9e0" },
  { key: "new construction", icon: PhosphorHardHat, glow: "#e0b8a4" },
  { key: "open house", icon: PhosphorCalendarHeart, glow: "#b8d3c5" },
  { key: "renter", icon: PhosphorDoor, glow: "#a4c4d8" },
];

function PriceBandVisual({ selected }: { selected: string[] }) {
  return (
    <div className="rounded-[38px] border border-white/10 bg-white/[0.055] p-5">
      <div className="flex h-56 items-end gap-2">
        {PRICE_BAND_OPTIONS.map((band, index) => {
          const active = selected.includes(band);
          return (
            <button
              key={band}
              type="button"
              className="flex flex-1 flex-col items-center gap-2"
              aria-label={band}
              tabIndex={-1}
            >
              <motion.span
                className="w-full rounded-t-2xl border border-white/10"
                animate={{ height: 52 + index * 23 }}
                style={{
                  background: active
                    ? "linear-gradient(180deg, #d8c487, #b8d3c5)"
                    : "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))",
                }}
              />
              <span className={cn("size-2 rounded-full", active ? "bg-[#d8c487]" : "bg-white/18")} />
            </button>
          );
        })}
      </div>
      <div className="mt-4 text-center text-[11px] uppercase tracking-[0.16em] text-white/35">market ladder</div>
    </div>
  );
}

function FocusVisual({ selected }: { selected: string[] }) {
  // Concentric ring composition — selected focuses light up around a
  // central H. No card mockups (those added hierarchy that didn't
  // exist in the data). The ring fills clockwise as picks come in.
  const total = LISTING_FOCUS_OPTIONS.length;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-1/4 rounded-full bg-[#b8d3c5]/16 blur-2xl"
      />
      <svg viewBox="0 0 320 320" className="absolute inset-0 size-full" aria-hidden="true">
        {/* Outer track ring */}
        <circle cx="160" cy="160" r="120" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
        {/* Inner contour ring */}
        <circle cx="160" cy="160" r="58" fill="none" stroke="rgba(184,211,197,0.18)" strokeWidth="1" />

        {LISTING_FOCUS_OPTIONS.map((option, index) => {
          const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
          const cx = 160 + Math.cos(angle) * 120;
          const cy = 160 + Math.sin(angle) * 120;
          const active = selected.includes(option.key);
          return (
            <motion.circle
              key={option.key}
              cx={cx}
              cy={cy}
              animate={{
                r: active ? 8 : 3.5,
                opacity: active ? 1 : 0.32,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
              fill={active ? "#b8d3c5" : "rgba(255,255,255,0.35)"}
              style={{
                filter: active ? "drop-shadow(0 0 12px rgba(184,211,197,0.6))" : "none",
              }}
            />
          );
        })}

        {/* Center H */}
        <g>
          <rect x="138" y="138" width="44" height="44" rx="12" fill="#0c1612" stroke="rgba(184,211,197,0.45)" strokeWidth="1" />
          <path
            d="M148 148 L148 172 M172 148 L172 172 M148 160 L172 160"
            stroke="#b8d3c5"
            strokeWidth="3.6"
            strokeLinecap="round"
          />
        </g>
      </svg>

      <div className="absolute inset-x-0 bottom-3 text-center text-[10.5px] uppercase tracking-[0.18em] text-white/45">
        {selected.length === 0
          ? "pick what makes a listing special"
          : `${selected.length} of ${total} active`}
      </div>
    </div>
  );
}

function VoiceVisual({ tone }: { tone?: string }) {
  // Live preview of what a Harwick draft will sound like, based on the
  // operator's tone description. No LLM call — fast client-side
  // transformation on a baseline sample so the operator sees their
  // voice landing in real time as they type.
  const draft = renderToneSample(tone ?? "");

  return (
    <div className="overflow-hidden rounded-[28px] border border-white/12 bg-[#0a1310] shadow-[0_28px_64px_-28px_rgba(0,0,0,0.55)]">
      {/* Conversation header strip — looks like a real DM */}
      <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-[#07100d]"
            style={{ background: "#b8d3c5" }}
          >
            MW
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11.5px] font-semibold text-white">Marcus Webb</span>
            <span className="text-[9.5px] uppercase tracking-[0.14em] text-white/35">instagram · just now</span>
          </div>
        </div>
        <span className="rounded-full bg-[#b8d3c5]/14 px-2 py-0.5 text-[10px] font-medium text-[#b8d3c5]">
          harwick draft
        </span>
      </div>

      {/* Inbound from lead */}
      <div className="px-4 pt-4">
        <div className="ml-1 mr-12 rounded-[14px] rounded-tl-[4px] bg-white/[0.06] px-3 py-2 text-[12.5px] leading-5 text-white/82">
          {LEAD_INBOUND_SAMPLE}
        </div>
        <div className="ml-2 mt-1 text-[10px] text-white/35">marcus · 1m ago</div>
      </div>

      {/* Harwick's drafted reply (this is the part that morphs with tone) */}
      <div className="px-4 py-4">
        <motion.div
          key={draft}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22 }}
          className="ml-12 mr-1 rounded-[14px] rounded-tr-[4px] border border-[#b8d3c5]/35 bg-[#b8d3c5]/12 px-3 py-2 text-[12.5px] leading-5 text-white"
        >
          {draft}
        </motion.div>
        <div className="mr-2 mt-1 text-right text-[10px] text-white/35">harwick · drafting in your voice</div>
      </div>
    </div>
  );
}

const LEAD_INBOUND_SAMPLE = "Hey 👋 saw the Bethesda listing — would FHA work here? still figuring out financing tbh";

function renderToneSample(toneDescription: string): string {
  // Cheap keyword-driven tonal rewrite — feels alive without an LLM call
  // on every keystroke. We map a handful of common tone descriptors onto
  // a small set of stylistic swaps applied to a baseline sample.
  const baseline =
    "Hey Marcus 👋 thanks for asking — FHA can go as low as 3.5% down, no problem. Quick q before I set up a tour: are you already talking with a lender?";
  const desc = toneDescription.toLowerCase();

  let draft = baseline;

  // Lowercase / casual
  if (
    desc.includes("lowercase")
    || desc.includes("casual")
    || desc.includes("low-key")
    || desc.includes("low key")
    || desc.includes("warm")
  ) {
    draft = draft.toLowerCase();
  }

  // Drop emoji
  if (desc.includes("no emoji") || desc.includes("without emoji") || desc.includes("no emojis")) {
    draft = draft.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/\s{2,}/g, " ").trim();
  }

  // Direct / short — collapse the qualifying preamble
  if (desc.includes("direct") || desc.includes("short") || desc.includes("tight")) {
    draft = draft
      .replace(/(Hey|hey) [a-zA-Z]+[\s,]+/, "")
      .replace(/thanks for asking — /i, "")
      .replace(/no problem\.\s*/i, "");
  }

  // Formal / professional
  if (desc.includes("formal") || desc.includes("professional")) {
    draft = "Hi Marcus, FHA loans typically require 3.5% down. Before scheduling a tour: have you spoken with a lender yet?";
  }

  // Never promise / cautious
  if (desc.includes("never promise") || desc.includes("cautious") || desc.includes("no certainty")) {
    draft = draft.replace(/can go as low as 3\.5%/, "is generally around 3.5%");
  }

  return draft.trim();
}

// Real-brand channel card faces. Each picked channel becomes a tall
// brand tile inside the Harwick box — Instagram's purple-pink-orange
// gradient with the camera glyph, Facebook's #1877F2 with the F, etc.
// Cards stack with the back ones peeking UP and out of the top edge of
// the pocket, like books standing in a wallet.
type ChannelBrand = {
  key: OnboardingChannel;
  name: string;
  background: string;
  textColor: string;
  glyph: (props: { className?: string }) => React.ReactElement;
};

function InstagramBrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect x="10" y="10" width="44" height="44" rx="12" stroke="currentColor" strokeWidth="4" />
      <circle cx="32" cy="32" r="11" stroke="currentColor" strokeWidth="4" />
      <circle cx="46" cy="18" r="2.6" fill="currentColor" />
    </svg>
  );
}

function FacebookBrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M37 24 L37 20 Q37 16 41 16 L46 16 L46 8 L40 8 Q30 8 30 18 L30 24 L23 24 L23 32 L30 32 L30 56 L37 56 L37 32 L44 32 L46 24 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function WebBrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <circle cx="32" cy="32" r="22" stroke="currentColor" strokeWidth="3" />
      <ellipse cx="32" cy="32" rx="10" ry="22" stroke="currentColor" strokeWidth="3" />
      <line x1="10" y1="32" x2="54" y2="32" stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function SmsBrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M14 18 Q14 12 20 12 L44 12 Q50 12 50 18 L50 36 Q50 42 44 42 L28 42 L18 52 L18 42 L20 42 Q14 42 14 36 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function VoiceBrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <path
        d="M22 12 Q14 12 14 20 L14 28 Q14 50 36 50 L44 50 Q52 50 52 42 L52 38 Q52 34 48 34 L42 34 Q40 34 39 36 L37 40 Q26 36 22 26 L26 23 Q28 22 28 19 L28 16 Q28 12 24 12 Z"
        fill="currentColor"
      />
    </svg>
  );
}

const CHANNEL_BRANDS: Record<OnboardingChannel, ChannelBrand> = {
  instagram: {
    key: "instagram",
    name: "Instagram",
    background:
      "radial-gradient(120% 100% at 12% 110%, #FEDA77 0%, #F58529 18%, #DD2A7B 42%, #8134AF 70%, #515BD4 100%)",
    textColor: "#ffffff",
    glyph: InstagramBrandGlyph,
  },
  facebook: {
    key: "facebook",
    name: "Facebook",
    background: "linear-gradient(180deg, #1877F2 0%, #0e5fcc 100%)",
    textColor: "#ffffff",
    glyph: FacebookBrandGlyph,
  },
  website: {
    key: "website",
    name: "Listings site",
    background: "linear-gradient(180deg, #1f2a26 0%, #0b1410 100%)",
    textColor: "#b8d3c5",
    glyph: WebBrandGlyph,
  },
  sms: {
    key: "sms",
    name: "SMS",
    background: "linear-gradient(180deg, #34C759 0%, #1f9d40 100%)",
    textColor: "#ffffff",
    glyph: SmsBrandGlyph,
  },
  voice: {
    key: "voice",
    name: "Voice",
    background: "linear-gradient(180deg, #1c1c1e 0%, #060608 100%)",
    textColor: "#f4f4f5",
    glyph: VoiceBrandGlyph,
  },
};

function ChannelVisual({ channels }: { channels: Record<OnboardingChannel, ChannelMode> }) {
  // Harwick "pocket" — a single dark rounded box at the bottom of the
  // visual area with a soft inner shadow at its top edge (the "cutoff"
  // that makes it read as a pocket / wallet / shelf).
  // Picked channels become full brand tiles standing inside the pocket.
  // Each card behind the front is translated UP by ~24px and scaled
  // 0.96 per layer, so their tops peek out above the front card and
  // above the pocket's top edge — like books on a shelf.
  const activeChannels = CHANNEL_OPTIONS.filter((option) => channels[option.key] !== "off");

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[320px]">
      {/* Floor halo */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3"
        style={{
          background: "radial-gradient(60% 60% at 50% 92%, rgba(184,211,197,0.18), transparent 70%)",
        }}
      />

      {/* The pocket — single rounded container, dark fill, inner shadow
       *  along the top edge so it reads as a 3D pocket the cards live in. */}
      <div
        className="absolute inset-x-4 rounded-[26px] border border-white/12"
        style={{
          top: "54%",
          bottom: "6%",
          background:
            "linear-gradient(180deg, rgba(7,16,13,0.85) 0%, rgba(7,16,13,0.65) 100%)",
          boxShadow:
            "inset 0 10px 22px -10px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.05), 0 28px 60px -28px rgba(0,0,0,0.75)",
        }}
      />

      {/* Harwick mark stamped on the pocket front */}
      <div
        className="absolute bottom-[10%] left-1/2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.36em]"
        style={{ color: "rgba(184,211,197,0.4)" }}
      >
        harwick
      </div>

      {/* Card stack. Cards extend ABOVE the pocket top edge so their tops
       *  peek out. Cards are anchored at bottom so they grow upward into
       *  the visible area. */}
      <div className="absolute inset-x-9" style={{ top: "8%", bottom: "12%" }}>
        <AnimatePresence initial={false}>
          {activeChannels.map((option, index) => {
            const mode = channels[option.key];
            const stackIndex = activeChannels.length - 1 - index;
            const isTop = stackIndex === 0;
            const brand = CHANNEL_BRANDS[option.key];
            const Glyph = brand.glyph;
            const isGold = mode === "auto_send";

            return (
              <motion.div
                key={option.key}
                layout
                initial={{ opacity: 0, y: 32, rotate: stackIndex % 2 === 0 ? -3 : 3 }}
                animate={{
                  opacity: 1,
                  y: -stackIndex * 22,
                  scale: 1 - stackIndex * 0.045,
                  rotate: 0,
                }}
                exit={{ opacity: 0, y: 48, rotate: 4 }}
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                className="absolute inset-x-0 bottom-0 overflow-hidden rounded-[18px]"
                style={{
                  zIndex: 100 + activeChannels.length - stackIndex,
                  height: "92%",
                  background: brand.background,
                  border: `1px solid ${isTop ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)"}`,
                  boxShadow: isTop
                    ? "0 28px 50px -18px rgba(0,0,0,0.72), inset 0 1px 0 rgba(255,255,255,0.18)"
                    : "0 22px 36px -22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.12)",
                  transformOrigin: "bottom center",
                }}
              >
                {/* Subtle inner shimmer for the front card */}
                {isTop ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "radial-gradient(80% 60% at 25% 0%, rgba(255,255,255,0.22), transparent 60%)",
                    }}
                  />
                ) : null}

                <div className="relative flex h-full flex-col justify-between p-4">
                  <div className="flex items-start justify-between">
                    <Glyph className="size-9" />
                    {isGold ? (
                      <span
                        className="rounded-full bg-white/22 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] backdrop-blur-md"
                        style={{ color: brand.textColor }}
                      >
                        auto
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold" style={{ color: brand.textColor }}>
                      {brand.name}
                    </span>
                    <span
                      className="text-[10.5px] uppercase tracking-[0.14em]"
                      style={{ color: brand.textColor, opacity: 0.75 }}
                    >
                      {modeShortLabel(mode)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {activeChannels.length === 0 ? (
          <div className="absolute inset-x-0 bottom-3 text-center">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/35">
              empty pocket · pick a channel
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function modeShortLabel(mode: ChannelMode): string {
  if (mode === "auto_send") return "auto-send";
  if (mode === "approval_first") return "approve before send";
  if (mode === "suggest_only") return "draft only";
  return "off";
}

function channelLabel(channels: Record<OnboardingChannel, ChannelMode>): string {
  const active = CHANNEL_OPTIONS.filter((option) => channels[option.key] !== "off").length;
  const auto = (Object.values(channels) as ChannelMode[]).filter((mode) => mode === "auto_send").length;
  if (active === 0) return "no channels on yet";
  if (auto > 0) return `${active} on · ${auto} on auto`;
  return `${active} of ${CHANNEL_OPTIONS.length} channels`;
}

function AutonomyVisual({ autonomy }: { autonomy: SetupDraft["autonomy"] }) {
  // Talking-state SVG. Harwick (H glyph) on the left, chat bubble on the
  // right. Dial position changes what Harwick is doing:
  //   draft       → silent · bubble shows pulsing "..."
  //   approval    → holding · bubble shows a paper plane held back
  //   safe_auto   → sending · paper plane mid-flight with a motion trail
  const state = autonomy === "draft" ? "silent" : autonomy === "approval" ? "holding" : "sending";
  const accent = state === "sending" ? "#d8c487" : "#b8d3c5";
  return (
    <div className="relative aspect-square w-full max-w-[320px] mx-auto">
      {/* Ambient halo behind Harwick */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-1/4 h-1/2"
        style={{
          background: `radial-gradient(50% 50% at 28% 50%, ${accent}29, transparent 70%)`,
        }}
      />

      <svg viewBox="0 0 320 320" className="absolute inset-0 size-full" aria-hidden="true">
        {/* Harwick glyph — a stylized H badge */}
        <motion.g
          animate={{ scale: state === "sending" ? [1, 1.02, 1] : 1 }}
          transition={{ duration: 1.6, repeat: state === "sending" ? Infinity : 0, ease: "easeInOut" }}
          style={{ transformOrigin: "90px 160px" }}
        >
          <rect
            x="48"
            y="118"
            width="84"
            height="84"
            rx="22"
            fill="#0c1612"
            stroke={`${accent}66`}
            strokeWidth="1.2"
          />
          <path
            d="M68 138 L68 182 M112 138 L112 182 M68 160 L112 160"
            stroke={accent}
            strokeWidth="6"
            strokeLinecap="round"
          />
        </motion.g>

        {/* Chat bubble */}
        <motion.g
          animate={{
            x: state === "sending" ? [0, 22, 0] : 0,
            opacity: 1,
          }}
          transition={{ duration: 1.8, repeat: state === "sending" ? Infinity : 0, ease: "easeInOut" }}
        >
          <path
            d="M168 122 Q156 122 156 134 L156 178 Q156 190 168 190 L188 190 L196 202 L204 190 L256 190 Q268 190 268 178 L268 134 Q268 122 256 122 Z"
            fill={`${accent}1f`}
            stroke={`${accent}80`}
            strokeWidth="1.2"
          />

          {/* Bubble contents change by state */}
          {state === "silent" ? (
            // Three pulsing dots — Harwick is thinking, not speaking
            <g>
              {[0, 1, 2].map((i) => (
                <motion.circle
                  key={i}
                  cx={184 + i * 14}
                  cy={156}
                  r={4}
                  fill={accent}
                  animate={{ opacity: [0.25, 1, 0.25] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    delay: i * 0.18,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </g>
          ) : null}

          {state === "holding" ? (
            // Paper plane outline + a hand-off chevron ⇨ waiting on approval
            <g fill="none" stroke={accent} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
              <path d="M178 152 L240 134 L222 174 L210 162 L178 152 Z" opacity="0.85" />
              <path d="M210 162 L222 174" opacity="0.85" />
              {/* A small lock-style chevron over the plane */}
              <path d="M196 168 L202 174 L210 162" opacity="0.55" />
            </g>
          ) : null}

          {state === "sending" ? (
            // Filled paper plane mid-flight + motion trail
            <g>
              <path
                d="M178 152 L240 134 L222 174 L210 162 L178 152 Z"
                fill={accent}
                stroke={accent}
                strokeWidth="1"
                strokeLinejoin="round"
              />
              <motion.g
                animate={{ opacity: [0.6, 0.1, 0.6] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                stroke={accent}
                strokeWidth="1.2"
                strokeLinecap="round"
              >
                <line x1="166" y1="156" x2="178" y2="156" />
                <line x1="158" y1="162" x2="170" y2="162" />
                <line x1="172" y1="150" x2="180" y2="150" />
              </motion.g>
            </g>
          ) : null}
        </motion.g>
      </svg>

      {/* State label underneath — small, lowercase, mono */}
      <div className="absolute inset-x-0 bottom-3 text-center text-[10.5px] uppercase tracking-[0.18em] text-white/45">
        {state === "silent" ? "thinking · operator sends" : state === "holding" ? "drafted · waiting on approval" : "auto-send · safe replies only"}
      </div>
    </div>
  );
}

function ActivationVisual({ planTier, operatorRole }: { planTier: SetupPageProps["planTier"]; operatorRole: WorkspaceRole }) {
  const items = ACTIVATION_ITEMS.filter((item) => planMeets(planTier, item.minimumPlan) || item.minimumPlan === "solo").slice(0, 5);
  return (
    <div className="rounded-[38px] border border-white/10 bg-white/[0.055] p-4">
      <div className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const ready = planMeets(planTier, item.minimumPlan) && item.roles.includes(operatorRole);
          return (
            <div key={item.key} className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-white/[0.04] p-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.06]">
                <Icon className="size-4 text-[#b8d3c5]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold text-white">{item.label}</span>
                <span className="block truncate text-[10.5px] text-white/42">{item.description}</span>
              </span>
              <span className={cn("size-2 rounded-full", ready ? "bg-[#b8d3c5]" : "bg-[#d8c487]/55")} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WelcomeScene({ onNext }: { onNext: () => void }) {
  // Bypasses SceneFrame on purpose — the welcome moment is a single
  // logo on the bg + one CTA. No card, no title, no description, no
  // muted info line.
  return (
    <div className="flex min-h-[640px] flex-col items-center justify-center gap-12">
      <WelcomeVisual />
      <div className="w-full max-w-[300px]">
        <PrimaryCta onClick={onNext}>
          Let&apos;s get started
          <ArrowRight className="size-4" aria-hidden="true" />
        </PrimaryCta>
      </div>
    </div>
  );
}

function PrimaryAreasScene({
  areas,
  resolvedAreas,
  onAreaSelect,
  onRemoveArea,
  onMapResolve,
  onNext,
}: {
  areas: string[];
  resolvedAreas: Map<string, ResolvedArea>;
  onAreaSelect: (resolved: ResolvedArea) => void;
  onRemoveArea: (value: string) => void;
  onMapResolve: (resolved: ResolvedArea) => void;
  onNext: () => void;
}) {
  const resolvedPlaceNames = Array.from(resolvedAreas.values()).map((entry) => entry.placeName);

  return (
    <SceneFrame
      eyebrow="market"
      title="Where should Harwick pay attention?"
      description="Search for the cities, neighborhoods, or zip codes where the best leads should route first."
      visual={
        <MarketMapVisual
          areas={areas}
          resolvedAreas={resolvedAreas}
          onResolve={onMapResolve}
        />
      }
      footer={
        <>
          <AreaSearchInput
            placeholder="Search for a city, neighborhood, or zip"
            excludeKeys={resolvedPlaceNames}
            onSelect={onAreaSelect}
          />

          {areas.length > 0 ? (
            <div className="rounded-[20px] border border-white/10 bg-white/[0.04] p-2.5">
              <Label className="mb-2 block px-1 text-[10px] uppercase tracking-[0.16em] text-white/38">
                Primary areas
              </Label>
              <ul className="flex flex-col gap-1">
                {areas.map((area) => {
                  const resolved = resolvedAreas.get(area);
                  const context = resolved?.placeName.includes(",")
                    ? resolved.placeName.slice(resolved.placeName.indexOf(",") + 1).trim()
                    : null;
                  return (
                    <li
                      key={area}
                      className="flex items-center justify-between gap-2 rounded-[14px] bg-white/[0.04] px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium text-white">{area}</div>
                        {context !== null ? (
                          <div className="truncate text-[11px] text-white/45">{context}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveArea(area)}
                        aria-label={`Remove ${area}`}
                        className="shrink-0 rounded-full p-1 text-white/45 transition hover:bg-white/5 hover:text-white"
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <PrimaryCta disabled={areas.length === 0} onClick={onNext}>
            Set my market
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function LeadTypesScene({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <SceneFrame
      eyebrow="lead types"
      title="What leads should Harwick prioritize?"
      description="These become the first qualification and routing lens."
      visual={<LeadTypeVisual selected={selected} />}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            {LEAD_TYPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = selected.includes(option.key);
              return (
                <GlassPanel key={option.key} selected={active} onClick={() => onToggle(option.key)} className="p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-[#b8d3c5]" />
                    <span className="text-[12px] font-semibold text-white">{option.label}</span>
                    <span className="ml-auto"><SmallCheck selected={active} /></span>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
          <PrimaryCta disabled={selected.length === 0} onClick={onNext}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function PriceBandsScene({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <SceneFrame
      eyebrow="price bands"
      title="What price ranges matter?"
      description="Harwick uses this to qualify, route, and avoid treating every inquiry the same."
      visual={<PriceBandVisual selected={selected} />}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            {PRICE_BAND_OPTIONS.map((band) => {
              const active = selected.includes(band);
              return (
                <GlassPanel key={band} selected={active} onClick={() => onToggle(band)} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-white">{band}</span>
                    <SmallCheck selected={active} />
                  </div>
                </GlassPanel>
              );
            })}
          </div>
          <PrimaryCta onClick={onNext}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function ListingFocusScene({
  selected,
  onToggle,
  onNext,
}: {
  selected: string[];
  onToggle: (value: string) => void;
  onNext: () => void;
}) {
  return (
    <SceneFrame
      eyebrow="listing focus"
      title="What should Harwick recognize as special?"
      description="This helps Harwick speak with market-specific confidence without inventing details."
      visual={<FocusVisual selected={selected} />}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            {LISTING_FOCUS_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = selected.includes(option.key);
              return (
                <GlassPanel key={option.key} selected={active} onClick={() => onToggle(option.key)} className="p-3">
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-[#b8d3c5]" />
                    <span className="text-[12px] font-semibold text-white">{option.label}</span>
                    <span className="ml-auto"><SmallCheck selected={active} /></span>
                  </div>
                </GlassPanel>
              );
            })}
          </div>
          <PrimaryCta onClick={onNext}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function VoiceToneScene({
  value,
  submitting,
  error,
  onChange,
  onSave,
}: {
  value: string;
  submitting: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <SceneFrame
      eyebrow="voice"
      title="How should Harwick sound?"
      description="Short, warm, direct, never pushy. Tell Harwick how to behave before it touches a real lead."
      visual={<VoiceVisual />}
      footer={
        <>
          <DarkTextarea
            rows={4}
            className="rounded-[24px] px-4 py-3 text-[13.5px] leading-5"
            placeholder="Warm, low-key, direct. Always ask one qualifying question. Never promise loan or legal certainty."
            maxLength={500}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {error !== null ? <ErrorBox>{error}</ErrorBox> : null}
          <PrimaryCta disabled={value.trim().length < 8} loading={submitting} onClick={onSave}>
            Save business memory
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function ReplyExamplesScene({
  workspaceId,
  examples,
  submitting,
  error,
  onUpdate,
  onAdd,
  onAddBulk,
  onRemove,
  onSave,
}: {
  workspaceId: string;
  examples: string[];
  submitting: boolean;
  error: string | null;
  onUpdate: (index: number, value: string) => void;
  onAdd: () => void;
  onAddBulk: (messages: string[]) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}) {
  const usableCount = examples.map((entry) => entry.trim()).filter((entry) => entry.length >= 8).length;
  return (
    <SceneFrame
      eyebrow="samples"
      title="Show Harwick how you sound."
      description="Paste real replies, or drop a screenshot of a past Instagram / SMS thread and Harwick will pull the messages out."
      visual={<VoiceVisual />}
      footer={
        <>
          <ReplyExamplesUploadZone workspaceId={workspaceId} onExtracted={onAddBulk} />
          <div className="space-y-2">
            {examples.map((example, index) => (
              <div key={index} className="relative rounded-[24px] border border-white/10 bg-white/[0.055]">
                <DarkInlineTextarea
                  rows={3}
                  maxLength={8000}
                  className="pr-11"
                  placeholder="hey marcus, good question. fha can go as low as 3.5%. are you already talking with a lender?"
                  value={example}
                  onChange={(event) => onUpdate(index, event.target.value)}
                />
                {examples.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    aria-label="Remove example"
                    className="absolute right-3 top-3 rounded-full bg-white/[0.06] p-1.5 text-white/46 hover:text-white"
                  >
                    <Trash2 className="size-3" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
          {examples.length < 8 ? (
            <GhostCta onClick={onAdd}>
              <Plus className="size-3.5" />
              Add another sample
            </GhostCta>
          ) : null}
          <p className="text-center text-[11px] text-white/38">
            {usableCount === 0
              ? "Add at least 1 sample to continue"
              : `${usableCount} sample${usableCount === 1 ? "" : "s"} ready — more is better`}
          </p>
          {error !== null ? <ErrorBox>{error}</ErrorBox> : null}
          <PrimaryCta disabled={usableCount === 0} loading={submitting} onClick={onSave}>
            This sounds like me
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; filename: string }
  | { status: "done"; filename: string; count: number }
  | { status: "error"; message: string };

function ReplyExamplesUploadZone({
  workspaceId,
  onExtracted,
}: {
  workspaceId: string;
  onExtracted: (messages: string[]) => void;
}) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const [dragActive, setDragActive] = useState(false);

  async function upload(file: File) {
    setState({ status: "uploading", filename: file.name });
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/onboarding-step/reply-examples/extract`,
        { method: "POST", body: formData },
      );
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        if (detail.error === "pdf_not_yet_supported") {
          setState({ status: "error", message: "PDFs coming soon — paste the text for now." });
          return;
        }
        if (detail.error === "vision_unavailable") {
          setState({ status: "error", message: "Vision is offline. Paste the messages for now." });
          return;
        }
        if (detail.error === "file_too_large") {
          setState({ status: "error", message: "File over 12 MB. Try a smaller screenshot." });
          return;
        }
        setState({ status: "error", message: detail.message ?? "Could not read that file." });
        return;
      }
      const payload = (await response.json()) as { messages?: string[] };
      const messages = (payload.messages ?? []).filter((message) => message.trim().length >= 4);
      if (messages.length === 0) {
        setState({ status: "error", message: "No agent messages found in that image." });
        return;
      }
      onExtracted(messages);
      setState({ status: "done", filename: file.name, count: messages.length });
    } catch {
      setState({ status: "error", message: "Upload failed. Try again." });
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.item(0);
    if (file === null || file === undefined) return;
    void upload(file);
  }

  const isUploading = state.status === "uploading";

  return (
    <label
      onDragOver={(event) => {
        event.preventDefault();
        if (!dragActive) setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[20px] border border-dashed px-4 py-5 text-center transition",
        dragActive
          ? "border-[#b8d3c5]/60 bg-[#b8d3c5]/[0.06]"
          : "border-white/12 bg-white/[0.025] hover:border-white/22 hover:bg-white/[0.04]",
      )}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,text/plain"
        className="sr-only"
        disabled={isUploading}
        onChange={(event) => handleFiles(event.target.files)}
      />

      {isUploading ? (
        <div className="flex items-center gap-2 text-[12.5px] text-white/72">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          <span>Reading {truncateFilename(state.filename)}…</span>
        </div>
      ) : state.status === "done" ? (
        <>
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-[#b8d3c5]">
            <Check className="size-3.5" aria-hidden="true" />
            <span>Pulled {state.count} message{state.count === 1 ? "" : "s"} from {truncateFilename(state.filename)}</span>
          </div>
          <span className="text-[11px] text-white/45">Drop another or paste below.</span>
        </>
      ) : state.status === "error" ? (
        <>
          <div className="flex items-center gap-2 text-[12.5px] font-medium text-red-200">
            <X className="size-3.5" aria-hidden="true" />
            <span>{state.message}</span>
          </div>
          <span className="text-[11px] text-white/45">Try another file or paste below.</span>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 text-[13px] font-medium text-white">
            <UploadCloud className="size-4 text-[#b8d3c5]" aria-hidden="true" />
            <span>Drop a screenshot of a closed Instagram / SMS thread</span>
          </div>
          <span className="text-[11px] text-white/45">
            Harwick reads the conversation and pulls your messages out · PNG, JPG, WEBP, or .txt
          </span>
        </>
      )}
    </label>
  );
}

function truncateFilename(name: string): string {
  if (name.length <= 32) return name;
  return `${name.slice(0, 18)}…${name.slice(-10)}`;
}

function ChannelsScene({
  channels,
  planTier,
  onSetMode,
  onNext,
}: {
  channels: Record<OnboardingChannel, ChannelMode>;
  planTier: SetupPageProps["planTier"];
  onSetMode: (channel: OnboardingChannel, mode: ChannelMode) => void;
  onNext: () => void;
}) {
  const activeCount = Object.entries(channels).filter(([channel, mode]) => {
    const option = CHANNEL_OPTIONS.find((entry) => entry.key === channel);
    return mode !== "off" && option !== undefined && planMeets(planTier, option.minimumPlan);
  }).length;

  return (
    <SceneFrame
      eyebrow="channels"
      title="Where can Harwick listen?"
      description="Pick modes now. The real connection steps stay in Settings and Integrations."
      visual={<ChannelVisual channels={channels} />}
      footer={
        <>
          <div className="space-y-2">
            {CHANNEL_OPTIONS.map((option) => {
              const Icon = option.icon;
              const mode = channels[option.key];
              const planAllowed = planMeets(planTier, option.minimumPlan);
              return (
                <GlassPanel key={option.key} className={cn("p-3", !planAllowed && "opacity-55")}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.06]">
                      <Icon className="size-4 text-[#b8d3c5]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-[13px] font-semibold text-white">
                        {option.label}
                        {!planAllowed ? <span className="text-[10px] uppercase tracking-[0.12em] text-[#d8c487]">{planLabel(option.minimumPlan)}+</span> : null}
                      </span>
                      <span className="block text-[11px] text-white/42">{option.description}</span>
                    </span>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {CHANNEL_MODE_OPTIONS.filter((entry) => entry.key !== "auto_send" || planTier !== "free").map((entry) => (
                      <button
                        key={entry.key}
                        type="button"
                        disabled={!planAllowed}
                        onClick={() => onSetMode(option.key, entry.key)}
                        className={cn(
                          "flex-1 rounded-xl px-2 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed",
                          mode === entry.key ? "text-[#07100d]" : "bg-white/[0.04] text-white/52 hover:bg-white/[0.07] hover:text-white",
                        )}
                        style={mode === entry.key ? { background: HARWICK_GLOW.accent } : undefined}
                        title={entry.full}
                      >
                        {entry.short}
                      </button>
                    ))}
                  </div>
                </GlassPanel>
              );
            })}
          </div>
          <PrimaryCta disabled={activeCount === 0} onClick={onNext}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function AutonomyScene({
  autonomy,
  planTier,
  operatorRole,
  submitting,
  error,
  onChange,
  onSave,
}: {
  autonomy: SetupDraft["autonomy"];
  planTier: SetupPageProps["planTier"];
  operatorRole: WorkspaceRole;
  submitting: boolean;
  error: string | null;
  onChange: (value: SetupDraft["autonomy"]) => void;
  onSave: () => void;
}) {
  const autoLocked = planTier === "free" || !canManageAutomation(operatorRole);
  return (
    <SceneFrame
      eyebrow="autonomy"
      title="How much should Harwick do alone?"
      description="Start conservative. You can increase autonomy once live replies feel right."
      visual={<AutonomyVisual autonomy={autonomy} />}
      footer={
        <>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: "draft", label: "Draft", icon: MessageSquare },
              { key: "approval", label: "Approve", icon: ClipboardCheck },
              { key: "safe_auto", label: "Auto", icon: Gauge },
            ].map((option) => {
              const Icon = option.icon;
              const selected = autonomy === option.key;
              const locked = option.key === "safe_auto" && autoLocked;
              return (
                locked ? (
                  <GlassPanel
                    key={option.key}
                    selected={selected}
                    className="flex min-h-[112px] flex-col items-center justify-center p-3 text-center opacity-45"
                  >
                    <Icon className="size-5 text-[#b8d3c5]" />
                    <p className="mt-2 text-[12px] font-semibold text-white">{option.label}</p>
                  </GlassPanel>
                ) : (
                  <GlassPanel
                    key={option.key}
                    selected={selected}
                    onClick={() => onChange(option.key as SetupDraft["autonomy"])}
                    className="flex min-h-[112px] flex-col items-center justify-center p-3 text-center"
                  >
                    <Icon className="size-5 text-[#b8d3c5]" />
                    <p className="mt-2 text-[12px] font-semibold text-white">{option.label}</p>
                  </GlassPanel>
                )
              );
            })}
          </div>
          {error !== null ? <ErrorBox>{error}</ErrorBox> : null}
          <PrimaryCta loading={submitting} onClick={onSave}>
            Save channels and autonomy
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function ActivationScene({
  planTier,
  operatorRole,
  onNext,
}: {
  planTier: SetupPageProps["planTier"];
  operatorRole: WorkspaceRole;
  onNext: () => void;
}) {
  return (
    <SceneFrame
      eyebrow="connect"
      title="One last thing — turn Harwick on."
      description="Connect the channels you picked. Harwick can't read a single lead until at least one is live."
      visual={<ActivationVisual planTier={planTier} operatorRole={operatorRole} />}
      footer={
        <>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-white">
              <Bell className="size-4 text-[#b8d3c5]" />
              You can finish this from Settings later.
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-white/45">
              Each connector lives in Settings → Integrations after setup. Connect what you have now; come back for the rest.
            </p>
          </div>
          <PrimaryCta onClick={onNext}>
            Finish and open Harwick
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function DoneScene({ workspaceName }: { workspaceName: string }) {
  return (
    <SceneFrame
      eyebrow="ready"
      title={`${workspaceName} is live.`}
      description="Harwick starts learning from every lead you handle."
      visual={<WelcomeVisual />}
      footer={
        <PrimaryCta onClick={() => window.location.assign("/home")}>
          Open workspace
          <ArrowRight className="size-4" aria-hidden="true" />
        </PrimaryCta>
      }
    />
  );
}

export function OnboardingSetupPage(props: SetupPageProps) {
  const [scene, setScene] = useState<SceneKey>(() => deriveInitialScene(props.initialState));
  const [draft, setDraft] = useState<SetupDraft>(() => createInitialDraft(props.planTier));
  const [identitySaving, setIdentitySaving] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [replySaving, setReplySaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [channelSaving, setChannelSaving] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const [resolvedAreas, setResolvedAreas] = useState<Map<string, ResolvedArea>>(() => new Map());

  function goBack() {
    setScene((current) => previousScene(current));
  }

  function addArea() {
    const trimmed = draft.areaDraft.trim();
    if (trimmed.length === 0 || draft.areas.includes(trimmed) || draft.areas.length >= 8) return;
    setDraft((current) => ({ ...current, areas: [...current.areas, trimmed], areaDraft: "" }));
  }

  function handleAreaSelect(resolved: ResolvedArea) {
    if (draft.areas.length >= 8) return;
    const label = resolved.placeName.split(",")[0]?.trim() ?? resolved.placeName;
    if (draft.areas.includes(label)) return;
    setResolvedAreas((current) => {
      const next = new Map(current);
      next.set(label, resolved);
      return next;
    });
    setDraft((current) => ({ ...current, areas: [...current.areas, label] }));
  }

  function handleResolvedFromMap(resolved: ResolvedArea) {
    setResolvedAreas((current) => {
      if (current.has(resolved.query)) return current;
      const next = new Map(current);
      next.set(resolved.query, resolved);
      return next;
    });
  }

  function handleRemoveArea(area: string) {
    setResolvedAreas((current) => {
      if (!current.has(area)) return current;
      const next = new Map(current);
      next.delete(area);
      return next;
    });
    setDraft((current) => ({ ...current, areas: current.areas.filter((entry) => entry !== area) }));
  }

  async function saveIdentity() {
    if (draft.workspaceType === null || draft.areas.length === 0 || draft.leadTypes.length === 0 || draft.toneDescription.trim().length < 8) {
      return;
    }

    setIdentitySaving(true);
    setIdentityError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/onboarding-step/identity`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceType: draft.workspaceType,
          primaryAreas: draft.areas,
          leadTypes: draft.leadTypes,
          priceBands: draft.priceBands,
          listingFocus: draft.listingFocus,
          routingNotes: buildRoutingNotes(draft),
          toneDescription: draft.toneDescription.trim(),
        }),
      });
      if (!response.ok) {
        setIdentityError("Could not save the business memory. Try again.");
        return;
      }
      setScene("reply_examples");
    } catch {
      setIdentityError("Network error. Try again.");
    } finally {
      setIdentitySaving(false);
    }
  }

  async function saveReplies() {
    const examples = draft.replyExamples.map((entry) => entry.trim()).filter((entry) => entry.length >= 8);
    if (examples.length === 0) return;

    setReplySaving(true);
    setReplyError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/onboarding-step/reply-examples`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          examples: examples.map((body) => ({ body, source: "onboarding_paste" as const })),
        }),
      });
      if (!response.ok) {
        setReplyError("Could not save reply examples. Try again.");
        return;
      }
      setScene("channels");
    } catch {
      setReplyError("Network error. Try again.");
    } finally {
      setReplySaving(false);
    }
  }

  const activeIntents = useMemo(
    () =>
      (Object.entries(draft.channels) as Array<[OnboardingChannel, ChannelMode]>)
        .filter(([channel, mode]) => {
          const option = CHANNEL_OPTIONS.find((entry) => entry.key === channel);
          return mode !== "off" && option !== undefined && planMeets(props.planTier, option.minimumPlan);
        })
        .map(([channel, mode]) => ({
          channel,
          desiredMode: mode as OnboardingChannelMode,
          notes: `onboarding autonomy: ${draft.autonomy}`,
        })),
    [draft.autonomy, draft.channels, props.planTier],
  );

  async function saveChannels() {
    if (activeIntents.length === 0) return;

    setChannelSaving(true);
    setChannelError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/onboarding-step/channels`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ intents: activeIntents }),
      });
      if (!response.ok) {
        setChannelError("Could not save channels and autonomy. Try again.");
        return;
      }
      setScene("activation");
    } catch {
      setChannelError("Network error. Try again.");
    } finally {
      setChannelSaving(false);
    }
  }

  return (
    <Shell scene={scene} onBack={scene === "welcome" || scene === "done" ? null : goBack}>
      {scene === "welcome" ? (
        <WelcomeScene onNext={() => setScene("primary_areas")} />
      ) : null}

      {scene === "primary_areas" ? (
        <PrimaryAreasScene
          areas={draft.areas}
          resolvedAreas={resolvedAreas}
          onAreaSelect={handleAreaSelect}
          onRemoveArea={handleRemoveArea}
          onMapResolve={handleResolvedFromMap}
          onNext={() => setScene("lead_types")}
        />
      ) : null}

      {scene === "lead_types" ? (
        <LeadTypesScene
          selected={draft.leadTypes}
          onToggle={(leadType) => setDraft((current) => ({ ...current, leadTypes: updateSelection(current.leadTypes, leadType) }))}
          onNext={() => setScene("price_bands")}
        />
      ) : null}

      {scene === "price_bands" ? (
        <PriceBandsScene
          selected={draft.priceBands}
          onToggle={(priceBand) => setDraft((current) => ({ ...current, priceBands: updateSelection(current.priceBands, priceBand) }))}
          onNext={() => setScene("listing_focus")}
        />
      ) : null}

      {scene === "listing_focus" ? (
        <ListingFocusScene
          selected={draft.listingFocus}
          onToggle={(focus) => setDraft((current) => ({ ...current, listingFocus: updateSelection(current.listingFocus, focus) }))}
          onNext={() => setScene("voice_tone")}
        />
      ) : null}

      {scene === "voice_tone" ? (
        <VoiceToneScene
          value={draft.toneDescription}
          submitting={identitySaving}
          error={identityError}
          onChange={(toneDescription) => setDraft((current) => ({ ...current, toneDescription }))}
          onSave={() => void saveIdentity()}
        />
      ) : null}

      {scene === "reply_examples" ? (
        <ReplyExamplesScene
          workspaceId={props.workspaceId}
          examples={draft.replyExamples}
          submitting={replySaving}
          error={replyError}
          onUpdate={(index, value) => setDraft((current) => ({
            ...current,
            replyExamples: current.replyExamples.map((entry, position) => (position === index ? value : entry)),
          }))}
          onAdd={() => setDraft((current) => ({ ...current, replyExamples: [...current.replyExamples, ""] }))}
          onAddBulk={(extracted) => setDraft((current) => {
            // If the first slot is empty (initial state), drop it so we
            // don't show a blank textarea above the extracted set.
            const seed = current.replyExamples.length === 1 && current.replyExamples[0]?.trim().length === 0
              ? []
              : current.replyExamples;
            const merged = [...seed, ...extracted];
            return { ...current, replyExamples: merged.slice(0, 8) };
          })}
          onRemove={(index) => setDraft((current) => ({
            ...current,
            replyExamples: current.replyExamples.filter((_, position) => position !== index),
          }))}
          onSave={() => void saveReplies()}
        />
      ) : null}

      {scene === "channels" ? (
        <ChannelsScene
          channels={draft.channels}
          planTier={props.planTier}
          onSetMode={(channel, mode) => setDraft((current) => ({
            ...current,
            channels: { ...current.channels, [channel]: mode },
          }))}
          onNext={() => setScene("autonomy")}
        />
      ) : null}

      {scene === "autonomy" ? (
        <AutonomyScene
          autonomy={draft.autonomy}
          planTier={props.planTier}
          operatorRole={props.operatorRole}
          submitting={channelSaving}
          error={channelError}
          onChange={(autonomy) => setDraft((current) => ({ ...current, autonomy }))}
          onSave={() => void saveChannels()}
        />
      ) : null}

      {scene === "activation" ? (
        <ActivationScene
          planTier={props.planTier}
          operatorRole={props.operatorRole}
          onNext={() => setScene("done")}
        />
      ) : null}

      {scene === "done" ? <DoneScene workspaceName={props.workspaceName} /> : null}
    </Shell>
  );
}

function buildRoutingNotes(draft: SetupDraft): string | undefined {
  const lines = [
    draft.priceBands.length > 0 ? `Price bands that matter: ${draft.priceBands.join(", ")}` : null,
    draft.listingFocus.length > 0 ? `Listing focus: ${draft.listingFocus.join(", ")}` : null,
  ].filter((line): line is string => line !== null);
  return lines.length > 0 ? lines.join("\n") : undefined;
}
