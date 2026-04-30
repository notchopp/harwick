"use client";

import {
  ChevronDown,
  Clock3,
  Home,
  LayoutGrid,
  LogOut,
  MessageSquare,
  Phone,
  RadioTower,
  Settings,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { cn } from "../lib/utils";
import { createBrowserSupabaseClient } from "../lib/supabase/browser-client";

type AppShellProps = {
  activeItem?: string;
  children: ReactNode;
  title?: string;
};

type NavigationItem = {
  label: string;
  count?: string;
  alert?: boolean;
  active?: boolean;
  href: string;
  icon: typeof LayoutGrid;
};

type GreenFamily = {
  h: number;
  lBase: number;
  name: string;
  s: number;
};

type SidebarMaterial = {
  borderColor: string;
  accentGradient: string;
};

const greenFamilies: GreenFamily[] = [
  { h: 132, lBase: 0.13, name: "pine", s: 0.48 },
  { h: 141, lBase: 0.16, name: "sage", s: 0.42 },
  { h: 151, lBase: 0.14, name: "emerald", s: 0.54 },
  { h: 161, lBase: 0.12, name: "verdigris", s: 0.46 },
  { h: 118, lBase: 0.14, name: "moss", s: 0.4 },
];

function fnv1a(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function lcg(seed: number) {
  let state = seed || 1;

  return function rng() {
    state = Math.imul(48271, state) | 0;
    return (state >>> 0) / 0xffffffff;
  };
}

function hslToRgb(h: number, s: number, l: number): [string, string, string] {
  const normalizedHue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (normalizedHue < 60) {
    r = c;
    g = x;
  } else if (normalizedHue < 120) {
    r = x;
    g = c;
  } else if (normalizedHue < 180) {
    g = c;
    b = x;
  } else if (normalizedHue < 240) {
    g = x;
    b = c;
  } else if (normalizedHue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  const toHex = (value: number) => {
    const hex = Math.round((m + value) * 255).toString(16);
    return hex.length === 1 ? `0${hex}` : hex;
  };

  return [toHex(r), toHex(g), toHex(b)] as [string, string, string];
}

function generateSidebarMaterial(seed: string): SidebarMaterial {
  const hash = fnv1a(seed);
  const rng = lcg(hash);
  const family = greenFamilies[Math.floor(rng() * greenFamilies.length)]!;

  const hueVariation = (rng() - 0.5) * 8;
  const h = family.h + hueVariation;
  const s = family.s + (rng() - 0.5) * 0.08;
  const l = family.lBase + (rng() - 0.5) * 0.04;

  const [r, g, b] = hslToRgb(h, s, l);
  const rgb = `#${r}${g}${b}`;

  const brightL = Math.min(family.lBase + 0.1, 0.35);
  const [br, bg, bb] = hslToRgb(h, s, brightL);
  const brightRgb = `#${br}${bg}${bb}`;

  return {
    borderColor: rgb,
    accentGradient: `linear-gradient(135deg, ${rgb}, ${brightRgb})`,
  };
}

const operationItems: NavigationItem[] = [
  { label: "Work Queue", count: "7", href: "/home", icon: LayoutGrid },
  { label: "Leads", count: "3", alert: true, href: "/leads", icon: UsersRound },
  { label: "Conversations", href: "/home", icon: MessageSquare },
  { label: "Listings", href: "/prestige-realty/listings", icon: Home },
  { label: "Voice Calls", href: "/home", icon: Phone },
];

const systemItems: NavigationItem[] = [
  { label: "Integrations", href: "/home", icon: RadioTower },
  { label: "Activity Log", href: "/home", icon: Clock3 },
  { label: "Settings", href: "/settings", icon: Settings },
];

function NavGroup(props: { activeItem: string; label: string; items: NavigationItem[] }) {
  return (
    <div>
      <div className="px-3 pb-1.5 pt-3.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/[0.22]">
        {props.label}
      </div>
      <div className="space-y-0.5">
        {props.items.map((item) => {
          const Icon = item.icon;
          const isActive = item.label === props.activeItem;

          return (
            <a
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[34px] items-center gap-2.5 rounded-lg px-3 text-[12.5px] transition-all duration-[130ms]",
                isActive
                  ? "bg-white/10 font-semibold text-white"
                  : "font-medium text-white/[0.46] hover:bg-white/[0.055] hover:text-white/[0.78]",
              )}
              href={item.href}
              key={item.label}
            >
              <Icon 
                aria-hidden="true" 
                className={cn(
                  "h-[15px] w-[15px] shrink-0 transition-opacity duration-[130ms]",
                  isActive ? "opacity-100" : "opacity-65"
                )}
                strokeWidth={1.8} 
              />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count ? (
                <span
                  className={cn(
                    "rounded-full px-[7px] py-px text-[10px] font-semibold leading-4",
                    item.alert
                      ? "bg-oxblood text-white"
                      : "bg-harwick-brass text-harwick-ink",
                  )}
                >
                  {item.count}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function StatusDot(props: { label: string; tone?: "ok" | "warn" | "risk" }) {
  const tone = props.tone ?? "ok";

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          tone === "ok" && "bg-qualified",
          tone === "warn" && "bg-warm",
          tone === "risk" && "bg-hot",
        )}
      />
      {props.label}
    </div>
  );
}

export function AppShell(props: AppShellProps) {
  const activeItem = props.activeItem ?? "Work Queue";
  const title = props.title ?? activeItem;
  const [isLoading, setIsLoading] = useState(false);
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  
  const material = useMemo(() => generateSidebarMaterial("harwick-sidebar"), []);

  async function handleLogout() {
    setIsLoading(true);
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside 
        className="flex h-screen w-[220px] shrink-0 flex-col px-3 py-8 text-white"
        style={{
          background: `linear-gradient(180deg, rgba(26,42,32,0.96), rgba(20,32,24,0.98))`,
          borderRight: `1px solid ${material.borderColor}40`,
        }}
      >
        <a className="mb-5 px-3 pb-7" href="/home" style={{ borderColor: `${material.borderColor}20`, borderBottomWidth: "1px" }}>
          <span className="harwick-wordmark block text-[21px] leading-none text-white">
            Harwick
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-white/[0.28]">
            real estate ai layer
          </span>
        </a>

        <nav aria-label="primary navigation" className="flex flex-1 flex-col gap-0.5">
          <NavGroup activeItem={activeItem} items={operationItems} label="Operations" />
          <div className="mt-2">
            <NavGroup activeItem={activeItem} items={systemItems} label="System" />
          </div>
        </nav>

        <div className="mt-4 space-y-3 px-2 pt-5" style={{ borderTop: `1px solid ${material.borderColor}20` }}>
          <button
            className="flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[12.5px] font-medium text-white/[0.46] transition-colors hover:bg-white/[0.055] hover:text-white/[0.78] disabled:opacity-50"
            disabled={isLoading}
            onClick={() => {
              void handleLogout();
            }}
            type="button"
          >
            <LogOut aria-hidden="true" className="h-[15px] w-[15px] shrink-0 opacity-65" strokeWidth={1.8} />
            <span>{isLoading ? "signing out..." : "sign out"}</span>
          </button>

          <button className="flex w-full items-center gap-2.5 text-left" type="button">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg font-display text-sm font-semibold text-white"
              style={{ background: material.accentGradient }}
            >
              P
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-white/[0.62]">
                Prestige Realty
              </span>
              <span className="block truncate text-[10px] text-white/[0.28]">Admin</span>
            </span>
            <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-white/[0.24]" />
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[58px] shrink-0 items-center gap-4 border-b border-border bg-surface px-8">
          <h1 className="font-display text-[18px] font-medium leading-none text-foreground">
            {title}
          </h1>
          <div className="ml-auto flex items-center gap-[18px]">
            <StatusDot label="Meta Live" />
            <StatusDot label="Voice Active" />
            <StatusDot label="CRM Syncing" tone="warn" />
          </div>
        </header>

        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto px-8 py-[26px]">
          {props.children}
        </main>
      </div>
    </div>
  );
}
