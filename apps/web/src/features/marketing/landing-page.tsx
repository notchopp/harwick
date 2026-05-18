"use client";

import { motion } from "motion/react";
import {
  ArrowRight,
  Check,
  MessageCircle,
  MessageSquare,
  Phone,
  Voicemail,
} from "lucide-react";
import { Fragment, useEffect, useState, type ReactNode } from "react";

import { FacebookGlyph, InstagramGlyph } from "../../components/harwick-icons";

import { cn } from "../../lib/utils";
import { HeroAnimatedShowcase } from "./hero-animated-showcase";
import { getPlanMaterial } from "./plan-card-material";

/**
 * Harwick marketing site. Static, no JS animation. The hero uses the same
 * glass-over-photo pattern from /listings — gradient-painted "photo" of a
 * house with a backdrop-blur info card overlaid at the bottom. Every other
 * surface uses gradient-tinted panels so the page reads like a real product,
 * not a feature grid in dark mode.
 *
 * Colors are committed hex so the page renders the same regardless of the
 * app's current theme state.
 */

type LandingProps = { isAuthenticated: boolean };
const PRIMARY_HREF = "/signup";

// =====================================================================
// Tokens
// =====================================================================

const C = {
  bg: "#0a0b0b",
  panel: "#101212",
  panelHi: "#161818",
  line: "rgba(255,255,255,0.08)",
  lineSoft: "rgba(255,255,255,0.05)",
  text: "#ffffff",
  textMid: "rgba(255,255,255,0.72)",
  textLow: "rgba(255,255,255,0.5)",
  textFaint: "rgba(255,255,255,0.35)",
  sage: "#9ab5aa",
  sageBright: "#b6d1c5",
  sageSoft: "rgba(154,181,170,0.16)",
  sageRing: "rgba(154,181,170,0.38)",
  clay: "#c98b5a",
  claySoft: "rgba(201,139,90,0.16)",
  oxblood: "#a44e5a",
  oxbloodSoft: "rgba(164,78,90,0.16)",
  ink: "#0c1410",
} as const;

// =====================================================================
// Logo
// =====================================================================

function HarwickLogo({ size = 22 }: { size?: number }) {
  // Brand wordmark / glyph from /public. The PNG is 677×369 — we render
  // it width-auto at the requested height so the aspect stays correct.
  return (
    <img
      src="/harwick-gemini-logo.png"
      alt="Harwick"
      style={{ height: size, width: "auto", display: "block" }}
      className="select-none"
      draggable={false}
    />
  );
}

// =====================================================================
// Nav — single transparent overlay header that floats over the hero photo.
// As the page scrolls past the hero, the page's dark body bg shows through
// the transparent header naturally — still readable thanks to the
// text-shadows on the wordmark + nav links.
// =====================================================================

function TopBar({ isAuthenticated }: LandingProps) {
  // Scroll-aware morph. At top: floating rounded pill, max-width 1180,
  // margin-top 12px. After scroll: flush full-width with solid blur bg.
  // Coya-style transition.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const textShadow = scrolled ? undefined : "0 1px 8px rgba(0,0,0,0.55)";
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div
        className="mx-auto flex h-14 items-center justify-between px-6 transition-all duration-300"
        style={{
          marginTop: scrolled ? 0 : 12,
          marginLeft: scrolled ? 0 : "auto",
          marginRight: scrolled ? 0 : "auto",
          maxWidth: scrolled ? "100%" : 1180,
          background: scrolled ? "rgba(10,11,11,0.88)" : "rgba(10,11,11,0.42)",
          borderRadius: scrolled ? 0 : 14,
          borderBottom: `1px solid ${scrolled ? C.line : "transparent"}`,
          border: scrolled ? undefined : `1px solid rgba(255,255,255,0.08)`,
          backdropFilter: "blur(18px)",
          WebkitBackdropFilter: "blur(18px)",
        }}
      >
        <a href="/" aria-label="Harwick home" className="flex items-center gap-2">
          <HarwickLogo size={22} />
          <span
            className="text-[15px] font-semibold tracking-[-0.01em]"
            style={{ color: C.text, textShadow }}
          >
            Harwick
          </span>
        </a>
        <nav
          className="hidden items-center gap-7 text-[13px] font-medium sm:flex"
          style={{ color: "rgba(255,255,255,0.82)", textShadow }}
        >
          <a className="transition hover:text-white" href="#how-it-works">how it works</a>
          <a className="transition hover:text-white" href="#capabilities">capabilities</a>
          <a className="transition hover:text-white" href="#pricing">pricing</a>
          <a className="transition hover:text-white" href="#access">get access</a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            className="hidden text-[13px] font-medium hover:text-white sm:inline-flex"
            style={{ color: "rgba(255,255,255,0.82)", textShadow }}
            href={isAuthenticated ? "/home" : "/login"}
          >
            {isAuthenticated ? "dashboard" : "sign in"}
          </a>
          <PrimaryCta href={isAuthenticated ? "/home" : PRIMARY_HREF} small>
            {isAuthenticated ? "open harwick" : "create account"}
          </PrimaryCta>
        </div>
      </div>
    </header>
  );
}

function PrimaryCta({ href, children, small }: { href: string; children: ReactNode; small?: boolean }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center justify-center rounded-[8px] font-semibold transition",
        small ? "h-9 px-3.5 text-[13px]" : "h-11 px-5 text-[14px]",
      )}
      style={{ background: C.sage, color: C.ink, boxShadow: `0 1px 0 rgba(255,255,255,0.18) inset, 0 12px 30px -10px ${C.sageRing}` }}
    >
      {children}
      <ArrowRight className={cn(small ? "ml-1.5 size-3.5" : "ml-2 size-4")} aria-hidden="true" />
    </a>
  );
}

function SecondaryCta({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex h-10 items-center justify-center rounded-[8px] px-4 text-[13.5px] font-medium transition hover:bg-white/[0.06]"
      style={{ color: C.text, border: `1px solid ${C.line}`, background: "rgba(255,255,255,0.03)" }}
    >
      {children}
    </a>
  );
}

// =====================================================================
// Hero — full-bleed real photo, animated showcase overlaid.
//
// Photo lives at apps/web/public/marketing/hero-house.jpg
// (Unsplash 1568605114967, 2400x1600 JPG). Swap any time — the path is
// the only thing the component references.
//
// No headline, no copy, no CTAs in the hero. The animation does the
// talking. CTAs live in the early-access section below.
// =====================================================================

const HERO_BG_URL = "/marketing/hero-house.jpg";

function HeroHeadline() {
  return (
    <div className="mx-auto max-w-[820px] text-center">
      <h1
        className="text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[60px]"
        style={{
          color: C.text,
          fontFamily: "var(--font-display)",
          textShadow: "0 2px 18px rgba(0,0,0,0.6)",
        }}
      >
        Every buyer message. <span style={{ color: C.sage }}>One inbox.</span>
      </h1>
      <div
        className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11.5px] uppercase"
        style={{
          color: "rgba(255,255,255,0.62)",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.08em",
          textShadow: "0 1px 8px rgba(0,0,0,0.55)",
        }}
      >
        <span>onboarded in a day</span>
        <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.28)" }}>·</span>
        <span>no contracts</span>
        <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.28)" }}>·</span>
        <span>brokerage controlled</span>
      </div>
    </div>
  );
}

function Hero(props: LandingProps) {
  void props.isAuthenticated;

  return (
    <section className="relative isolate w-full overflow-hidden" style={{ minHeight: "94vh", background: "#0a0807" }}>
      {/* Real photo background — full-bleed. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${HERO_BG_URL})` }}
      />

      {/* Subtle global wash + bottom darken so glass cards have something to
          float over without fighting the photo. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,8,7,0.36) 0%, rgba(10,8,7,0.18) 30%, rgba(10,8,7,0.48) 72%, rgba(10,8,7,0.96) 100%)",
        }}
      />

      {/* Center hero line + showcase. */}
      <div className="relative z-10 mx-auto flex h-full min-h-[94vh] w-full max-w-[1180px] flex-col items-stretch justify-center gap-10 px-6 pt-28 pb-16 sm:gap-14 sm:pt-32">
        <HeroHeadline />
        <HeroAnimatedShowcase />
      </div>
    </section>
  );
}


// =====================================================================
// Section helpers (shared across the lower sections)
// =====================================================================

function SectionEyebrow({ children }: { children: ReactNode }) {
  return (
    <p
      className="text-[11px] font-semibold uppercase"
      style={{
        color: C.sage,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.16em",
      }}
    >
      {children}
    </p>
  );
}

function SectionHeadline({ children }: { children: ReactNode }) {
  return (
    <h2
      className="mt-3 text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[48px]"
      style={{ color: C.text, fontFamily: "var(--font-display)" }}
    >
      {children}
    </h2>
  );
}

// Coya-style editorial divider between sections. Thin dotted line with a
// small sage dot in the middle. Gives the page rhythm so sections don't
// just butt up against each other with hard borders.
function SectionBreak() {
  return (
    <div className="px-6" aria-hidden="true">
      <div className="mx-auto max-w-[1180px] py-3 sm:py-4">
        <div className="flex items-center gap-4 sm:gap-6">
          <div
            className="h-px flex-1"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${C.line} 30%, ${C.line} 100%)`,
            }}
          />
          <div
            className="size-2 shrink-0 rounded-full"
            style={{
              background: C.sage,
              boxShadow: `0 0 0 6px ${C.sageSoft}`,
            }}
          />
          <div
            className="h-px flex-1"
            style={{
              background: `linear-gradient(90deg, ${C.line} 0%, ${C.line} 70%, transparent 100%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// How it works — 3 stages with 2×2 mini-tile grids, plus animated
// connector pills between stages.
//
// Pattern inspired by the Frontdesk site:
//   [Stage 01 panel] → [animated connector pill] → [Stage 02 panel]
//   → [animated connector pill] → [Stage 03 panel] → [loopback arc]
//
// The connectors have sage dots that physically flow along curved SVG
// paths from one stage into the next via CSS offset-path.
// =====================================================================

type StageTile = {
  name: string;
  sub: string;
  mock: ReactNode;
};

type Stage = {
  n: string;
  title: string;
  sub: string;
  body: string;
  tiles: ReadonlyArray<StageTile>;
};

const STAGES: ReadonlyArray<Stage> = [
  {
    n: "01",
    title: "Capture",
    sub: "Every channel. One stream.",
    body: "Buyers reach your brokerage through whatever channel they want. Harwick is listening to all of them and pulls everything into one inbox the moment it arrives.",
    tiles: [
      { name: "Instagram DMs", sub: "Direct messages on every listing post", mock: <MockIgDm /> },
      { name: "Facebook & Messenger", sub: "Comments and DMs on your Page", mock: <MockFbComment /> },
      { name: "Phone & voicemail", sub: "Transcribed in seconds via Retell", mock: <MockVoicemail /> },
      { name: "SMS", sub: "Texts to your Twilio number", mock: <MockSms /> },
    ],
  },
  {
    n: "02",
    title: "Understand",
    sub: "Read. Qualify. Draft.",
    body: "Before drafting anything, Harwick reads your past closed deals, the listing in question, the way your brokerage talks, and which agent covers what area. Then it writes a reply.",
    tiles: [
      { name: "Workspace memory", sub: "Past leads, your voice, area knowledge", mock: <MockMemory /> },
      { name: "Listing facts", sub: "Address, price, HOA, schools, photos", mock: <MockListingFacts /> },
      { name: "Reply draft", sub: "Personalized, in your brokerage's voice", mock: <MockDraft /> },
      { name: "Routing decision", sub: "Right agent based on real signals", mock: <MockRouting /> },
    ],
  },
  {
    n: "03",
    title: "Send & sync",
    sub: "Approve once. Done everywhere.",
    body: "You tap approve. The reply sends inside Meta's window. The tour books on the right agent's calendar. The lead lands in Follow Up Boss. Every action gets logged.",
    tiles: [
      { name: "Approval queue", sub: "One tap to send. Edit or dismiss anytime", mock: <MockApprove /> },
      { name: "Calendar booking", sub: "Books against the agent's real calendar", mock: <MockCalendar /> },
      { name: "CRM sync", sub: "Follow Up Boss today. More coming", mock: <MockCrmSync /> },
      { name: "Audit log", sub: "Who approved what, when, why", mock: <MockAuditLog /> },
    ],
  },
];

const CONNECTOR_LABELS: ReadonlyArray<{ pill: string; sub: string } | null> = [
  { pill: "Inbound captured", sub: "Comments · DMs · Calls · SMS" },
  { pill: "Qualified & drafted", sub: "Scored · Routed · Drafted" },
  null, // last stage has no forward connector
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ background: C.bg }} className="py-28">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="mx-auto max-w-[700px] text-center">
          <SectionEyebrow>How it works</SectionEyebrow>
          <SectionHeadline>Three stages. Every channel.</SectionHeadline>
          <p className="mx-auto mt-5 max-w-[560px] text-[16px] leading-7" style={{ color: C.textMid }}>
            What happens between a buyer DMing your Instagram post and a tour landing on your agent's calendar.
          </p>
        </div>

        <div className="mt-16 flex flex-col">
          {STAGES.map((stage, i) => (
            <StageWithConnector key={stage.n} index={i} stage={stage} />
          ))}
          <LoopbackArc />
        </div>
      </div>
    </section>
  );
}

function StageWithConnector({ index, stage }: { index: number; stage: Stage }) {
  const connector = CONNECTOR_LABELS[index] ?? null;
  return (
    <Fragment>
      <StagePanel stage={stage} />
      {connector === null ? null : (
        <AnimatedConnector
          label={connector.pill}
          sub={connector.sub}
        />
      )}
    </Fragment>
  );
}

// ---------------------------------------------------------------------
// Stage panel — number + title + body on left, 2x2 mini-tiles on right
// ---------------------------------------------------------------------

function StagePanel({ stage }: { stage: Stage }) {
  return (
    <div
      className="overflow-hidden rounded-[24px]"
      style={{
        background: `linear-gradient(180deg, ${C.panelHi} 0%, ${C.panel} 100%)`,
        border: `1px solid ${C.line}`,
        boxShadow: "0 30px 60px -30px rgba(0,0,0,0.6)",
      }}
    >
      <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-12">
        <div>
          <div className="flex items-baseline gap-4">
            <span
              className="text-[44px] font-semibold leading-none tracking-[-0.025em]"
              style={{ color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-display)", fontVariantNumeric: "tabular-nums" }}
            >
              {stage.n}
            </span>
            <h3
              className="text-[26px] font-semibold leading-none tracking-[-0.02em] sm:text-[32px]"
              style={{ color: C.text, fontFamily: "var(--font-display)" }}
            >
              {stage.title}
            </h3>
          </div>
          <p
            className="mt-3 text-[13px] font-semibold"
            style={{ color: C.sage, fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}
          >
            {stage.sub}
          </p>
          <p className="mt-4 max-w-[360px] text-[14px] leading-7" style={{ color: C.textMid }}>
            {stage.body}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stage.tiles.map((tile) => (
            <MiniTile key={tile.name} tile={tile} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniTile({ tile }: { tile: StageTile }) {
  return (
    <div
      className="overflow-hidden rounded-[14px] p-3"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        className="flex h-[80px] items-center justify-center overflow-hidden rounded-[10px] px-3"
        style={{
          background: "rgba(0,0,0,0.22)",
          border: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {tile.mock}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-semibold" style={{ color: C.text }}>
              {tile.name}
            </span>
            <ArrowRight className="size-3 shrink-0" aria-hidden="true" style={{ color: C.textFaint, transform: "rotate(-45deg)" }} />
          </div>
          <div className="mt-0.5 text-[11.5px] leading-5" style={{ color: C.textLow }}>
            {tile.sub}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Tile mocks — tiny suggestive previews of each feature
// ---------------------------------------------------------------------

function SkelLine({ width = "100%", opacity = 0.18 }: { width?: number | string; opacity?: number }) {
  return (
    <span
      className="block rounded-full"
      style={{ width, height: 3, background: `rgba(255,255,255,${opacity})` }}
      aria-hidden="true"
    />
  );
}

function MockIgDm() {
  return (
    <div className="flex w-full items-end gap-2">
      <div className="flex size-5 shrink-0 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg,#f09433,#dc2743,#bc1888)" }}>
        <InstagramGlyph className="size-3" aria-hidden="true" />
      </div>
      <div className="flex-1 space-y-1.5 rounded-[10px] rounded-bl-[3px] px-2.5 py-2" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <SkelLine width="80%" opacity={0.28} />
        <SkelLine width="55%" opacity={0.2} />
      </div>
    </div>
  );
}

function MockFbComment() {
  return (
    <div className="flex w-full items-start gap-2">
      <div className="size-5 shrink-0 rounded-full" style={{ background: "linear-gradient(135deg,#1877f2,#0866ff)" }} />
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="block h-2 w-12 rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
          <span className="block h-1.5 w-6 rounded-full" style={{ background: "rgba(255,255,255,0.12)" }} />
        </div>
        <SkelLine width="90%" opacity={0.22} />
        <SkelLine width="45%" opacity={0.18} />
      </div>
    </div>
  );
}

function MockVoicemail() {
  return (
    <div className="flex w-full items-center gap-2.5">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-[7px]" style={{ background: "linear-gradient(135deg,#e3a067,#c98b5a)", color: "#1a0e05" }}>
        <Voicemail className="size-3.5" aria-hidden="true" />
      </div>
      <div className="flex flex-1 items-end gap-[3px]">
        {[8, 16, 22, 14, 26, 18, 10, 20, 14, 24, 11, 17].map((h, i) => (
          <span
            key={i}
            className="block w-[3px] rounded-sm"
            style={{
              height: h,
              background: `rgba(227,160,103,${0.4 + (i % 3) * 0.18})`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MockSms() {
  return (
    <div className="flex w-full flex-col items-end gap-1.5">
      <div className="max-w-[70%] rounded-[10px] rounded-br-[3px] px-2.5 py-1.5" style={{ background: "linear-gradient(180deg,#7bcf85,#3aa44a)" }}>
        <span className="block h-1.5 w-16 rounded-full" style={{ background: "rgba(10,30,12,0.55)" }} />
      </div>
      <div className="max-w-[60%] self-start rounded-[10px] rounded-bl-[3px] px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.06)" }}>
        <span className="block h-1.5 w-10 rounded-full" style={{ background: "rgba(255,255,255,0.32)" }} />
      </div>
    </div>
  );
}

function MockMemory() {
  const chips = ["247 leads", "4126 maple", "Bellaire", "your voice"];
  return (
    <div className="flex w-full flex-wrap items-center gap-1.5">
      {chips.map((label) => (
        <span
          key={label}
          className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9.5px] font-semibold uppercase"
          style={{
            background: C.sageSoft,
            borderColor: C.sageRing,
            color: C.sage,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
          }}
        >
          <Check className="size-2" aria-hidden="true" />
          {label}
        </span>
      ))}
    </div>
  );
}

function MockListingFacts() {
  return (
    <div className="flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5" style={{ background: "rgba(243,238,229,0.92)", color: "#1a1a1a" }}>
      <div
        className="size-9 shrink-0 rounded-[4px]"
        style={{
          background:
            "linear-gradient(180deg, #ed8243 0%, #2b1a10 100%)",
        }}
      />
      <div className="min-w-0 flex-1">
        <span className="block h-1.5 w-3/4 rounded-full" style={{ background: "rgba(26,26,26,0.62)" }} />
        <span className="mt-1 block h-1 w-1/2 rounded-full" style={{ background: "rgba(26,26,26,0.32)" }} />
        <span className="mt-1.5 block h-2 w-12 rounded-full" style={{ background: "rgba(26,26,26,0.78)" }} />
      </div>
    </div>
  );
}

function MockDraft() {
  return (
    <div className="w-full space-y-1.5 rounded-[10px] p-2.5" style={{ background: "rgba(154,181,170,0.12)", border: `1px solid ${C.sageRing}` }}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex size-3.5 items-center justify-center rounded-[3px]" style={{ background: "linear-gradient(135deg,#9ab5aa 0%,#60786d 100%)", color: "#0c1410", fontSize: 7, fontWeight: 800 }}>H</span>
        <span className="text-[8.5px] font-semibold uppercase" style={{ color: C.sage, fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>draft</span>
      </div>
      <SkelLine width="95%" opacity={0.34} />
      <SkelLine width="78%" opacity={0.28} />
      <SkelLine width="48%" opacity={0.22} />
    </div>
  );
}

function MockRouting() {
  return (
    <div className="flex w-full items-center gap-2">
      <div className="size-7 shrink-0 rounded-full text-center text-[10px] font-bold leading-7" style={{ background: "#7ba6ff", color: "#0c1410" }}>
        MC
      </div>
      <ArrowRight className="size-3 shrink-0" aria-hidden="true" style={{ color: C.textFaint }} />
      <div className="size-7 shrink-0 rounded-full text-center text-[10px] font-bold leading-7" style={{ background: C.sage, color: C.ink }}>
        SK
      </div>
      <span
        className="ml-1.5 truncate rounded-full border px-1.5 py-0.5 text-[9px] uppercase"
        style={{
          background: C.sageSoft,
          borderColor: C.sageRing,
          color: C.sage,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.06em",
        }}
      >
        covers bellaire
      </span>
    </div>
  );
}

function MockApprove() {
  return (
    <div className="w-full space-y-1.5">
      <SkelLine width="78%" opacity={0.22} />
      <SkelLine width="52%" opacity={0.18} />
      <div className="mt-2 flex gap-1.5">
        <span
          className="inline-flex h-6 flex-1 items-center justify-center gap-1 rounded-[6px] text-[10px] font-semibold"
          style={{ background: "linear-gradient(180deg,#b6d1c5,#8aa89a)", color: "#0c1410" }}
        >
          <Check className="size-2.5" aria-hidden="true" /> Approve
        </span>
        <span
          className="inline-flex h-6 w-12 items-center justify-center rounded-[6px] text-[10px]"
          style={{ background: "rgba(255,255,255,0.05)", color: C.textMid, border: "1px solid rgba(255,255,255,0.08)" }}
        >
          Edit
        </span>
      </div>
    </div>
  );
}

function MockCalendar() {
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const highlight = 5; // sat
  return (
    <div className="grid w-full grid-cols-7 gap-[3px]">
      {days.map((day, i) => (
        <div key={day} className="flex flex-col items-center gap-0.5">
          <span className="text-[7px] uppercase" style={{ color: C.textFaint, fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}>
            {day}
          </span>
          <span
            className="block h-8 w-full rounded-[3px]"
            style={{
              background: i === highlight ? C.sage : "rgba(255,255,255,0.05)",
              boxShadow: i === highlight ? `0 0 12px -2px ${C.sage}` : undefined,
            }}
          />
          {i === highlight ? (
            <span
              className="text-[7px] font-bold"
              style={{ color: C.sage, fontFamily: "var(--font-mono)" }}
            >
              11AM
            </span>
          ) : (
            <span className="text-[7px]" style={{ color: "transparent" }}>·</span>
          )}
        </div>
      ))}
    </div>
  );
}

function MockCrmSync() {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="inline-flex size-9 items-center justify-center rounded-[8px]" style={{ background: "linear-gradient(135deg,#9ab5aa 0%,#60786d 100%)", color: "#0c1410", fontFamily: "var(--font-display)", fontWeight: 800 }}>
        H
      </span>
      <div className="flex flex-1 items-center gap-1">
        <SkelLine width="100%" opacity={0.18} />
        <motion.span
          className="block size-1.5 shrink-0 rounded-full"
          style={{ background: C.sage, boxShadow: `0 0 6px ${C.sage}` }}
          animate={{ x: [0, 24, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <SkelLine width="100%" opacity={0.18} />
      </div>
      <span
        className="inline-flex h-9 w-12 items-center justify-center rounded-[8px] text-[9px] font-bold uppercase"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: C.textMid, fontFamily: "var(--font-mono)" }}
      >
        FUB
      </span>
    </div>
  );
}

function MockAuditLog() {
  const lines: Array<{ t: string; body: string }> = [
    { t: "07:03", body: "reply.sent · approved by Sarah" },
    { t: "07:03", body: "route.assigned · MC → SK" },
    { t: "11:47", body: "inbound.captured · ig_dm" },
  ];
  return (
    <div className="w-full space-y-0.5">
      {lines.map((line, i) => (
        <div key={i} className="flex items-center gap-2 text-[9px]" style={{ fontFamily: "var(--font-mono)" }}>
          <span style={{ color: C.textFaint }}>{line.t}</span>
          <span className="truncate" style={{ color: i === 0 ? C.sage : C.textLow }}>{line.body}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Animated connector — flowing dots along curves around a labeled pill
// ---------------------------------------------------------------------

const CONNECTOR_PATH = "M 0 22 C 60 4 180 40 240 22";
const CONNECTOR_WIDTH = 240;
const CONNECTOR_HEIGHT = 44;

function ConnectorCurve({ side }: { side: "left" | "right" }) {
  // Both sides flow LEFT → RIGHT. The pill sits between them, so left side
  // moves toward the pill and right side moves away from it. Same flow
  // direction, continuous illusion of data passing through.
  const dotCount = 4;
  const cycleMs = 3000;
  return (
    <div
      className="relative hidden lg:block"
      style={{ width: CONNECTOR_WIDTH, height: CONNECTOR_HEIGHT, transform: side === "right" ? undefined : undefined }}
    >
      <svg
        viewBox={`0 0 ${CONNECTOR_WIDTH} ${CONNECTOR_HEIGHT}`}
        width={CONNECTOR_WIDTH}
        height={CONNECTOR_HEIGHT}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <path
          d={CONNECTOR_PATH}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
          strokeDasharray="2 6"
          strokeLinecap="round"
        />
      </svg>
      {Array.from({ length: dotCount }).map((_, i) => (
        <motion.span
          key={i}
          className="absolute left-0 top-0 size-[6px] rounded-full"
          style={{
            background: C.sage,
            boxShadow: `0 0 10px ${C.sage}`,
            offsetPath: `path("${CONNECTOR_PATH}")`,
            offsetRotate: "0deg",
          }}
          animate={{
            offsetDistance: ["0%", "100%"],
            opacity: [0, 1, 1, 0],
          }}
          transition={{
            duration: cycleMs / 1000,
            times: [0, 0.15, 0.85, 1],
            delay: (i * cycleMs) / dotCount / 1000,
            repeat: Infinity,
            ease: "linear",
          }}
        />
      ))}
    </div>
  );
}

function ConnectorPill({ label, sub }: { label: string; sub: string }) {
  return (
    <div
      className="relative inline-flex items-center gap-2.5 rounded-full px-4 py-2 backdrop-blur-md"
      style={{
        background: "rgba(20,14,8,0.55)",
        border: `1px solid ${C.line}`,
        boxShadow: `0 14px 30px -16px rgba(0,0,0,0.6), 0 0 24px -8px ${C.sageRing}`,
      }}
    >
      <motion.span
        className="inline-block size-1.5 rounded-full"
        style={{ background: C.sage, boxShadow: `0 0 8px ${C.sage}` }}
        animate={{ opacity: [0.4, 1, 0.4], scale: [0.9, 1.15, 0.9] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="flex items-baseline gap-2.5 text-[11.5px]">
        <span className="font-semibold" style={{ color: C.text }}>
          {label}
        </span>
        <span style={{ color: C.textLow, fontFamily: "var(--font-mono)", letterSpacing: "0.06em" }}>
          {sub}
        </span>
      </div>
    </div>
  );
}

function AnimatedConnector({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-6 sm:py-8">
      <ConnectorCurve side="left" />
      <ConnectorPill label={label} sub={sub} />
      <ConnectorCurve side="right" />
    </div>
  );
}

// Loopback arc at the end — wider downward curve underneath the last
// stage, with the "Insights feed back" pill in the middle and flowing
// dots traveling back along the arc.
const LOOPBACK_PATH = "M 0 12 C 220 100 740 100 960 12";
const LOOPBACK_WIDTH = 960;
const LOOPBACK_HEIGHT = 110;

function LoopbackArc() {
  const dotCount = 5;
  const cycleMs = 4000;
  return (
    <div className="relative mt-4 hidden h-[160px] w-full justify-center lg:flex">
      <div
        className="relative"
        style={{ width: LOOPBACK_WIDTH, height: LOOPBACK_HEIGHT }}
      >
        <svg
          viewBox={`0 0 ${LOOPBACK_WIDTH} ${LOOPBACK_HEIGHT}`}
          width={LOOPBACK_WIDTH}
          height={LOOPBACK_HEIGHT}
          className="absolute inset-0"
          aria-hidden="true"
        >
          <path
            d={LOOPBACK_PATH}
            fill="none"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1"
            strokeDasharray="2 6"
            strokeLinecap="round"
          />
        </svg>
        {Array.from({ length: dotCount }).map((_, i) => (
          <motion.span
            key={i}
            className="absolute left-0 top-0 size-[6px] rounded-full"
            style={{
              background: C.sage,
              boxShadow: `0 0 10px ${C.sage}`,
              offsetPath: `path("${LOOPBACK_PATH}")`,
              offsetRotate: "0deg",
            }}
            animate={{
              offsetDistance: ["100%", "0%"],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: cycleMs / 1000,
              times: [0, 0.15, 0.85, 1],
              delay: (i * cycleMs) / dotCount / 1000,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
        {/* loopback pill in the middle, sitting on the arc */}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{ top: 56 }}
        >
          <ConnectorPill label="Insights feed back" sub="Memory updates · learning loop" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Product fragments (legacy — kept for ControlFragment used by YourControls)
// ---------------------------------------------------------------------

function FragmentShell({ children, label, accent = "sage" }: { children: ReactNode; label?: string; accent?: "sage" | "blue" | "clay" }) {
  const ringColor = accent === "blue" ? "rgba(123,166,255,0.32)" : accent === "clay" ? "rgba(201,139,90,0.34)" : C.sageRing;
  const labelColor = accent === "blue" ? "#7ba6ff" : accent === "clay" ? "#e3b78c" : C.sage;
  return (
    <div
      className="relative w-full max-w-[420px] overflow-hidden rounded-[16px]"
      style={{
        background: "linear-gradient(180deg, rgba(20,14,8,0.46) 0%, rgba(11,12,13,0.7) 100%)",
        border: `1px solid ${ringColor}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 60px -28px rgba(0,0,0,0.7)",
        backdropFilter: "blur(12px)",
      }}
    >
      {label === undefined ? null : (
        <div className="flex items-center justify-between border-b px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ borderColor: "rgba(255,255,255,0.06)", color: labelColor }}>
          <span>{label}</span>
          <span style={{ color: C.textFaint }}>{nowClock()}</span>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

function nowClock(): string {
  // Static demo timestamp so SSR + CSR stay in sync.
  return "10:24 AM";
}

function ChannelChip({ kind }: { kind: "ig" | "fb" | "sms" | "phone" }) {
  const bg = kind === "ig"
    ? "linear-gradient(135deg,#f09433,#dc2743,#bc1888)"
    : kind === "fb"
      ? "linear-gradient(135deg,#1877f2,#0866ff)"
      : kind === "sms"
        ? "linear-gradient(135deg,#7bcf85,#3aa44a)"
        : "linear-gradient(135deg,#e3a067,#c98b5a)";
  const Icon = kind === "ig" ? InstagramGlyph : kind === "fb" ? FacebookGlyph : kind === "sms" ? MessageSquare : Voicemail;
  return (
    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px]" style={{ background: bg }} aria-hidden="true">
      {(() => {
        const I = Icon as React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;
        return <I className="size-3" aria-hidden="true" strokeWidth={2} />;
      })()}
    </span>
  );
}

export function InboundFragment() {
  const rows: Array<{ kind: "ig" | "fb" | "sms" | "phone"; who: string; body: string; when: string }> = [
    { kind: "ig", who: "@miacarter", body: "Saw your post about Bellaire. Is this still available?", when: "11:47 PM" },
    { kind: "fb", who: "noah_realestate", body: "what are the schools nearby?", when: "11:46 PM" },
    { kind: "sms", who: "832-•••-0101", body: "calling about 4126 Maple, want a tour Friday", when: "10:54 AM" },
    { kind: "phone", who: "713-•••-0218", body: "Voicemail captured · transcribed", when: "10:39 AM" },
  ];
  return (
    <FragmentShell label="Inbound · last hour" accent="blue">
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <ChannelChip kind={row.kind} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[12px] font-semibold" style={{ color: C.text }}>{row.who}</span>
                <span className="shrink-0 font-mono text-[10px]" style={{ color: C.textFaint }}>{row.when}</span>
              </div>
              <div className="truncate text-[11.5px]" style={{ color: C.textMid }}>{row.body}</div>
            </div>
          </li>
        ))}
      </ul>
    </FragmentShell>
  );
}

export function MemoryFragment() {
  const items: Array<{ label: string; sub: string; tone: "good" | "blue" | "clay" }> = [
    { label: "247 past leads", sub: "similar buyer patterns matched", tone: "good" },
    { label: "4126 Maple", sub: "listing facts, photos, HOA, schools", tone: "blue" },
    { label: "Bellaire territory", sub: "Sarah covers, calendar open", tone: "clay" },
    { label: "Brokerage voice", sub: "last 40 replies sampled", tone: "good" },
  ];
  return (
    <FragmentShell label="Reading workspace" accent="sage">
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <span
              className="inline-flex size-1.5 rounded-full"
              style={{
                background: item.tone === "good" ? "#9be0a3" : item.tone === "blue" ? "#7ba6ff" : "#e3b78c",
                boxShadow: `0 0 8px ${item.tone === "good" ? "#9be0a3" : item.tone === "blue" ? "#7ba6ff" : "#e3b78c"}`,
              }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold" style={{ color: C.text }}>{item.label}</div>
              <div className="text-[11px]" style={{ color: C.textLow }}>{item.sub}</div>
            </div>
            <Check className="size-3 shrink-0" aria-hidden="true" style={{ color: C.sage }} />
          </li>
        ))}
      </ul>
    </FragmentShell>
  );
}

export function DraftFragment() {
  return (
    <FragmentShell label="Draft · awaiting your approval" accent="sage">
      <div className="rounded-[12px] p-3" style={{ background: "rgba(154,181,170,0.10)", border: "1px solid rgba(154,181,170,0.32)" }}>
        <div className="flex items-center gap-2">
          <span className="inline-flex size-4 items-center justify-center rounded-[4px]" style={{ background: "linear-gradient(135deg,#9ab5aa 0%,#60786d 100%)", color: "#0c1410", fontSize: 9, fontWeight: 800 }}>H</span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#b6d1c5" }}>
            for Mia · Sarah will send
          </span>
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.55]" style={{ color: "rgba(238,243,240,0.94)" }}>
          Hi Mia, 4126 Maple is still active. Sarah covers Bellaire and has Saturday open at 11am or 2pm. Which works?
        </p>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <button type="button" className="inline-flex h-7 items-center justify-center gap-1 rounded-[7px] text-[11px] font-semibold" style={{ background: "linear-gradient(180deg,#b6d1c5,#8aa89a)", color: "#0c1410" }}>
            <Check className="size-3" aria-hidden="true" /> Approve
          </button>
          <button type="button" className="inline-flex h-7 items-center justify-center gap-1 rounded-[7px] text-[11px] font-semibold" style={{ background: "rgba(255,255,255,0.05)", color: C.textMid, border: "1px solid rgba(255,255,255,0.08)" }}>
            Edit
          </button>
        </div>
      </div>
    </FragmentShell>
  );
}

function ControlFragment() {
  const modes: Array<{ key: string; label: string; selected: boolean }> = [
    { key: "suggest", label: "Suggest only", selected: false },
    { key: "ask", label: "Ask before sending", selected: true },
    { key: "auto", label: "Auto send", selected: false },
  ];
  const channels: Array<{ key: "ig" | "fb" | "sms" | "phone"; label: string; on: boolean }> = [
    { key: "ig", label: "Instagram", on: true },
    { key: "fb", label: "Facebook", on: true },
    { key: "sms", label: "SMS", on: true },
    { key: "phone", label: "Phone & voicemail", on: false },
  ];
  return (
    <FragmentShell label="Your control panel" accent="clay">
      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.textFaint }}>Reply mode</div>
        <div className="mt-1.5 inline-flex w-full rounded-[8px] p-0.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}>
          {modes.map((m) => (
            <span
              key={m.key}
              className="flex-1 rounded-[6px] px-2 py-1.5 text-center text-[11px] font-semibold"
              style={{
                background: m.selected ? C.sage : "transparent",
                color: m.selected ? "#0c1410" : C.textMid,
              }}
            >
              {m.label}
            </span>
          ))}
        </div>
        <div className="mt-3.5 text-[10.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: C.textFaint }}>Per channel</div>
        <ul className="mt-1.5 space-y-1.5">
          {channels.map((ch) => (
            <li key={ch.key} className="flex items-center gap-2.5 rounded-[8px] px-2.5 py-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              <ChannelChip kind={ch.key} />
              <span className="flex-1 text-[12px]" style={{ color: C.text }}>{ch.label}</span>
              <span
                className="relative inline-flex h-4 w-7 items-center rounded-full"
                style={{
                  background: ch.on ? C.sage : "rgba(255,255,255,0.08)",
                  transition: "background 200ms",
                }}
                aria-hidden="true"
              >
                <span
                  className="absolute size-3 rounded-full"
                  style={{
                    background: "#0c1410",
                    left: ch.on ? 14 : 2,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                    transition: "left 200ms",
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </FragmentShell>
  );
}

export function RoutingFragment() {
  const reasons: ReadonlyArray<string> = ["covers Bellaire", "calendar open", "4 active leads", "match score 92"];
  return (
    <FragmentShell label="Routing decision" accent="sage">
      <div className="rounded-[12px] p-3" style={{ background: "rgba(154,181,170,0.08)", border: "1px solid rgba(154,181,170,0.28)" }}>
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold" style={{ background: "#9ab5aa", color: "#0c1410" }}>
            SK
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#b6d1c5" }}>
              Routed to
            </div>
            <div className="text-[14px] font-semibold" style={{ color: C.text }}>Sarah Kessler</div>
            <div className="text-[11px]" style={{ color: C.textLow }}>agent · Bellaire + West U</div>
          </div>
          <span
            className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em]"
            style={{ background: "rgba(155,224,163,0.16)", borderColor: "rgba(155,224,163,0.4)", color: "#9be0a3" }}
          >
            <Check className="size-2.5" aria-hidden="true" />
            assigned
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <span
              key={r}
              className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.08)", color: C.textMid }}
            >
              {r}
            </span>
          ))}
        </div>
      </div>
    </FragmentShell>
  );
}

// =====================================================================
// Also handles — compact reference row (no big card grid)
// =====================================================================

function AlsoHandles() {
  const items: Array<{ icon: typeof Check; label: string; body: string }> = [
    { icon: Phone, label: "Voice & SMS", body: "Voicemails transcribed, callbacks drafted, texts replied." },
    { icon: MessageCircle, label: "Comment threading", body: "Reply on the same post the buyer commented on." },
    { icon: Check, label: "Tour booking", body: "Calendar checked, slot proposed, confirmation sent." },
    { icon: ArrowRight, label: "Follow Up Boss sync", body: "Qualified leads land in your CRM, after you approve." },
    { icon: Check, label: "Standing rules", body: "\"Every Monday 8am, audit my hot leads.\" Runs on cadence." },
    { icon: Check, label: "Owner review queue", body: "Investor pings, price negotiation, anything sensitive." },
  ];
  return (
    <section id="capabilities" style={{ background: C.bg, borderColor: C.line }} className="border-b py-24">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="flex items-baseline justify-between">
          <SectionEyebrow>Also handles</SectionEyebrow>
        </div>
        <h2 className="mt-3 text-[28px] font-semibold leading-[1.05] tracking-[-0.015em] sm:text-[36px]" style={{ color: C.text }}>
          The rest of what Harwick does, no fluff.
        </h2>
        <ul className="mt-10 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <li key={i} className="border-l pl-4" style={{ borderColor: C.sageRing }}>
              <div className="text-[13.5px] font-semibold" style={{ color: C.text }}>{item.label}</div>
              <p className="mt-1 text-[12.5px] leading-6" style={{ color: C.textMid }}>{item.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// =====================================================================
// Your controls — single panel that visualizes the real settings
// (replaces the old card-grid trust section)
// =====================================================================

function YourControls() {
  return (
    <section style={{ background: C.bg, borderColor: C.line }} className="border-b py-28">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="max-w-[700px]">
          <SectionEyebrow>Your controls</SectionEyebrow>
          <SectionHeadline>It does exactly what you set it to do.</SectionHeadline>
          <p className="mt-5 text-[16px] leading-7" style={{ color: C.textMid }}>
            Nothing aggressive by default. Suggest only, ask before sending, or auto send. Per channel, per agent, per
            source. You see every change in the audit log.
          </p>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[1fr_minmax(360px,460px)] lg:items-center lg:gap-16">
          <ul className="space-y-6">
            <ControlPromise
              title="Your clients' messages are yours."
              body="We don't sell, share, or resell your conversation data. We don't use it to train any model. The data stays in your workspace."
            />
            <ControlPromise
              title="Works with what you already use."
              body="Follow Up Boss today. Salesforce, kvCORE, BoomTown next. Your CRM stays your CRM. Harwick feeds it."
            />
            <ControlPromise
              title="Disconnect any time."
              body="One click in Settings. Tokens revoke immediately. Your data is purged within 30 days. No lock in."
            />
            <ControlPromise
              title="Every action is logged."
              body="Who approved what, when it sent, which agent it routed to. Audit any conversation, any time."
            />
          </ul>

          <div className="lg:justify-self-end">
            <ControlFragment />
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px]" style={{ color: C.textLow }}>
          <span>The fine print:</span>
          <a className="underline-offset-2 hover:underline" style={{ color: C.textMid }} href="/privacy">Privacy</a>
          <a className="underline-offset-2 hover:underline" style={{ color: C.textMid }} href="/terms">Terms</a>
          <a className="underline-offset-2 hover:underline" style={{ color: C.textMid }} href="/data-deletion">Data deletion</a>
          <a className="underline-offset-2 hover:underline" style={{ color: C.textMid }} href="/connect/meta">What we read from Meta</a>
        </div>
      </div>
    </section>
  );
}

function ControlPromise({ title, body }: { title: string; body: string }) {
  return (
    <li className="flex gap-4">
      <span
        className="mt-1.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full"
        style={{ background: C.sageSoft, border: `1px solid ${C.sageRing}` }}
      >
        <Check className="size-2.5" aria-hidden="true" style={{ color: C.sage }} />
      </span>
      <div className="min-w-0">
        <div className="text-[15px] font-semibold" style={{ color: C.text }}>{title}</div>
        <p className="mt-1 text-[13.5px] leading-6" style={{ color: C.textMid }}>{body}</p>
      </div>
    </li>
  );
}

// =====================================================================
// What is Harwick — 3-card positioning comparison
//
// IG/FB inbox alone · Generic AI replier · Harwick. Direct contrast.
// =====================================================================

type ComparisonItem = { label: string; has: boolean };
type ComparisonCard = {
  eyebrow: string;
  title: string;
  description: string;
  items: ReadonlyArray<ComparisonItem>;
  highlight?: boolean;
};

const COMPARISON_ROWS: ReadonlyArray<string> = [
  "Catches every channel (IG, FB, SMS, phone)",
  "Replies in your brokerage's voice",
  "Routes to the right agent by territory",
  "Books tours against your real calendar",
  "Knows your past closed deals",
  "Flags investor inquiries for owner review",
  "Audit log on every send",
];

const COMPARISON_CARDS: ReadonlyArray<ComparisonCard> = [
  {
    eyebrow: "today",
    title: "Your IG/FB inbox",
    description: "You scroll, you reply, you miss. One channel at a time. No memory between threads.",
    items: COMPARISON_ROWS.map((label) => ({ label, has: false })),
  },
  {
    eyebrow: "generic",
    title: "A generic reply bot",
    description: "Templated greetings on one channel. No territory awareness. No brokerage context. No control.",
    items: COMPARISON_ROWS.map((label, i) => ({ label, has: i === 0 })),
  },
  {
    eyebrow: "Harwick",
    title: "Harwick",
    description: "Built for brokerages. Watches every channel, drafts in your voice, routes to the right agent, waits for your approval.",
    items: COMPARISON_ROWS.map((label) => ({ label, has: true })),
    highlight: true,
  },
];

function WhatIsHarwick() {
  return (
    <section style={{ background: C.bg }} className="py-28">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="mx-auto max-w-[680px] text-center">
          <SectionEyebrow>What is Harwick</SectionEyebrow>
          <SectionHeadline>Not a chatbot. Not just an inbox.</SectionHeadline>
          <p className="mx-auto mt-5 max-w-[560px] text-[15.5px] leading-7" style={{ color: C.textMid }}>
            Built for the way real-estate brokerages actually run. Here's what makes it different from what you're
            doing right now.
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {COMPARISON_CARDS.map((card) => (
            <ComparisonCardView key={card.title} card={card} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ComparisonCardView({ card }: { card: ComparisonCard }) {
  return (
    <article
      className="flex flex-col rounded-[18px] p-6"
      style={{
        background: card.highlight
          ? `linear-gradient(180deg, ${C.sageSoft} 0%, ${C.panel} 100%)`
          : C.panel,
        border: `1px solid ${card.highlight ? C.sageRing : C.line}`,
        boxShadow: card.highlight ? `0 0 60px -20px ${C.sageRing}` : undefined,
      }}
    >
      <div
        className="text-[10.5px] font-semibold uppercase"
        style={{
          color: card.highlight ? C.sage : C.textFaint,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.14em",
        }}
      >
        {card.eyebrow}
      </div>
      <h3
        className="mt-3 text-[20px] font-semibold tracking-[-0.015em]"
        style={{
          color: card.highlight ? C.sage : C.text,
          fontFamily: "var(--font-display)",
        }}
      >
        {card.title}
      </h3>
      <p className="mt-2 text-[13px] leading-6" style={{ color: C.textMid }}>
        {card.description}
      </p>
      <ul className="mt-5 space-y-2.5">
        {card.items.map((item, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[13px]">
            {item.has ? (
              <Check
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
                style={{ color: card.highlight ? C.sage : "rgba(255,255,255,0.5)" }}
              />
            ) : (
              <span
                className="mt-0.5 inline-flex size-3.5 shrink-0 items-center justify-center"
                style={{ color: "rgba(255,255,255,0.28)" }}
                aria-hidden="true"
              >
                ×
              </span>
            )}
            <span
              style={{
                color: item.has
                  ? card.highlight ? C.text : "rgba(255,255,255,0.78)"
                  : "rgba(255,255,255,0.36)",
                textDecoration: item.has ? "none" : "none",
              }}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

// =====================================================================
// Tabbed handles — "Six kinds of inbound, six right answers"
//
// Same pattern as Coya's HighlightsSpecialist: tab selector + detail
// card that morphs.
// =====================================================================

type HandlePattern = {
  id: string;
  label: string;
  accent: string;
  inbound: string;
  channel: "ig" | "fb" | "sms" | "phone";
  reply: string;
  takeaways: ReadonlyArray<string>;
  action: string;
};

const HANDLE_PATTERNS: ReadonlyArray<HandlePattern> = [
  {
    id: "tour",
    label: "Tour request",
    accent: "#9ab5aa",
    channel: "ig",
    inbound: "saw your post about 4126 Maple, can i tour saturday?",
    reply: "Hi Mia, 4126 Maple is still active. Sarah covers Bellaire and has Saturday open at 11am or 2pm. Which works?",
    takeaways: [
      "Checked listing status before confirming",
      "Found territory agent with capacity",
      "Pulled real calendar slots, not generic",
    ],
    action: "Routed to Sarah · awaiting your approval",
  },
  {
    id: "price",
    label: "Price pushback",
    accent: "#c98b5a",
    channel: "ig",
    inbound: "$795k seems high for that street. open to offers?",
    reply: "Flagged for owner review. Price negotiation needs a human call.",
    takeaways: [
      "Detected negotiation intent",
      "Refused to anchor on a number",
      "Routed to owner with full thread context",
    ],
    action: "Flagged for owner review",
  },
  {
    id: "qualification",
    label: "Qualification ask",
    accent: "#7ba6ff",
    channel: "fb",
    inbound: "what's the HOA on this one?",
    reply: "$48/month, covers landscaping and community pool access. Want the full HOA docs?",
    takeaways: [
      "Pulled fact from listing record",
      "Offered next step without pushing",
      "Logged response time for analytics",
    ],
    action: "Replied · sent in 14 seconds",
  },
  {
    id: "investor",
    label: "Investor inquiry",
    accent: "#b793e6",
    channel: "fb",
    inbound: "looking at multi-family in Bellaire. cap rate on this one?",
    reply: "Flagged for owner review. Investor inquiry requires manual handling.",
    takeaways: [
      "Detected investor language (cap rate)",
      "Routed to owner, not the listing agent",
      "Preserved full transcript for the call",
    ],
    action: "Flagged for owner review",
  },
  {
    id: "out_of_state",
    label: "Out-of-state buyer",
    accent: "#9be0a3",
    channel: "ig",
    inbound: "moving from austin in june, can we do a virtual walkthrough?",
    reply: "Virtual tours available. Sarah has Tuesday 6pm or Thursday 5pm CT. Which works?",
    takeaways: [
      "Recognized out-of-state relocation context",
      "Suggested virtual instead of in-person",
      "Booked against Sarah's evening availability",
    ],
    action: "Booked · Sarah will send Zoom link",
  },
  {
    id: "tire_kicker",
    label: "Tire kicker",
    accent: "rgba(255,255,255,0.5)",
    channel: "ig",
    inbound: "🔥🔥🔥",
    reply: "Liked the comment.",
    takeaways: [
      "No qualification signal in the message",
      "Avoided spammy follow-up DM",
      "Engagement counted without a manual reply",
    ],
    action: "Liked the comment",
  },
];

function TabbedHandles() {
  const [activeId, setActiveId] = useState(HANDLE_PATTERNS[0]!.id);
  const active = HANDLE_PATTERNS.find((p) => p.id === activeId) ?? HANDLE_PATTERNS[0]!;
  return (
    <section style={{ background: C.bg }} className="py-28">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="mx-auto max-w-[700px] text-center">
          <SectionEyebrow>Handles every kind</SectionEyebrow>
          <SectionHeadline>Six inbound patterns. Six right answers.</SectionHeadline>
          <p className="mx-auto mt-5 max-w-[560px] text-[15.5px] leading-7" style={{ color: C.textMid }}>
            Every buyer message gets a fitting response. Tour requests get slots. Price questions get rerouted.
            Investors get flagged. Tire kickers get a like, not a sales pitch.
          </p>
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-2">
          {HANDLE_PATTERNS.map((pattern) => {
            const isActive = pattern.id === activeId;
            return (
              <button
                key={pattern.id}
                type="button"
                onClick={() => setActiveId(pattern.id)}
                className="rounded-full border px-4 py-2 text-[12.5px] font-medium transition"
                style={{
                  background: isActive ? `${pattern.accent}1f` : "transparent",
                  borderColor: isActive ? `${pattern.accent}66` : C.line,
                  color: isActive ? pattern.accent : C.textMid,
                }}
              >
                {pattern.label}
              </button>
            );
          })}
        </div>

        <div
          key={active.id}
          className="mt-10 overflow-hidden rounded-[20px]"
          style={{
            background: `linear-gradient(135deg, ${active.accent}10 0%, ${C.panel} 60%, ${C.panel} 100%)`,
            border: `1px solid ${active.accent}33`,
            boxShadow: "0 30px 80px -30px rgba(0,0,0,0.55)",
          }}
        >
          <div className="grid gap-8 px-6 py-10 sm:px-10 sm:py-12 lg:grid-cols-2 lg:gap-12">
            <div>
              <div
                className="text-[10.5px] font-semibold uppercase"
                style={{ color: active.accent, fontFamily: "var(--font-mono)", letterSpacing: "0.14em" }}
              >
                Pattern · {active.label}
              </div>
              <h3
                className="mt-4 text-[24px] font-semibold leading-snug tracking-[-0.015em] sm:text-[28px]"
                style={{ color: C.text, fontFamily: "var(--font-display)" }}
              >
                What it does with this one.
              </h3>
              <ul className="mt-5 space-y-3">
                {active.takeaways.map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-6" style={{ color: C.textMid }}>
                    <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" style={{ color: active.accent }} />
                    {t}
                  </li>
                ))}
              </ul>
              <div
                className="mt-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase"
                style={{
                  background: `${active.accent}1c`,
                  borderColor: `${active.accent}50`,
                  color: active.accent,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.12em",
                }}
              >
                <span className="inline-block size-1.5 rounded-full" style={{ background: active.accent }} />
                {active.action}
              </div>
            </div>

            <div className="space-y-3">
              <PatternBubble side="lead" channel={active.channel} body={active.inbound} when="11:46 PM" />
              <PatternBubble side="harwick" channel={active.channel} body={active.reply} when="11:46 PM" accent={active.accent} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PatternBubble({
  side,
  channel,
  body,
  when,
  accent,
}: {
  side: "lead" | "harwick";
  channel: "ig" | "fb" | "sms" | "phone";
  body: string;
  when: string;
  accent?: string;
}) {
  if (side === "harwick") {
    return (
      <div className="ml-auto flex max-w-[88%] flex-col items-end gap-1">
        <div
          className="rounded-[14px] rounded-br-[4px] px-4 py-3 text-[13.5px] leading-[1.5]"
          style={{
            background: "linear-gradient(180deg,#9ab5aa 0%,#7a988b 100%)",
            color: C.ink,
            boxShadow: `0 0 24px -8px ${accent ?? C.sageRing}`,
          }}
        >
          {body}
        </div>
        <div
          className="inline-flex items-center gap-1.5 pr-1 text-[10.5px]"
          style={{ color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-mono)" }}
        >
          <Check className="size-2.5" aria-hidden="true" /> sent · {when}
        </div>
      </div>
    );
  }
  const chipBg = channel === "fb"
    ? "linear-gradient(135deg,#1877f2,#0866ff)"
    : channel === "sms"
      ? "linear-gradient(135deg,#7bcf85,#3aa44a)"
      : channel === "phone"
        ? "linear-gradient(135deg,#e3a067,#c98b5a)"
        : "linear-gradient(135deg,#f09433,#dc2743,#bc1888)";
  const ChannelIcon = channel === "fb" ? FacebookGlyph : channel === "sms" ? MessageSquare : channel === "phone" ? Phone : InstagramGlyph;
  return (
    <div className="flex max-w-[88%] flex-col items-start gap-1">
      <div
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
        style={{ color: "rgba(255,255,255,0.55)", fontFamily: "var(--font-mono)", letterSpacing: "0.08em" }}
      >
        <span className="inline-flex size-3.5 items-center justify-center rounded-[3px]" style={{ background: chipBg }}>
          <ChannelIcon className="size-2" aria-hidden="true" />
        </span>
        {channel === "ig" ? "instagram dm" : channel === "fb" ? "facebook comment" : channel === "sms" ? "sms" : "phone"}
      </div>
      <div
        className="rounded-[14px] rounded-bl-[4px] px-4 py-3 text-[13.5px] leading-[1.5] text-white"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        {body}
      </div>
      <div className="pl-1 text-[10.5px]" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-mono)" }}>
        {when}
      </div>
    </div>
  );
}

// =====================================================================
// Pricing — three tiers with `inherits` language. Marked early access.
// =====================================================================

type PricingTier = {
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  cta: string;
  href: string;
  highlight: boolean;
  inherits?: string;
  features: ReadonlyArray<string>;
};

const PRICING_TIERS: ReadonlyArray<PricingTier> = [
  {
    name: "Solo",
    price: "$299",
    cadence: "/ month",
    tagline: "Single agent running a serious desk",
    cta: "Start with Solo",
    href: PRIMARY_HREF,
    highlight: false,
    features: [
      "2 workspace seats",
      "Instagram + Facebook intake",
      "Auto-send when policy allows",
      "Follow Up Boss sync",
      "10 active listings",
      "2,000 social turns + 500 voice minutes",
      "Standing rules + recurring loops",
    ],
  },
  {
    name: "Team",
    price: "$799",
    cadence: "/ month",
    tagline: "Small team, one operator",
    cta: "Start with Team",
    href: PRIMARY_HREF,
    highlight: true,
    inherits: "Solo",
    features: [
      "Up to 10 seats",
      "Routing profiles + agent assignment",
      "Calendar showings + tour booking",
      "Workspace memory across closed deals",
      "50 listings, 8,000 turns, 2,000 voice minutes",
      "Per-channel reply mode controls",
    ],
  },
  {
    name: "Brokerage",
    price: "Custom",
    cadence: "annual",
    tagline: "Multi-agent operation",
    cta: "Talk to us",
    href: "mailto:support@harwick.lol?subject=Harwick%20brokerage%20plan",
    highlight: false,
    inherits: "Team",
    features: [
      "Unlimited seats and listings",
      "Many connected Pages and IG accounts",
      "Owner review queue",
      "25,000 social turns + 6,000 voice minutes",
      "White-glove setup",
      "Priority support",
      "Custom integrations",
    ],
  },
];

function Pricing() {
  return (
    <section id="pricing" style={{ background: C.bg }} className="py-28">
      <div className="mx-auto w-full max-w-[1180px] px-6">
        <div className="mx-auto max-w-[700px] text-center">
          <SectionEyebrow>Pricing · early access</SectionEyebrow>
          <SectionHeadline>One workspace. Every channel.</SectionHeadline>
          <p className="mx-auto mt-5 max-w-[560px] text-[15.5px] leading-7" style={{ color: C.textMid }}>
            Every plan includes the full intake, qualification, routing, and approval loop. Price reflects seats and
            connected accounts, never feature trickling.
          </p>
          <p
            className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] uppercase"
            style={{
              borderColor: C.sageRing,
              background: C.sageSoft,
              color: C.sage,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.12em",
            }}
          >
            <span className="inline-block size-1.5 rounded-full" style={{ background: C.sage, boxShadow: `0 0 8px ${C.sage}` }} />
            early access · locked in for partners
          </p>
        </div>

        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <PricingCard key={tier.name} tier={tier} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingCard({ tier }: { tier: PricingTier }) {
  const material = getPlanMaterial(tier.name);
  return (
    <article
      className="group relative flex flex-col overflow-hidden rounded-[18px] p-6 transition-transform duration-300 will-change-transform hover:-translate-y-1"
      style={{
        background: material.background,
        border: `1px solid ${material.ringColor}`,
        boxShadow: `${material.edgeShadow}, 0 30px 60px -25px rgba(0,0,0,0.6), 0 0 70px -30px ${material.ringColor}`,
      }}
    >
      {/* Animated shimmer sweep on hover — matches Bloc/Afroplus card pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -translate-x-full bg-[linear-gradient(110deg,transparent_35%,rgba(255,255,255,0.06)_50%,transparent_65%)] bg-[length:250%_100%] transition-transform duration-1000 ease-out group-hover:translate-x-full"
      />

      <div className="relative flex items-center justify-between">
        <h3
          className="text-[16px] font-semibold tracking-[-0.01em]"
          style={{ color: C.text, fontFamily: "var(--font-display)" }}
        >
          {tier.name}
        </h3>
        {tier.highlight ? (
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase backdrop-blur-sm"
            style={{
              background: `${material.accentColor}1f`,
              borderColor: material.ringColor,
              color: material.accentColor,
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.1em",
            }}
          >
            most teams
          </span>
        ) : null}
      </div>

      <div className="relative mt-4 flex items-baseline gap-1.5">
        <span
          className="bg-clip-text text-[40px] font-semibold leading-none tracking-[-0.03em] text-transparent"
          style={{
            backgroundImage: material.textShimmer,
            fontFamily: "var(--font-display)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {tier.price}
        </span>
        <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          {tier.cadence}
        </span>
      </div>
      <p className="relative mt-1 text-[12.5px]" style={{ color: "rgba(255,255,255,0.7)" }}>
        {tier.tagline}
      </p>

      {tier.inherits === undefined ? null : (
        <p
          className="relative mt-5 text-[11px] uppercase"
          style={{
            color: material.accentColor,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.12em",
          }}
        >
          Everything in {tier.inherits}, plus
        </p>
      )}

      <ul className="relative mt-4 flex-1 space-y-2 text-[13px]" style={{ color: "rgba(255,255,255,0.92)" }}>
        {tier.features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" style={{ color: material.accentColor }} />
            {feature}
          </li>
        ))}
      </ul>

      <a
        href={tier.href}
        className="relative mt-6 inline-flex h-10 w-full items-center justify-center rounded-[10px] px-3 text-[13px] font-semibold backdrop-blur-sm transition hover:brightness-110"
        style={
          tier.highlight
            ? {
                background: `linear-gradient(180deg, ${material.accentColor} 0%, ${material.accentColor}cc 100%)`,
                color: C.ink,
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.35), 0 12px 30px -10px ${material.ringColor}`,
              }
            : {
                border: `1px solid ${material.ringColor}`,
                background: "rgba(255,255,255,0.06)",
                color: C.text,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }
        }
      >
        {tier.cta}
      </a>
    </article>
  );
}

// =====================================================================
// Early access — replaces public pricing while billing/onboarding is wip
// =====================================================================

function EarlyAccess({ isAuthenticated }: LandingProps) {
  return (
    <section id="access" style={{ background: C.bg, borderColor: C.line }} className="border-b py-24">
      <div className="mx-auto w-full max-w-[1100px] px-5">
        <div
          className="relative overflow-hidden rounded-[22px] p-10 sm:p-14"
          style={{
            background: `radial-gradient(900px 400px at 80% 0%, ${C.sageSoft}, transparent 60%), linear-gradient(180deg, ${C.panelHi} 0%, ${C.panel} 100%)`,
            border: `1px solid ${C.line}`,
          }}
        >
          <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.sage }}>Early access</p>
              <h2 className="mt-3 text-[36px] font-semibold leading-[1.05] tracking-[-0.02em] sm:text-[44px]" style={{ color: C.text }}>
                One brokerage at a time.
              </h2>
              <p className="mt-4 max-w-[520px] text-[15px] leading-7" style={{ color: C.textMid }}>
                We're onboarding brokerages by hand right now. Connect your Instagram and Facebook Page, point at your
                CRM, and run a real intake the same day. Public pricing lands once self serve onboarding ships. Until
                then, you'll talk to us.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <PrimaryCta href={isAuthenticated ? "/home" : PRIMARY_HREF}>
                  {isAuthenticated ? "Open Harwick" : "Create account"}
                </PrimaryCta>
                <SecondaryCta href="mailto:support@harwick.lol?subject=Harwick%20early%20access">Talk to us</SecondaryCta>
              </div>
            </div>

            <ul className="space-y-3 self-center text-[13.5px] leading-6" style={{ color: C.textMid }}>
              {[
                "Hands on setup with someone who knows the product",
                "Bring your Meta accounts, your CRM, and your team",
                "Connect at the brokerage level or per agent",
                "Pricing locked in for early access partners",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span
                    className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full"
                    style={{ background: C.sageSoft, border: `1px solid ${C.sageRing}`, color: C.sage }}
                  >
                    <Check className="size-2.5" aria-hidden="true" />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// Footer
// =====================================================================

function Footer() {
  return (
    <footer style={{ background: C.bg }} className="py-10">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col items-start justify-between gap-6 px-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <HarwickLogo size={20} />
          <span className="text-[13px] font-semibold" style={{ color: C.text }}>Harwick</span>
          <span className="text-[11.5px]" style={{ color: C.textFaint }}>by Coya Systems LLC</span>
          <span className="ml-2 text-[11.5px]" style={{ color: C.textFaint }}>© {new Date().getFullYear()}</span>
        </div>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px]" style={{ color: C.textMid }}>
          <a className="hover:text-white" href="/privacy">Privacy</a>
          <a className="hover:text-white" href="/terms">Terms</a>
          <a className="hover:text-white" href="/data-deletion">Data deletion</a>
          <a className="hover:text-white" href="/connect/meta">Connect Meta</a>
          <a className="hover:text-white" href="mailto:support@harwick.lol">Contact</a>
          <a className="hover:text-white" href="tel:+14848456393">+1 (484) 845-6393</a>
        </nav>
      </div>
    </footer>
  );
}

// =====================================================================
// Root
// =====================================================================

export function MarketingLandingPage({ isAuthenticated }: LandingProps) {
  return (
    <div style={{ background: C.bg, color: C.text }} className="min-h-screen antialiased">
      <TopBar isAuthenticated={isAuthenticated} />
      <main>
        <Hero isAuthenticated={isAuthenticated} />
        <SectionBreak />
        <WhatIsHarwick />
        <SectionBreak />
        <HowItWorks />
        <SectionBreak />
        <TabbedHandles />
        <SectionBreak />
        <AlsoHandles />
        <SectionBreak />
        <YourControls />
        <SectionBreak />
        <Pricing />
        <SectionBreak />
        <EarlyAccess isAuthenticated={isAuthenticated} />
      </main>
      <Footer />
    </div>
  );
}
