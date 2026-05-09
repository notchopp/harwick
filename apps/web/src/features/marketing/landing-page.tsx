import {
  ArrowRight,
  Bot,
  Check,
  Fingerprint,
  GitBranch,
  LockKeyhole,
  MousePointer2,
  RadioTower,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { Button } from "../../components/ui/button";
import { HomeEntry } from "./home-entry";

const navLinks = [
  { href: "#product", label: "Product" },
  { href: "#system", label: "System" },
  { href: "#plans", label: "Pricing" },
  { href: "#request-access", label: "Contact" },
] as const;

const legalLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/data-deletion", label: "Data deletion" },
] as const;

const workSteps = [
  {
    icon: RadioTower,
    title: "Capture every channel",
    body: "Instagram DMs and comments, Facebook, public listings, SMS, and voice land as one lead stream.",
  },
  {
    icon: Bot,
    title: "Think with the brokerage",
    body: "Harwick reads policy, lead memory, listing facts, workspace knowledge, routing profiles, and conversation history.",
  },
  {
    icon: MousePointer2,
    title: "Ask before external writes",
    body: "Replies, routing, calendar writes, and Follow Up Boss syncs stay gated until the operator approves.",
  },
] as const;

const capabilities = [
  {
    icon: Fingerprint,
    title: "Workspace memory",
    body: "Cross-lead patterns become brokerage knowledge instead of living in one operator's head.",
  },
  {
    icon: Sparkles,
    title: "Live synthesis",
    body: "Intent, confidence, missing fields, next action, tool work, and handoff brief update while the thread moves.",
  },
  {
    icon: GitBranch,
    title: "Tool registry",
    body: "FUB, calendar, listings, voice, and social register as capabilities Harwick can reason through.",
  },
  {
    icon: Users,
    title: "Team routing",
    body: "Assignments account for area, price, lead type, source credit, capacity, readiness, and overrides.",
  },
] as const;

const featureFigures = [
  {
    fig: "fig 1.1",
    title: "One intake object",
    body: "Instagram DMs, comments, voice, SMS, and listing inquiries collapse into one lead stream with source and context preserved.",
    variant: "stack",
  },
  {
    fig: "fig 1.2",
    title: "The model owns the loop",
    body: "Harwick reasons through memory, listing facts, policy, tool results, and conversation history before proposing work.",
    variant: "loop",
  },
  {
    fig: "fig 1.3",
    title: "External writes stay gated",
    body: "Replies, calendar writes, assignments, nurture, and FUB sync wait behind an explicit operator approval surface.",
    variant: "gate",
  },
] as const;

const featureGroups = [
  {
    title: "Inbound",
    links: ["Instagram DM", "Instagram comments", "Facebook", "Voice calls", "SMS", "Public listings"],
  },
  {
    title: "Agent loop",
    links: ["Live synthesis", "Tool registry", "Subagent dispatch", "Scheduled loops", "Cost-tiered cognition"],
  },
  {
    title: "Brokerage OS",
    links: ["Workspace memory", "Team routing", "Calendar showings", "Open house reminders", "Lead documents"],
  },
  {
    title: "Controls",
    links: ["Approval queue", "Human takeover", "Audit trail", "Provider receipts", "Plan gates"],
  },
] as const;

const plans = [
  {
    name: "Solo",
    price: "$299",
    body: "For one agent running a serious desk.",
    points: ["1 workspace seat", "social intake", "AI reply drafting", "FUB sync", "25 listings"],
    featured: false,
  },
  {
    name: "Team",
    price: "$799",
    body: "For a small team with one operator.",
    points: ["up to 8 seats", "routing profiles", "calendar and showings", "workspace memory", "voice-ready"],
    featured: true,
  },
  {
    name: "Brokerage",
    price: "Custom",
    body: "For multi-agent operations.",
    points: ["expanded seats", "many connected accounts", "ops visibility", "white-glove setup", "priority support"],
    featured: false,
  },
] as const;

const threadMessages = [
  {
    sender: "lead",
    time: "3:24 AM",
    body: "Is 4126 Maple still open? We are pre-approved and can tour this weekend.",
  },
  {
    sender: "operator",
    time: "3:25 AM",
    body: "@Harwick qualify and route this if it is real.",
  },
  {
    sender: "Harwick",
    time: "3:25 AM",
    body: "Created 2 actions: draft reply for approval, route to Noah after confirmation.",
  },
] as const;

const footerGroups = [
  {
    title: "Product",
    links: [
      { href: "#product", label: "Intake" },
      { href: "#system", label: "Operating system" },
      { href: "#features", label: "Features" },
      { href: "#plans", label: "Pricing" },
      { href: "#request-access", label: "Access" },
    ],
  },
  {
    title: "Features",
    links: [
      { href: "#features", label: "Workspace memory" },
      { href: "#features", label: "Approval gates" },
      { href: "#features", label: "FUB sync" },
      { href: "#features", label: "Calendar showings" },
      { href: "#features", label: "Voice handoffs" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "mailto:support@harwick.lol", label: "Contact" },
      { href: "#request-access", label: "Private access" },
      { href: "/login", label: "Log in" },
      { href: "/home", label: "Dashboard" },
    ],
  },
  {
    title: "Legal",
    links: legalLinks,
  },
] as const;

function LogoMark({ className }: { className: string }) {
  return (
    <img
      alt=""
      className={className}
      height={369}
      src="/harwick-gemini-logo.png"
      width={677}
    />
  );
}

function TopBar({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.07] bg-[#050607]/78 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1080px] items-center justify-between px-5 lg:px-0">
        <a className="flex items-center gap-2.5" href="/" aria-label="Harwick home">
          <LogoMark className="h-7 w-auto" />
          <span className="text-[18px] font-semibold text-white">Harwick</span>
        </a>

        <nav className="hidden items-center gap-7 text-[13px] font-medium text-white/48 md:flex">
          {navLinks.map((link) => (
            <a className="transition hover:text-white" href={link.href} key={link.href}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            className="hidden text-[13px] font-medium text-white/58 transition hover:text-white sm:inline-flex"
            href={isAuthenticated ? "/home" : "/login"}
          >
            {isAuthenticated ? "Dashboard" : "Log in"}
          </a>
          <a
            className="inline-flex h-9 items-center justify-center rounded-full bg-white px-4 text-[13px] font-semibold shadow-[0_10px_28px_rgba(255,255,255,0.08)] transition hover:bg-white/88"
            href="#request-access"
            style={{ color: "#050607" }}
          >
            Create account
          </a>
        </div>
      </div>
    </header>
  );
}

function WorkSystem() {
  return (
    <section id="product" className="border-b border-white/[0.08] bg-[#050607] py-24 text-white">
      <div className="mx-auto w-full max-w-[1080px] px-5 lg:px-0">
        <h2 className="max-w-[900px] text-[40px] font-semibold leading-[1.05] text-white sm:text-[58px]">
          A new species of real estate ops tool.{" "}
          <span className="text-white/42">
            Purpose-built for AI-native lead work, approval gates, and brokerage memory.
          </span>
        </h2>

        <div className="mt-24 grid grid-cols-1 border-y border-white/[0.08] md:grid-cols-3">
          {workSteps.map((step, index) => {
            const Icon = step.icon;
            return (
              <article
                className="border-white/[0.08] py-10 md:border-l md:px-8 first:md:border-l-0"
                key={step.title}
              >
                <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/18">
                  fig 0.{index + 2}
                </div>
                <div className="relative mt-12 flex h-40 items-center justify-center">
                  <div className="absolute size-28 rounded-[24px] border border-white/[0.14] bg-white/[0.015] shadow-[0_0_60px_rgba(255,255,255,0.025)]" />
                  <div className="absolute size-20 rotate-45 rounded-[18px] border border-white/[0.08]" />
                  <Icon aria-hidden="true" className="relative size-9 text-white/30" strokeWidth={1.35} />
                </div>
                <h3 className="mt-12 text-[17px] font-semibold text-white/84">{step.title}</h3>
                <p className="mt-3 max-w-[270px] text-[14px] leading-7 text-white/42">{step.body}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function SystemSection() {
  return (
    <section id="system" className="relative min-h-[900px] overflow-hidden bg-[#050607] py-24 text-white">
      <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-14 px-5 lg:grid-cols-[0.78fr_0.92fr] lg:px-0">
        <div>
          <h2 className="max-w-[520px] text-[42px] font-semibold leading-[1.02] text-white sm:text-[58px]">
            Make brokerage operations self-driving
          </h2>
        </div>
        <div>
          <p className="max-w-[520px] text-[24px] font-semibold leading-[1.25] text-white/78 sm:text-[28px]">
            Turn conversations, listing questions, and voice calls into routed work your team can trust.
          </p>
          <a className="mt-9 inline-flex items-center gap-2 text-[14px] font-medium text-white/40 hover:text-white" href="#request-access">
            1.0 Intake
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>
      </div>

      <div className="relative mx-auto mt-16 h-[560px] w-full max-w-[1180px] px-5 lg:px-0">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-16 h-[420px] bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.10),transparent_68%)]"
        />

        <div className="absolute left-1/2 top-28 hidden w-[820px] -translate-x-[10%] grid-cols-3 gap-4 opacity-45 blur-[0.1px] md:grid">
          {["Todo", "In progress", "Approved"].map((column, columnIndex) => (
            <div className="space-y-3" key={column}>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-white/48">
                <span className={columnIndex === 1 ? "size-2 rounded-full bg-[#d8ad45]" : "size-2 rounded-full bg-white/18"} />
                {column}
                <span className="text-white/22">{columnIndex === 0 ? "12" : columnIndex === 1 ? "3" : "8"}</span>
              </div>
              {[
                ["Jamal R.", "Route Katy buyer", "Instagram"],
                ["Maya S.", "Call back after 4pm", "Voice"],
                ["Andre P.", "Confirm Sunday showing", "Calendar"],
              ].map((row, rowIndex) => (
                <div
                  className="rounded-[10px] border border-white/[0.08] bg-white/[0.035] p-3"
                  key={`${column}-${row[0]}`}
                  style={{ opacity: 1 - rowIndex * 0.13 }}
                >
                  <div className="text-[11px] text-white/28">HW-{columnIndex + 1}{rowIndex + 40}</div>
                  <div className="mt-2 text-[13px] font-medium text-white/64">{row[1]}</div>
                  <div className="mt-4 inline-flex rounded-[6px] border border-white/[0.07] px-2 py-1 text-[10px] text-white/34">
                    {row[2]}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="absolute left-5 top-10 w-[min(520px,calc(100%-2.5rem))] overflow-hidden rounded-[16px] border border-white/[0.14] bg-[#151718]/92 shadow-[0_34px_90px_rgba(0,0,0,0.45)] backdrop-blur-md lg:left-0">
          <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
            <div className="text-[13px] font-semibold text-white/56">Thread in #leads</div>
            <div className="text-[20px] leading-none text-white/24">...</div>
          </div>
          <div className="space-y-5 p-5">
            {threadMessages.map((message) => (
              <div className="flex gap-3" key={`${message.sender}-${message.time}`}>
                <div className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-white/[0.08] text-[11px] font-semibold text-white/58">
                  {message.sender.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-semibold text-white/82">{message.sender}</span>
                    <span className="text-white/28">{message.time}</span>
                  </div>
                  <p className="mt-1 max-w-[400px] text-[14px] leading-6 text-white/56">{message.body}</p>
                </div>
              </div>
            ))}

            <div className="rounded-[12px] border border-[#6f7cff]/30 bg-[#6f7cff]/12 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9aa2ff]">
                Harwick output
              </div>
              <p className="mt-2 text-[14px] leading-6 text-white/76">
                Route to Noah. Ask for Saturday 11:00 or 1:30. Do not sync to FUB until the lead confirms tour intent.
              </p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 right-5 hidden w-[340px] rounded-[16px] border border-white/[0.12] bg-[#121415]/90 p-5 shadow-[0_28px_80px_rgba(0,0,0,0.42)] backdrop-blur-md lg:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7ad69a]">
            approval plan
          </div>
          <div className="mt-4 space-y-3">
            {capabilities.slice(0, 3).map((item) => {
              const Icon = item.icon;
              return (
                <div className="flex gap-3" key={item.title}>
                  <Icon aria-hidden="true" className="mt-0.5 size-4 text-white/36" strokeWidth={1.6} />
                  <div>
                    <div className="text-[13px] font-semibold text-white/78">{item.title}</div>
                    <div className="mt-1 text-[12px] leading-5 text-white/38">{item.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function LineFigure({ variant }: { variant: (typeof featureFigures)[number]["variant"] }) {
  if (variant === "loop") {
    return (
      <svg aria-hidden="true" className="h-52 w-full" viewBox="0 0 360 210">
        <defs>
          <linearGradient id="loop-glow" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="rgba(154,162,255,0.35)" />
            <stop offset="1" stopColor="rgba(122,214,154,0.08)" />
          </linearGradient>
        </defs>
        <path d="M92 106C92 60 128 31 181 31C234 31 268 61 268 105C268 149 234 179 181 179C128 179 92 150 92 106Z" fill="none" stroke="url(#loop-glow)" strokeWidth="1.2" />
        <path d="M80 110C80 52 123 18 181 18C239 18 280 54 280 106C280 158 237 192 181 192C125 192 80 160 80 110Z" fill="none" stroke="rgba(255,255,255,0.08)" />
        {([
          [128, 58, 74, 54],
          [183, 32, 70, 52],
          [197, 112, 86, 58],
          [94, 128, 82, 52],
        ] as const).map(([x, y, width, height], index) => (
          <g key={`${x}-${y}`}>
            <rect fill="rgba(255,255,255,0.018)" height={height} rx="10" stroke="rgba(255,255,255,0.20)" width={width} x={x} y={y} />
            <path d={`M${x + 14} ${y + 16}H${x + width - 14}`} stroke="rgba(255,255,255,0.16)" />
            <circle cx={x + width - 16} cy={y + height - 14} fill={index === 1 ? "rgba(154,162,255,0.70)" : "rgba(255,255,255,0.18)"} r="2.5" />
          </g>
        ))}
      </svg>
    );
  }

  if (variant === "gate") {
    return (
      <svg aria-hidden="true" className="h-52 w-full" viewBox="0 0 360 210">
        <defs>
          <linearGradient id="gate-stroke" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="rgba(255,255,255,0.05)" />
            <stop offset="0.5" stopColor="rgba(255,255,255,0.24)" />
            <stop offset="1" stopColor="rgba(255,255,255,0.05)" />
          </linearGradient>
        </defs>
        {Array.from({ length: 15 }).map((_, index) => {
          const width = 168 - index * 8;
          const x = 96 + index * 7;
          const y = 48 + index * 6;
          return (
            <path
              d={`M${x} ${y}H${x + width}C${x + width + 8} ${y} ${x + width + 14} ${y + 6} ${x + width + 14} ${y + 14}V${y + 28}`}
              fill="none"
              key={index}
              stroke={index < 4 ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)"}
              strokeWidth="1"
            />
          );
        })}
        <path d="M64 132H296" stroke="url(#gate-stroke)" />
        <rect fill="rgba(122,214,154,0.10)" height="44" rx="12" stroke="rgba(122,214,154,0.28)" width="132" x="114" y="108" />
        <path d="M146 130L166 145L214 96" fill="none" stroke="rgba(122,214,154,0.70)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-52 w-full" viewBox="0 0 360 210">
      <defs>
        <linearGradient id="stack-fill" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="rgba(255,255,255,0.035)" />
          <stop offset="1" stopColor="rgba(255,255,255,0.005)" />
        </linearGradient>
      </defs>
      {Array.from({ length: 6 }).map((_, index) => {
        const y = 104 + index * 14;
        return (
          <path
            d={`M90 ${y}L180 ${y - 46}L270 ${y}L180 ${y + 46}Z`}
            fill={index === 0 ? "url(#stack-fill)" : "none"}
            key={index}
            stroke={index === 0 ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.12)"}
          />
        );
      })}
      <path d="M135 101C150 83 208 83 225 101" fill="none" stroke="rgba(255,255,255,0.18)" />
      <path d="M139 110H221" stroke="rgba(255,255,255,0.16)" />
      <path d="M151 119H209" stroke="rgba(255,255,255,0.12)" />
      <circle cx="180" cy="104" fill="rgba(154,162,255,0.36)" r="3" />
    </svg>
  );
}

function FeatureSystem() {
  return (
    <section id="features" className="border-y border-white/[0.08] bg-[#050607] py-24 text-white">
      <div className="mx-auto w-full max-w-[1080px] px-5 lg:px-0">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1fr] lg:items-end">
          <h2 className="max-w-[610px] text-[42px] font-semibold leading-[1.04] text-white sm:text-[58px]">
            Everything Harwick needs to run the desk.
          </h2>
          <p className="max-w-[520px] text-[22px] font-semibold leading-[1.3] text-white/68 sm:text-[26px]">
            Not a chatbot bolted onto a CRM. A brokerage operating loop with intake, memory, tools, approval, and receipts.
          </p>
        </div>

        <div className="mt-20 grid grid-cols-1 border-y border-white/[0.08] lg:grid-cols-3">
          {featureFigures.map((feature) => (
            <article className="border-white/[0.08] py-10 lg:border-l lg:px-8 first:lg:border-l-0" key={feature.title}>
              <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-white/18">
                {feature.fig}
              </div>
              <div className="mt-6">
                <LineFigure variant={feature.variant} />
              </div>
              <h3 className="mt-8 text-[18px] font-semibold text-white/88">{feature.title}</h3>
              <p className="mt-3 max-w-[310px] text-[14px] leading-7 text-white/44">{feature.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-20 grid grid-cols-2 gap-y-10 border-t border-white/[0.08] pt-12 md:grid-cols-4">
          {featureGroups.map((group) => (
            <nav className="grid content-start gap-3 pr-6" key={group.title}>
              <h3 className="mb-2 text-[14px] font-semibold text-white/88">{group.title}</h3>
              {group.links.map((link) => (
                <a className="text-[13px] text-white/40 transition hover:text-white" href="#request-access" key={`${group.title}-${link}`}>
                  {link}
                </a>
              ))}
            </nav>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlansSection() {
  return (
    <section id="plans" className="border-b border-white/[0.08] bg-[#050607] py-24 text-white">
      <div className="mx-auto w-full max-w-[1080px] px-5 lg:px-0">
        <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-[42px] font-semibold leading-[1.02] text-white sm:text-[56px]">
              Pricing
            </h2>
            <p className="mt-5 max-w-[520px] text-[15px] leading-7 text-white/48">
              Launch plans are simple on purpose. Provider costs pass through where applicable. Harwick is software, not legal, lending, or brokerage advice.
            </p>
          </div>
          <a className="inline-flex items-center gap-2 text-[13px] font-medium text-white/44 transition hover:text-white" href="#request-access">
            Need a brokerage rollout
            <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </div>

        <div className="mt-20 grid grid-cols-1 border-y border-white/[0.08] lg:grid-cols-3">
          {plans.map((plan) => (
            <article
              className="relative border-white/[0.08] py-8 lg:border-l lg:px-8 first:lg:border-l-0"
              key={plan.name}
            >
              {plan.featured ? (
                <span className="absolute right-0 top-8 rounded-full border border-[#f3c86a]/30 bg-[#f3c86a]/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.13em] text-[#f3c86a] lg:right-8">
                  Most teams
                </span>
              ) : null}
              <div className="text-[22px] font-semibold text-white">{plan.name}</div>
              <div className="mt-4 text-[38px] font-semibold leading-none text-white">{plan.price}</div>
              <p className="mt-5 max-w-[260px] text-[14px] leading-6 text-white/46">{plan.body}</p>
              <ul className="mt-9 min-h-[178px] space-y-3">
                {plan.points.map((point) => (
                  <li className="flex items-center gap-2 text-[13px] text-white/74" key={point}>
                    <Check aria-hidden="true" className="size-4 text-white/58" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
              <a
                className={
                  plan.featured
                    ? "mt-8 inline-flex h-10 w-full items-center justify-center rounded-full bg-white px-5 text-[13px] font-semibold transition hover:bg-white/88"
                    : "mt-8 inline-flex h-10 w-full items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.045] px-5 text-[13px] font-semibold text-white/82 transition hover:bg-white/[0.08] hover:text-white"
                }
                href="#request-access"
                style={plan.featured ? { color: "#050607" } : undefined}
              >
                Request access
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function RequestAccess() {
  return (
    <section id="request-access" className="border-b border-white/[0.08] bg-[#050607] py-28 text-white">
      <div className="mx-auto grid w-full max-w-[1080px] grid-cols-1 gap-12 px-5 lg:grid-cols-[0.9fr_1.1fr] lg:px-0">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.045] px-3 py-1.5 text-[11px] font-semibold text-white/50">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            Private access
          </div>
          <h2 className="mt-6 max-w-[560px] text-[48px] font-semibold leading-[1.02] text-white sm:text-[70px]">
            Built for serious teams. Available by launch fit.
          </h2>
          <p className="mt-7 max-w-[500px] text-[15px] leading-7 text-white/48">
            Harwick is invite-first while production provider validation finishes. Send your team size, lead sources, and CRM setup. We will respond with the right launch path.
          </p>
          <div className="mt-10 grid max-w-[520px] grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-white/[0.08] bg-white/[0.08] sm:grid-cols-3">
            {["No auto-send by default", "Operator approval on external writes", "Built for teams of 1-40"].map((item) => (
              <div className="bg-[#0b0d0e] px-4 py-4 text-[12px] leading-5 text-white/48" key={item}>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] border border-white/[0.12] bg-white/[0.045] p-5 shadow-[0_34px_90px_rgba(0,0,0,0.45)] sm:p-6">
          <form
            action="mailto:support@harwick.lol?subject=Harwick%20access%20request"
            className="grid gap-4"
            encType="text/plain"
            method="post"
          >
            {[
              { label: "name", name: "name", placeholder: "your name", type: "text" },
              { label: "brokerage", name: "brokerage", placeholder: "team or brokerage", type: "text" },
              { label: "email", name: "email", placeholder: "you@brokerage.com", type: "email" },
            ].map((field) => (
              <label className="block" key={field.name}>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                  {field.label}
                </span>
                <input
                  className="mt-2 h-12 w-full rounded-[12px] border border-white/[0.10] bg-black/24 px-4 text-[14px] text-white outline-none transition placeholder:text-white/26 focus:border-[#9aa2ff] focus:ring-[3px] focus:ring-[#9aa2ff]/18"
                  name={field.name}
                  placeholder={field.placeholder}
                  required={field.name === "email"}
                  type={field.type}
                />
              </label>
            ))}
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/38">
                what are you trying to fix?
              </span>
              <textarea
                className="mt-2 min-h-28 w-full rounded-[12px] border border-white/[0.10] bg-black/24 px-4 py-3 text-[14px] leading-6 text-white outline-none transition placeholder:text-white/26 focus:border-[#9aa2ff] focus:ring-[3px] focus:ring-[#9aa2ff]/18"
                name="use_case"
                placeholder="Instagram DMs, voice calls, FUB sync, routing, showings..."
              />
            </label>
            <Button className="h-11 rounded-full bg-white text-[#050607] hover:bg-white/90" type="submit">
              Send request
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
            <p className="text-[11px] leading-5 text-white/40">
              By requesting access you agree to the <a className="text-white/62 underline underline-offset-4" href="/terms">terms</a>,
              {" "}acknowledge the <a className="text-white/62 underline underline-offset-4" href="/privacy">privacy policy</a>, and can request deletion through{" "}
              <a className="text-white/62 underline underline-offset-4" href="/data-deletion">data deletion</a>.
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}

export function MarketingLandingPage(props: { isAuthenticated: boolean }) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#050607] text-white">
      <TopBar isAuthenticated={props.isAuthenticated} />

      <section className="relative overflow-hidden border-b border-white/[0.08] pt-16">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(71,190,121,0.20),transparent_34rem),linear-gradient(180deg,#050607_0%,#07100b_56%,#050607_100%)]"
        />

        <HomeEntry isAuthenticated={props.isAuthenticated} />
      </section>

      <WorkSystem />
      <SystemSection />
      <FeatureSystem />
      <PlansSection />
      <RequestAccess />

      <footer className="bg-[#050607] px-5 py-16 text-white lg:px-0">
        <div className="mx-auto grid w-full max-w-[1080px] grid-cols-2 gap-10 border-b border-white/[0.08] pb-16 md:grid-cols-[1.2fr_repeat(4,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <img
                alt=""
                className="h-8 w-auto"
                height={369}
                src="/harwick-gemini-logo.png"
                width={677}
              />
              <span className="text-[20px] font-semibold">Harwick</span>
            </div>
            <p className="mt-5 max-w-[280px] text-[13px] leading-6 text-white/42">
              AI chief of staff for real estate teams. Built as a multi-tenant brokerage platform with approval-first automation.
            </p>
          </div>

          {footerGroups.map((group) => (
            <nav className="grid content-start gap-3 text-[13px]" key={group.title}>
              <div className="mb-2 font-semibold text-white/86">{group.title}</div>
              {group.links.map((link) => (
                <a className="text-white/42 transition hover:text-white" href={link.href} key={`${group.title}-${link.href}-${link.label}`}>
                  {link.label}
                </a>
              ))}
            </nav>
          ))}
        </div>

        <div className="mx-auto mt-8 flex w-full max-w-[1080px] flex-col gap-4 text-[11px] text-white/34 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            <span>Terms, privacy, and Meta data deletion routes are live.</span>
          </div>
          <div>© 2026 Harwick. All rights reserved.</div>
        </div>
      </footer>
    </main>
  );
}
