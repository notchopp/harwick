"use client";

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Home,
  LayoutGrid,
  MessageSquare,
  Phone,
  RadioTower,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

import { generateGreenMaterial } from "../lib/green-material";
import { cn } from "../lib/utils";

type AppShellProps = {
  activeItem?: string;
  children: ReactNode;
  title?: string;
  workspaceName?: string;
};

type NavigationItem = {
  badgeTone?: "brass" | "dim" | "oxblood";
  label: string;
  count?: string;
  href: string;
  icon: typeof LayoutGrid;
};

const operationItems: NavigationItem[] = [
  { label: "Work Queue", count: "7", badgeTone: "brass", href: "/home", icon: LayoutGrid },
  { label: "Leads", count: "3", badgeTone: "oxblood", href: "/leads", icon: UsersRound },
  { label: "Conversations", count: "12", badgeTone: "dim", href: "/conversations", icon: MessageSquare },
  { label: "Listings", href: "/listings", icon: Home },
  { label: "Voice Calls", count: "2", badgeTone: "oxblood", href: "/home", icon: Phone },
];

const systemItems: NavigationItem[] = [
  { label: "Integrations", href: "/integrations", icon: RadioTower },
  { label: "Activity Log", href: "/activity", icon: Clock3 },
];

const accountItems: NavigationItem[] = [
  { label: "Profile & Settings", href: "/settings", icon: UserRound },
];

function NavGroup(props: { activeItem: string; collapsed?: boolean; label: string; items: NavigationItem[] }) {
  return (
    <div>
      {props.collapsed ? null : (
        <div className="px-3 pb-1.5 pt-3.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/[0.22]">
          {props.label}
        </div>
      )}
      <div className="space-y-0.5">
        {props.items.map((item) => {
          const Icon = item.icon;
          const isActive = item.label === props.activeItem;

          return (
            <a
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-[35px] items-center gap-2.5 rounded-[10px] border px-3 text-[12.5px] transition-all duration-[160ms]",
                props.collapsed && "justify-center px-0",
                isActive
                  ? "border-white/10 bg-white/[0.115] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_20px_rgba(0,0,0,0.12)]"
                  : "border-transparent font-medium text-white/[0.31] hover:border-white/[0.055] hover:bg-white/[0.055] hover:text-white/[0.68]",
              )}
              href={item.href}
              key={item.label}
              title={item.label}
            >
              <Icon 
                aria-hidden="true" 
                className={cn(
                  "h-[15px] w-[15px] shrink-0 transition-opacity duration-[130ms]",
                  isActive ? "opacity-100" : "opacity-42"
                )}
                strokeWidth={1.8} 
              />
              {props.collapsed ? null : <span className="min-w-0 flex-1 truncate">{item.label}</span>}
              {item.count && !props.collapsed ? (
                <span
                  className={cn(
                    "rounded-full px-[7px] py-px text-[10px] font-semibold leading-4",
                    item.badgeTone === "oxblood" && "bg-oxblood text-white",
                    item.badgeTone === "brass" && "bg-harwick-brass text-harwick-ink",
                    item.badgeTone === "dim" && "bg-white/10 text-white/[0.45]",
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

export function AppShell(props: AppShellProps) {
  const activeItem = props.activeItem ?? "Work Queue";
  const workspaceName = props.workspaceName ?? "Prestige Realty";
  const [activeRole, setActiveRole] = useState<"Agent" | "Broker" | "Lead">("Agent");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarMaterial = useMemo(() => generateGreenMaterial("harwick-sidebar"), []);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "harwick-fade-in relative flex h-screen shrink-0 flex-col overflow-hidden text-white transition-[width] duration-300",
          sidebarOpen ? "w-[220px]" : "w-[76px]",
        )}
      >
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: sidebarMaterial.pageBackground }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(6,18,12,0.16)_72%,rgba(4,12,8,0.28)_100%)]"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[linear-gradient(125deg,rgba(255,255,255,0.055)_0%,transparent_38%,rgba(0,0,0,0.12)_100%)]"
        />

        <div className={cn("relative z-10", sidebarOpen ? "mb-4" : "mb-3")}>
          <div
            className={cn(
              sidebarOpen
                ? "flex items-start justify-between gap-3 px-5 pb-[18px] pt-[24px]"
                : "flex flex-col items-center justify-center gap-2 px-2 pt-[20px]",
            )}
          >
            <a
              className={cn(
                sidebarOpen ? "min-w-0 flex-1" : "flex items-center justify-center text-center",
              )}
              href="/home"
              title="Harwick"
            >
              <span className="harwick-wordmark block text-[22px] font-medium leading-none tracking-[0.04em] text-white">
                {sidebarOpen ? "Harwick" : "H"}
              </span>
            </a>
            <button
              aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/38 transition-colors hover:bg-white/10 hover:text-white/78",
                !sidebarOpen && "mx-auto",
              )}
              onClick={() => setSidebarOpen((current) => !current)}
              type="button"
            >
              {sidebarOpen ? <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} /> : <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} />}
            </button>
          </div>
        </div>

        {sidebarOpen ? (
          <div className="relative z-10 mx-2.5 mb-3.5 flex rounded-[9px] bg-white/[0.06] p-[3px]">
            {(["Agent", "Lead", "Broker"] as const).map((role) => (
              <button
                aria-pressed={activeRole === role}
                className={cn(
                  "flex-1 rounded-[7px] py-[5px] text-[10px] tracking-[0.02em] transition-all",
                  activeRole === role ? "bg-white/[0.12] text-white" : "text-white/[0.38]",
                )}
                key={role}
                onClick={() => setActiveRole(role)}
                type="button"
              >
                {role}
              </button>
            ))}
          </div>
        ) : null}

        <nav aria-label="primary navigation" className="relative z-10 flex flex-1 flex-col overflow-y-auto px-2">
          <NavGroup activeItem={activeItem} collapsed={!sidebarOpen} items={operationItems} label="Operations" />
          <div className="mt-2">
            <NavGroup activeItem={activeItem} collapsed={!sidebarOpen} items={systemItems} label="System" />
          </div>
          <div className="mt-2">
            <NavGroup activeItem={activeItem} collapsed={!sidebarOpen} items={accountItems} label="Account" />
          </div>
        </nav>

        <div className={cn("relative z-10 mt-2 border-t border-white/[0.08] pb-5 pt-4", sidebarOpen ? "px-4" : "px-2")}>
          <button className={cn("flex w-full items-center text-left", sidebarOpen ? "gap-2.5" : "justify-center")} type="button">
            <span className="flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-[9px] bg-harwick-brass font-display text-[15px] font-semibold text-harwick-ink">
              P
            </span>
            {sidebarOpen ? (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] font-medium text-white/[0.72]">
                    {workspaceName}
                  </span>
                  <span className="block truncate text-[10px] text-white/[0.28]">{activeRole} · Sarah Kim</span>
                </span>
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-white/[0.24]" strokeWidth={1.8} />
              </>
            ) : null}
          </button>
        </div>
      </aside>

      <div className="harwick-fade-in-delayed flex min-w-0 flex-1 flex-col overflow-hidden">
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">{props.children}</main>
      </div>
    </div>
  );
}
