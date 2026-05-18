"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Briefcase,
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

import { MarketMap } from "./market-map";
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
  | "workspace_type"
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
  "workspace_type",
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

type WorkspaceTypeOption = {
  key: WorkspaceType;
  label: string;
  description: string;
  icon: LucideIcon;
};

const WORKSPACE_TYPE_OPTIONS: ReadonlyArray<WorkspaceTypeOption> = [
  { key: "solo", label: "Solo agent", description: "One agent running their own lead desk", icon: Briefcase },
  { key: "team", label: "Team", description: "A rainmaker or lead with agents underneath", icon: Users },
  { key: "brokerage", label: "Brokerage", description: "Multi-agent operation with shared systems", icon: Building2 },
  { key: "other", label: "Other", description: "A real estate workflow inside Harwick's current scope", icon: Sparkles },
];

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
  { key: "showing request", label: "Showing", description: "Qualify, schedule, approve", icon: MapPin },
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
    workspaceType: null,
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

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070d0b] text-white">
      {/* Static atmospheric backdrop — single composed gradient, no animation.
       *  Premium feel comes from stillness, not motion. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: HARWICK_GLOW.base }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_30%,rgba(0,0,0,0.58)_84%)]"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-[520px] flex-col px-5 py-6">
        <header className="flex items-center">
          <button
            type="button"
            onClick={onBack ?? undefined}
            disabled={onBack === null}
            aria-label="Back"
            className={cn(
              "flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition",
              onBack === null ? "opacity-0 pointer-events-none" : "hover:bg-white/[0.08] hover:text-white",
            )}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
        </header>

        <div className="flex flex-1 items-center py-6">
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

        <StepDots current={currentIndex} total={SCENE_ORDER.length} />
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

function WorkspaceTypeVisual({ type }: { type: WorkspaceType | null }) {
  // Constellation art that morphs with the operator's pick. Borrows the
  // Bloc splash technique: stacked radial-gradient defs, glow + core pairs
  // per node, big soft halo behind. Springy node positions so morphing
  // between types looks like a constellation reforming.
  const positions = workspaceConstellation(type ?? "other");

  return (
    <div className="relative mx-auto aspect-[1.04] overflow-hidden rounded-[32px] border border-white/12 bg-[#06100c]">
      {/* Atmospheric backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 42%, rgba(184,211,197,0.35), transparent 58%),"
            + "radial-gradient(circle at 18% 88%, rgba(216,196,135,0.18), transparent 60%),"
            + "radial-gradient(circle at 88% 16%, rgba(168,148,210,0.16), transparent 55%)",
        }}
      />

      {/* Geometric grain — subtle film texture made of tiny dots */}
      <svg
        viewBox="0 0 320 320"
        className="absolute inset-0 size-full"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="harwick-node-sage" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#d6ebde" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#7ea696" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#3b5a4e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="harwick-node-gold" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f3e3b6" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#d8c487" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#7a6b3c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="harwick-node-plum" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e5d7f5" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#a48fc8" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#4d3e6a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="harwick-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(184,211,197,0.45)" />
            <stop offset="100%" stopColor="rgba(184,211,197,0)" />
          </radialGradient>
        </defs>

        {/* Central halo */}
        <circle cx="160" cy="160" r="140" fill="url(#harwick-halo)" opacity="0.55" />

        {/* Connecting lines between nodes — drawn first so nodes sit on top */}
        {positions.length > 1
          ? positions.map((pos, index) => {
              if (index === 0) return null;
              const head = positions[0]!;
              return (
                <motion.line
                  key={`line-${index}`}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 0.35 }}
                  transition={{ duration: 0.65, ease: "easeOut", delay: 0.05 * index }}
                  x1={head.x}
                  y1={head.y}
                  x2={pos.x}
                  y2={pos.y}
                  stroke="rgba(184,211,197,0.45)"
                  strokeWidth={1.1}
                  strokeDasharray="3 5"
                />
              );
            })
          : null}

        {/* The nodes themselves — glow + core stack per node */}
        {positions.map((pos, index) => (
          <motion.g
            key={`node-${index}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 22, delay: index * 0.04 }}
          >
            {/* Glow */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={pos.glow}
              fill={`url(#harwick-node-${pos.kind})`}
            />
            {/* Core */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={pos.core}
              fill={pos.kind === "sage" ? "#dceee4" : pos.kind === "gold" ? "#f3e3b6" : "#e5d7f5"}
              opacity={0.9}
            />
            {/* Hairline ring */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={pos.core + 4}
              fill="none"
              stroke={pos.kind === "sage" ? "rgba(220,238,228,0.4)" : pos.kind === "gold" ? "rgba(243,227,182,0.4)" : "rgba(229,215,245,0.4)"}
              strokeWidth={0.8}
            />
          </motion.g>
        ))}
      </svg>

      {/* Scale label sitting on the constellation */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md">
        {workspaceLabel(type ?? "other")}
      </div>
    </div>
  );
}

type ConstellationNode = {
  x: number;
  y: number;
  core: number;
  glow: number;
  kind: "sage" | "gold" | "plum";
};

function workspaceConstellation(type: WorkspaceType): ConstellationNode[] {
  if (type === "solo") {
    return [{ x: 160, y: 160, core: 14, glow: 92, kind: "gold" }];
  }
  if (type === "team") {
    return [
      { x: 160, y: 142, core: 12, glow: 78, kind: "gold" },
      { x: 92, y: 196, core: 8, glow: 52, kind: "sage" },
      { x: 230, y: 192, core: 8, glow: 52, kind: "sage" },
      { x: 200, y: 92, core: 7, glow: 48, kind: "sage" },
      { x: 116, y: 88, core: 7, glow: 48, kind: "sage" },
    ];
  }
  if (type === "brokerage") {
    return [
      { x: 160, y: 160, core: 14, glow: 88, kind: "gold" },
      { x: 76, y: 96, core: 9, glow: 56, kind: "sage" },
      { x: 240, y: 96, core: 9, glow: 56, kind: "plum" },
      { x: 220, y: 226, core: 9, glow: 56, kind: "sage" },
      { x: 100, y: 226, core: 9, glow: 56, kind: "plum" },
      { x: 60, y: 168, core: 5, glow: 36, kind: "sage" },
      { x: 260, y: 168, core: 5, glow: 36, kind: "plum" },
      { x: 162, y: 56, core: 5, glow: 36, kind: "sage" },
      { x: 162, y: 264, core: 5, glow: 36, kind: "plum" },
    ];
  }
  // other
  return [
    { x: 130, y: 130, core: 10, glow: 64, kind: "sage" },
    { x: 200, y: 138, core: 8, glow: 52, kind: "gold" },
    { x: 168, y: 200, core: 8, glow: 52, kind: "plum" },
    { x: 96, y: 198, core: 6, glow: 42, kind: "sage" },
  ];
}

function workspaceLabel(type: WorkspaceType): string {
  if (type === "solo") return "1 operator";
  if (type === "team") return "4–10 seats · 1 lead";
  if (type === "brokerage") return "multi-office · routed";
  return "custom shape";
}

// MarketMapVisual was a hand-drawn SVG placeholder. Replaced by the real
// Mapbox-backed <MarketMap /> component in ./market-map.tsx, which geocodes
// each area the operator types and drops a real pin. Kept as a function
// name so call-sites elsewhere don't need to change.
function MarketMapVisual({ areas }: { areas: string[] }) {
  return <MarketMap areas={areas} />;
}

function LeadTypeVisual({ selected }: { selected: string[] }) {
  // Artistic glyph composition that builds as the operator picks lead types.
  // Each pick lights up a hand-positioned phosphor glyph with a colored
  // halo. Empty state shows a faint outline of all glyphs so the operator
  // gets a preview of the canvas.
  return (
    <div className="relative mx-auto aspect-[1.04] overflow-hidden rounded-[32px] border border-white/12 bg-[#06100c]">
      {/* Atmospheric backdrop — sage core + warm corner accents */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 30% 30%, rgba(184,211,197,0.32), transparent 60%),"
            + "radial-gradient(circle at 78% 76%, rgba(216,196,135,0.22), transparent 58%),"
            + "radial-gradient(circle at 14% 88%, rgba(168,148,210,0.18), transparent 60%)",
        }}
      />

      {/* Concentric arcs — passive composition element, doesn't move */}
      <svg viewBox="0 0 320 320" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <radialGradient id="lead-canvas-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(184,211,197,0.16)" />
            <stop offset="100%" stopColor="rgba(184,211,197,0)" />
          </radialGradient>
        </defs>
        <circle cx="160" cy="160" r="120" fill="url(#lead-canvas-halo)" />
        <circle cx="160" cy="160" r="84" fill="none" stroke="rgba(184,211,197,0.12)" strokeWidth="0.6" />
        <circle cx="160" cy="160" r="124" fill="none" stroke="rgba(184,211,197,0.08)" strokeWidth="0.6" strokeDasharray="2 6" />
      </svg>

      {/* Glyphs positioned around the canvas */}
      <div className="absolute inset-0">
        {LEAD_GLYPH_POSITIONS.map((entry) => {
          const isActive = selected.includes(entry.key);
          const Icon = entry.icon;
          return (
            <motion.div
              key={entry.key}
              className="absolute flex items-center justify-center"
              style={{ left: entry.x, top: entry.y, width: entry.size, height: entry.size }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{
                scale: isActive ? 1 : 0.78,
                opacity: isActive ? 1 : 0.18,
                filter: isActive ? "blur(0px)" : "blur(0.4px)",
              }}
              transition={{ type: "spring", stiffness: 200, damping: 24 }}
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
                    : "rgba(255,255,255,0.02)",
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

      {/* Tiny count label */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md">
        {selected.length === 0 ? "pick what you handle" : `${selected.length} lead type${selected.length === 1 ? "" : "s"}`}
      </div>
    </div>
  );
}

type LeadGlyphEntry = {
  key: string;
  icon: PhosphorIcon;
  x: string;
  y: string;
  size: number;
  glow: string;
};

// Position glyphs around the canvas. Larger glyphs for high-frequency lead
// types (buyer/seller), smaller for niche (open house). All in % so they
// scale with the viewport.
const LEAD_GLYPH_POSITIONS: ReadonlyArray<LeadGlyphEntry> = [
  { key: "buyer", icon: PhosphorKey, x: "16%", y: "22%", size: 58, glow: "#b8d3c5" },
  { key: "seller", icon: PhosphorHouseLine, x: "62%", y: "18%", size: 62, glow: "#d8c487" },
  { key: "renter", icon: PhosphorDoor, x: "8%", y: "62%", size: 52, glow: "#a4c4d8" },
  { key: "investor", icon: PhosphorChartLineUp, x: "70%", y: "60%", size: 60, glow: "#c9b9e0" },
  { key: "new construction", icon: PhosphorHardHat, x: "42%", y: "72%", size: 50, glow: "#e0b8a4" },
  { key: "open house", icon: PhosphorCalendarHeart, x: "44%", y: "8%", size: 48, glow: "#b8d3c5" },
  { key: "showing request", icon: PhosphorMapPin, x: "30%", y: "44%", size: 46, glow: "#d8c487" },
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
  const active = LISTING_FOCUS_OPTIONS.filter((option) => selected.includes(option.key)).slice(0, 3);
  const display = active.length > 0 ? active : LISTING_FOCUS_OPTIONS.slice(0, 3);
  return (
    <div className="relative mx-auto aspect-[1.04] rounded-[38px] border border-white/10 bg-white/[0.055] p-5">
      <div className="absolute inset-10 rounded-full bg-[#b8d3c5]/14 blur-3xl" />
      <div className="relative flex h-full flex-col justify-center gap-3">
        {display.map((option, index) => {
          const Icon = option.icon;
          return (
            <motion.div
              key={option.key}
              className="flex items-center gap-3 rounded-[22px] border border-white/10 bg-[#07100d]/42 p-3"
              animate={{ x: index === 1 ? [0, 7, 0] : [0, -5, 0] }}
              transition={{ duration: 6 + index, repeat: Infinity, ease: "easeInOut" }}
            >
              <span className="flex size-11 items-center justify-center rounded-2xl bg-[#b8d3c5]/14">
                <Icon className="size-5 text-[#b8d3c5]" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-white">{option.label}</span>
                <span className="block text-[11px] text-white/45">{option.description}</span>
              </span>
            </motion.div>
          );
        })}
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

function ChannelVisual({ channels }: { channels: Record<OnboardingChannel, ChannelMode> }) {
  // Signal-tower composition. Each channel becomes a vertical "tower"
  // standing on the floor of the canvas. Mode controls intensity: off →
  // ghost outline, draft → thin column, approve → fuller column, auto →
  // full + a halo arc spreading from the tower's top.
  return (
    <div className="relative mx-auto aspect-[1.04] overflow-hidden rounded-[32px] border border-white/12 bg-[#06100c]">
      {/* Atmospheric backdrop */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 0%, rgba(184,211,197,0.3), transparent 55%),"
            + "radial-gradient(circle at 50% 100%, rgba(7,17,13,0.85), transparent 60%)",
        }}
      />

      <svg viewBox="0 0 320 320" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <linearGradient id="harwick-tower-sage" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#dceee4" stopOpacity="1" />
            <stop offset="100%" stopColor="#3b5a4e" stopOpacity="0.05" />
          </linearGradient>
          <linearGradient id="harwick-tower-gold" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f3e3b6" stopOpacity="1" />
            <stop offset="100%" stopColor="#7a6b3c" stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id="harwick-signal-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(216,196,135,0.6)" />
            <stop offset="60%" stopColor="rgba(216,196,135,0.1)" />
            <stop offset="100%" stopColor="rgba(216,196,135,0)" />
          </radialGradient>
          <radialGradient id="harwick-floor-glow" cx="50%" cy="100%" r="60%">
            <stop offset="0%" stopColor="rgba(184,211,197,0.5)" />
            <stop offset="100%" stopColor="rgba(184,211,197,0)" />
          </radialGradient>
        </defs>

        {/* Floor glow */}
        <rect x="0" y="240" width="320" height="80" fill="url(#harwick-floor-glow)" />

        {/* Horizon line */}
        <line x1="20" y1="248" x2="300" y2="248" stroke="rgba(184,211,197,0.18)" strokeWidth="0.6" strokeDasharray="2 5" />

        {/* Render each channel as a tower along the floor */}
        {CHANNEL_OPTIONS.map((option, index) => {
          const mode = channels[option.key];
          const x = 38 + index * 60; // 5 channels spread evenly across 320 viewBox
          return <ChannelTower key={option.key} centerX={x} mode={mode} />;
        })}
      </svg>

      {/* Icons sitting atop each tower */}
      <div className="absolute inset-0">
        {CHANNEL_OPTIONS.map((option, index) => {
          const mode = channels[option.key];
          const active = mode !== "off";
          const Icon = option.icon;
          const xPercent = ((38 + index * 60) / 320) * 100;
          const yPercent = active ? (mode === "auto_send" ? 18 : mode === "approval_first" ? 28 : 38) : 60;
          return (
            <motion.div
              key={option.key}
              className="absolute flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[10px] border backdrop-blur-md"
              style={{
                left: `${xPercent}%`,
                top: `${yPercent}%`,
                background: active
                  ? mode === "auto_send"
                    ? "rgba(216,196,135,0.22)"
                    : "rgba(184,211,197,0.18)"
                  : "rgba(255,255,255,0.04)",
                borderColor: active
                  ? mode === "auto_send"
                    ? "rgba(216,196,135,0.55)"
                    : "rgba(184,211,197,0.4)"
                  : "rgba(255,255,255,0.1)",
                boxShadow: active
                  ? `0 14px 30px -12px ${mode === "auto_send" ? "rgba(216,196,135,0.55)" : "rgba(184,211,197,0.5)"}`
                  : "none",
              }}
              animate={{
                left: `${xPercent}%`,
                top: `${yPercent}%`,
                scale: active ? 1 : 0.85,
                opacity: active ? 1 : 0.35,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 24 }}
            >
              <Icon
                className="size-4"
                style={{
                  color: active
                    ? mode === "auto_send"
                      ? "#f3e3b6"
                      : "#dceee4"
                    : "rgba(255,255,255,0.4)",
                }}
              />
            </motion.div>
          );
        })}
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-white/65 backdrop-blur-md">
        {channelLabel(channels)}
      </div>
    </div>
  );
}

function ChannelTower({ centerX, mode }: { centerX: number; mode: ChannelMode }) {
  const active = mode !== "off";
  const baseY = 248;
  // Tower height by mode
  const topY = mode === "auto_send" ? 60 : mode === "approval_first" ? 92 : mode === "suggest_only" ? 128 : 200;
  const towerWidth = 8;
  const isGold = mode === "auto_send";
  const fillId = isGold ? "harwick-tower-gold" : "harwick-tower-sage";

  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Auto-mode halo */}
      {mode === "auto_send" ? (
        <circle cx={centerX} cy={topY} r="44" fill="url(#harwick-signal-halo)" opacity="0.85" />
      ) : null}

      {/* Tower column */}
      <motion.rect
        x={centerX - towerWidth / 2}
        width={towerWidth}
        rx="3"
        fill={active ? `url(#${fillId})` : "rgba(255,255,255,0.08)"}
        stroke={active ? (isGold ? "rgba(243,227,182,0.5)" : "rgba(220,238,228,0.45)") : "rgba(255,255,255,0.08)"}
        strokeWidth="0.6"
        initial={{ y: baseY, height: 0 }}
        animate={{ y: topY, height: baseY - topY }}
        transition={{ type: "spring", stiffness: 140, damping: 22 }}
      />

      {/* Approve mode — single mid arc */}
      {mode === "approval_first" ? (
        <motion.circle
          cx={centerX}
          cy={topY}
          r="18"
          fill="none"
          stroke="rgba(220,238,228,0.45)"
          strokeWidth="0.8"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.8 }}
          transition={{ duration: 0.6 }}
        />
      ) : null}

      {/* Base disc */}
      {active ? (
        <ellipse
          cx={centerX}
          cy={baseY + 2}
          rx={14}
          ry={3}
          fill={isGold ? "rgba(243,227,182,0.4)" : "rgba(220,238,228,0.35)"}
        />
      ) : (
        <ellipse cx={centerX} cy={baseY + 2} rx={10} ry={2.2} fill="rgba(255,255,255,0.08)" />
      )}
    </motion.g>
  );
}

function channelLabel(channels: Record<OnboardingChannel, ChannelMode>): string {
  const active = CHANNEL_OPTIONS.filter((option) => channels[option.key] !== "off").length;
  const auto = (Object.values(channels) as ChannelMode[]).filter((mode) => mode === "auto_send").length;
  if (active === 0) return "no channels on yet";
  if (auto > 0) return `${active} on · ${auto} on auto`;
  return `${active} of ${CHANNEL_OPTIONS.length} channels`;
}

function AutonomyVisual({ autonomy }: { autonomy: SetupDraft["autonomy"] }) {
  const rotation = autonomy === "draft" ? -48 : autonomy === "approval" ? 0 : 48;
  return (
    <div className="relative aspect-square rounded-[38px] border border-white/10 bg-white/[0.055] p-7">
      <div className="absolute inset-12 rounded-full border border-white/10" />
      <div className="absolute inset-20 rounded-full bg-[#b8d3c5]/12 blur-2xl" />
      <motion.div
        className="absolute left-1/2 top-1/2 h-32 w-2 origin-bottom rounded-full bg-[#d8c487]"
        animate={{ rotate: rotation }}
        transition={{ type: "spring", stiffness: 120, damping: 16 }}
        style={{ translateX: "-50%", translateY: "-100%" }}
      />
      <div className="absolute inset-x-8 bottom-9 flex justify-between text-[11px] uppercase tracking-[0.14em] text-white/40">
        <span>draft</span>
        <span>approve</span>
        <span>auto</span>
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

function WorkspaceTypeScene({
  value,
  onChange,
  onNext,
}: {
  value: WorkspaceType | null;
  onChange: (value: WorkspaceType) => void;
  onNext: () => void;
}) {
  return (
    <SceneFrame
      eyebrow="workspace"
      title="What kind of operation is this?"
      description="Harwick changes its posture based on whether it is serving one agent, a team, or a brokerage."
      visual={<WorkspaceTypeVisual type={value} />}
      footer={
        <>
          <div className="grid grid-cols-2 gap-2">
            {WORKSPACE_TYPE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = value === option.key;
              return (
                <GlassPanel key={option.key} selected={selected} onClick={() => onChange(option.key)} className="min-h-[132px]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex size-10 items-center justify-center rounded-2xl bg-white/[0.06]">
                      <Icon className="size-5 text-[#b8d3c5]" />
                    </span>
                    <SmallCheck selected={selected} />
                  </div>
                  <p className="mt-4 text-[13px] font-semibold text-white">{option.label}</p>
                  <p className="mt-1 text-[11px] leading-4 text-white/45">{option.description}</p>
                </GlassPanel>
              );
            })}
          </div>
          <PrimaryCta disabled={value === null} onClick={onNext}>
            Continue
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
}

function PrimaryAreasScene({
  areas,
  areaDraft,
  onDraftChange,
  onAddArea,
  onRemoveArea,
  onNext,
}: {
  areas: string[];
  areaDraft: string;
  onDraftChange: (value: string) => void;
  onAddArea: () => void;
  onRemoveArea: (value: string) => void;
  onNext: () => void;
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      onAddArea();
    }
  }

  return (
    <SceneFrame
      eyebrow="market"
      title="Where should Harwick pay attention?"
      description="Add the cities, neighborhoods, or communities where the best leads should route first."
      visual={<MarketMapVisual areas={areas} />}
      footer={
        <>
          <div className="rounded-[24px] border border-white/10 bg-white/[0.055] p-3">
            <Label className="mb-2 block text-[10px] uppercase tracking-[0.16em] text-white/38" htmlFor="area-input">
              Primary areas
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {areas.map((area) => (
                <span key={area} className="inline-flex items-center gap-1 rounded-full bg-[#b8d3c5]/15 px-2.5 py-1 text-[12px] font-medium text-white">
                  {area}
                  <button type="button" onClick={() => onRemoveArea(area)} aria-label={`Remove ${area}`}>
                    <X className="size-3 text-white/55" />
                  </button>
                </span>
              ))}
              <DarkInlineInput
                id="area-input"
                value={areaDraft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onAddArea}
                placeholder={areas.length === 0 ? "Katy, Sugar Land..." : "Add another"}
              />
            </div>
          </div>
          <PrimaryCta disabled={areas.length === 0} onClick={onNext}>
            Lock market
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
  examples,
  submitting,
  error,
  onUpdate,
  onAdd,
  onRemove,
  onSave,
}: {
  examples: string[];
  submitting: boolean;
  error: string | null;
  onUpdate: (index: number, value: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onSave: () => void;
}) {
  const usableCount = examples.map((entry) => entry.trim()).filter((entry) => entry.length >= 8).length;
  return (
    <SceneFrame
      eyebrow="samples"
      title="Show Harwick a real reply."
      description="Paste one message you would actually send. Add more if you want a tighter voice match."
      visual={<VoiceVisual />}
      footer={
        <>
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
          <p className="text-center text-[11px] text-white/38">{usableCount} usable sample{usableCount === 1 ? "" : "s"}</p>
          {error !== null ? <ErrorBox>{error}</ErrorBox> : null}
          <PrimaryCta disabled={usableCount === 0} loading={submitting} onClick={onSave}>
            Save voice samples
            <ArrowRight className="size-4" aria-hidden="true" />
          </PrimaryCta>
        </>
      }
    />
  );
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
              { key: "safe_auto", label: "Safe auto", icon: Gauge },
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
      eyebrow="activate"
      title="This is the live launch path."
      description="Harwick keeps these as operational cards after setup, not another onboarding form."
      visual={<ActivationVisual planTier={planTier} operatorRole={operatorRole} />}
      footer={
        <>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-white">
              <Bell className="size-4 text-[#b8d3c5]" />
              Home and Settings should carry this checklist forward.
            </div>
            <p className="mt-1 text-[11.5px] leading-5 text-white/45">
              Next pass should wire each card to its exact Settings or Integrations route.
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
  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.assign("/home");
    }, 2200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SceneFrame
      eyebrow="ready"
      title={`${workspaceName} has a Harwick setup.`}
      description="Opening the workspace. The next work should be checklist wiring and provider connection polish."
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

  function goBack() {
    setScene((current) => previousScene(current));
  }

  function addArea() {
    const trimmed = draft.areaDraft.trim();
    if (trimmed.length === 0 || draft.areas.includes(trimmed) || draft.areas.length >= 8) return;
    setDraft((current) => ({ ...current, areas: [...current.areas, trimmed], areaDraft: "" }));
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
    <Shell scene={scene} onBack={scene === "welcome" ? null : goBack}>
      {scene === "welcome" ? (
        <WelcomeScene onNext={() => setScene("workspace_type")} />
      ) : null}

      {scene === "workspace_type" ? (
        <WorkspaceTypeScene
          value={draft.workspaceType}
          onChange={(workspaceType) => setDraft((current) => ({ ...current, workspaceType }))}
          onNext={() => setScene("primary_areas")}
        />
      ) : null}

      {scene === "primary_areas" ? (
        <PrimaryAreasScene
          areas={draft.areas}
          areaDraft={draft.areaDraft}
          onDraftChange={(areaDraft) => setDraft((current) => ({ ...current, areaDraft }))}
          onAddArea={addArea}
          onRemoveArea={(area) => setDraft((current) => ({ ...current, areas: current.areas.filter((entry) => entry !== area) }))}
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
          examples={draft.replyExamples}
          submitting={replySaving}
          error={replyError}
          onUpdate={(index, value) => setDraft((current) => ({
            ...current,
            replyExamples: current.replyExamples.map((entry, position) => (position === index ? value : entry)),
          }))}
          onAdd={() => setDraft((current) => ({ ...current, replyExamples: [...current.replyExamples, ""] }))}
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
