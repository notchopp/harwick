"use client";

import {
  Bell,
  CheckSquare,
  Home,
  MessageSquareText,
  MoreHorizontal,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState, type ComponentType, type SVGProps } from "react";

import { initialsFor } from "../lib/initials";
import { cn } from "../lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const BOTTOM_NAV: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Queue", href: "/queue", icon: CheckSquare },
  { label: "Convos", href: "/conversations", icon: MessageSquareText },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "More", href: "/more", icon: MoreHorizontal },
];

function isActive(path: string, href: string): boolean {
  return path === href || (href !== "/" && path.startsWith(href));
}

export function MobileTopBar(props: {
  workspaceName: string;
  pathname: string;
  notificationCount?: number;
  notificationHref?: string;
}) {
  const notificationCount = Math.max(0, props.notificationCount ?? 0);
  const notificationHref = props.notificationHref ?? "/queue";
  const pageTitle = (() => {
    if (props.pathname.startsWith("/home")) return "Home";
    if (props.pathname.startsWith("/queue")) return "Queue";
    if (props.pathname.startsWith("/conversations")) return "Conversations";
    if (props.pathname.startsWith("/leads")) return "Leads";
    if (props.pathname.startsWith("/listings")) return "Listings";
    if (props.pathname.startsWith("/team")) return "Team";
    if (props.pathname.startsWith("/settings")) return "Settings";
    if (props.pathname.startsWith("/activity")) return "Activity";
    if (props.pathname.startsWith("/memory")) return "Memory";
    if (props.pathname.startsWith("/artifacts")) return "Artifacts";
    if (props.pathname.startsWith("/more")) return "More";
    return "Harwick";
  })();

  return (
    <header
      className="harwick-mobile-topbar sticky top-0 z-30 flex shrink-0 items-center gap-2 border-b border-[color:var(--panel-line-soft)] bg-[#0a0a0b]/95 px-3 py-2 backdrop-blur md:hidden"
      style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
    >
      <a
        href="/more"
        className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] px-1 py-1 transition active:bg-white/[0.04]"
        aria-label={`${props.workspaceName}, open menu`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center">
          <img alt="" className="size-7 object-contain" src="/harwick-gemini-logo.png" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {props.workspaceName}
          </span>
          <span className="block truncate text-[14px] font-semibold tracking-[-0.005em] text-white">
            {pageTitle}
          </span>
        </span>
      </a>
      <a
        href={notificationHref}
        className="relative flex size-9 items-center justify-center rounded-[10px] border border-white/[0.075] bg-[#1a1a1c] text-white/64 transition active:bg-[#222225]"
        aria-label={`${notificationCount} pending notifications`}
      >
        <Bell className="size-4" aria-hidden="true" />
        {notificationCount > 0 ? (
          <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-[#e69588] px-1 text-[9px] font-semibold leading-3.5 text-[#140b0a]">
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        ) : null}
      </a>
    </header>
  );
}

export function MobileBottomNav(props: { pathname: string }) {
  return (
    <nav
      className="harwick-mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 flex shrink-0 items-center justify-around border-t border-[color:var(--panel-line)] bg-[color:var(--panel-1)]/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(0.4rem, env(safe-area-inset-bottom))", paddingTop: "0.4rem" }}
    >
      {BOTTOM_NAV.map((item) => {
        const Icon = item.icon;
        const active = isActive(props.pathname, item.href);
        return (
          <a
            key={item.label}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-semibold transition-colors",
              active ? "text-[color:var(--graphite-text)]" : "text-[color:var(--graphite-text-faint)]",
            )}
          >
            <span className="relative flex size-7 items-center justify-center">
              {active ? (
                <motion.span
                  layoutId="mobile-nav-active"
                  className="absolute inset-0 rounded-[8px] bg-[color:var(--panel-3)]"
                  transition={{ type: "spring", stiffness: 440, damping: 32 }}
                />
              ) : null}
              <Icon
                className={cn(
                  "relative size-4",
                  active ? "text-[var(--sage)]" : "text-[color:var(--graphite-text-muted)]",
                )}
                aria-hidden="true"
                strokeWidth={2}
              />
            </span>
            {item.label}
          </a>
        );
      })}
    </nav>
  );
}

/** Pulls current pathname client-side without next/navigation to keep this component
 * independent of router context — works in both app and pages routers.
 * Always initializes to "/" so SSR and the first client render agree; the real
 * pathname swaps in after hydration via useEffect (avoids hydration mismatch). */
export function usePathname(): string {
  const [pathname, setPathname] = useState<string>("/");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setPathname(window.location.pathname);
    update();
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return pathname;
}

/** Initials helper exported in case other mobile surfaces need it (e.g. /more profile row). */
export { initialsFor };
