"use client";

import {
  Bell,
  Brain,
  Building2,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  FileText,
  Hash,
  History,
  MessageSquareText,
  RefreshCw,
  Search,
  Settings,
  Bot,
  Users,
  UsersRound,
} from "lucide-react";
import type { WorkspaceRole } from "@realty-ops/core";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useEffect, useState } from "react";

import { HarwickRail } from "./harwick-rail/harwick-rail";
import { MobileBottomNav, MobileTopBar, usePathname } from "./mobile-nav";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import { cn } from "../lib/utils";

type AppShellProps = {
  activeItem?: string;
  children: ReactNode;
  memberName?: string;
  memberRole?: string;
  operatorRole?: WorkspaceRole;
  notificationCount?: number;
  notificationHref?: string;
  sidebarPanel?: ReactNode;
  title?: string;
  tone?: "default" | "dashboardDark";
  workspaceId?: string;
  workspaceName?: string;
};

type NavigationItem = {
  badge?: number;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
};

const navigation: NavigationItem[] = [
  { label: "Assistant", href: "/home", icon: Bot },
  { label: "Conversations", href: "/conversations", icon: MessageSquareText },
  { label: "Channels", href: "/channels", icon: Hash },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Queue", href: "/queue", icon: CheckSquare },
  { label: "Listings", href: "/listings", icon: Building2 },
  { label: "Team", href: "/team", icon: UsersRound },
];

const workspaceNavigation: NavigationItem[] = [
  { label: "Artifacts", href: "/artifacts", icon: FileText },
  { label: "Memory", href: "/memory", icon: Brain },
];

const secondaryNavigation: NavigationItem[] = [
  { label: "Activity", href: "/activity", icon: History },
  { label: "Settings", href: "/settings", icon: Settings },
];

const SIDEBAR_STATE_STORAGE_KEY = "harwick-sidebar-state";

function formatRoleLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Member";
}

function initialsFor(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "HW";
}

function NavLink(props: {
  activeItem: string;
  collapsed: boolean;
  item: NavigationItem;
  tone: "default" | "dashboardDark";
}) {
  const Icon = props.item.icon;
  const activeAliases: Record<string, string[]> = {
    Activity: ["Activity", "Activity Log"],
    Assistant: ["Assistant", "Home"],
    Conversations: ["Conversations", "Threads"],
    Queue: ["Queue", "Tasks"],
    Settings: ["Settings", "Profile & Settings"],
  };
  const isActive = (activeAliases[props.item.label] ?? [props.item.label]).includes(props.activeItem);
  const darkTone = props.tone === "dashboardDark";
  const darkActive = "border-white/10 bg-white/[0.06] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]";
  const darkInactive = "border-transparent text-white/58 hover:bg-white/5 hover:text-white";

  const link = (
    <a
      className={cn(
        "harwick-nav-link group flex items-center gap-2 rounded-[11px] border py-2 text-sm font-medium transition-[background-color,border-color,color]",
        props.collapsed ? "justify-center px-2" : "px-2.5",
        isActive
          ? darkTone
            ? darkActive
            : "border-harwick-ink bg-harwick-ink text-harwick-paper"
          : darkTone
            ? darkInactive
            : "border-transparent text-harwick-ink-soft hover:bg-harwick-linen hover:text-harwick-ink",
      )}
      data-active={isActive ? "true" : "false"}
      href={props.item.href}
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-[9px] transition-colors",
          props.collapsed ? "size-8" : "size-7",
          isActive
            ? darkTone
              ? "bg-white/[0.08] text-[color:var(--brass-accent)]"
              : "bg-harwick-paper/14 text-harwick-paper"
            : darkTone
              ? "text-white/48 group-hover:text-white/72"
              : "text-harwick-ink-soft group-hover:text-harwick-ink",
        )}
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.85} />
        {props.collapsed && props.item.badge !== undefined ? (
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-oxblood" />
        ) : null}
      </span>
      {props.collapsed ? null : <span className="flex-1">{props.item.label}</span>}
      {props.collapsed || props.item.badge === undefined ? null : (
        <Badge
          className={cn(
            "harwick-nav-link-badge h-5 min-w-5 justify-center rounded-full px-1.5 text-[11px]",
            isActive
              ? darkTone
                ? "border-transparent bg-[#8f5135] text-white shadow-none"
                : "border-harwick-paper/15 bg-harwick-paper/12 text-harwick-paper"
              : darkTone
                ? "border-transparent bg-[#8f2d35] text-white shadow-none"
                : "bg-harwick-paper text-harwick-ink-soft",
          )}
          tone="hot"
          variant="ghost"
        >
          {props.item.badge}
        </Badge>
      )}
    </a>
  );

  if (!props.collapsed) {
    return link;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{props.item.label}</TooltipContent>
    </Tooltip>
  );
}

export function AppShell(props: AppShellProps) {
  const activeItem = props.activeItem ?? "Home";
  const tone = props.tone ?? "dashboardDark";
  const workspaceName = props.workspaceName ?? "Workspace";
  const memberName = props.memberName?.trim() || "Workspace member";
  const memberRole = formatRoleLabel(props.memberRole?.trim() || "member");
  const notificationCount = Math.max(0, props.notificationCount ?? 0);
  const notificationHref = props.notificationHref ?? "/queue";
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const darkTone = tone === "dashboardDark";

  useEffect(() => {
    const storedState = window.localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY);
    setIsSidebarCollapsed(storedState === "collapsed");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      SIDEBAR_STATE_STORAGE_KEY,
      isSidebarCollapsed ? "collapsed" : "expanded",
    );
  }, [isSidebarCollapsed]);

  return (
    <div className={cn("harwick-theme-root harwick-app-shell min-h-screen", darkTone ? "harwick-shell-dark bg-[var(--panel-0)] text-white" : "bg-harwick-shell text-harwick-ink")}>
      {darkTone ? (
        <MobileTopBar
          workspaceName={workspaceName}
          pathname={pathname}
          notificationCount={notificationCount}
          notificationHref={notificationHref}
        />
      ) : null}
      <div className={cn("harwick-app-frame flex min-h-screen overflow-hidden", darkTone ? "gap-2.5 p-2.5 max-md:gap-0 max-md:p-0 max-md:pb-16" : "")}>
        <aside
          className={cn(
            "harwick-sidebar hidden shrink-0 flex-col transition-[width] duration-200 md:flex",
            isSidebarCollapsed ? "w-[78px]" : "w-[224px]",
            darkTone
              ? "rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top),var(--panel-shadow-lift)]"
              : "border-r border-transparent bg-transparent",
          )}
        >
          <div className="flex h-14 items-center px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={isSidebarCollapsed ? workspaceName : undefined}
                className={cn(
                  "harwick-workspace-switcher flex h-10 w-full items-center rounded-[11px] border border-transparent text-left transition",
                  isSidebarCollapsed ? "justify-center px-0" : "justify-between gap-2 px-2",
                  darkTone ? "text-white hover:bg-white/[0.04]" : "hover:bg-harwick-linen/80",
                )}
                type="button"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-10 shrink-0 items-center justify-center">
                    <img alt="" className="size-8 object-contain" src="/harwick-gemini-logo.png" />
                  </span>
                  <span className={cn("min-w-0", isSidebarCollapsed && "hidden")}>
                    <span className={cn("block truncate text-sm font-medium", darkTone ? "text-white" : "text-harwick-ink")}>{workspaceName}</span>
                    <span className={cn("block text-[11px]", darkTone ? "text-white/46" : "text-harwick-ink-soft")}>{memberRole}</span>
                  </span>
                </div>
                {isSidebarCollapsed ? null : (
                  <ChevronDown aria-hidden="true" className={cn("size-4", darkTone ? "text-white/42" : "text-harwick-ink-soft")} />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
              <DropdownMenuItem className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded bg-harwick-ink text-xs font-semibold text-harwick-paper">
                  {workspaceName.charAt(0)}
                </span>
                <span>{workspaceName}</span>
                <Check aria-hidden="true" className="ml-auto size-4" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings aria-hidden="true" className="mr-2 size-4" />
                Workspace settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
 
        <nav className={cn("flex-1 space-y-1 py-3", isSidebarCollapsed ? "px-1.5" : "px-2")}>
          {navigation.map((item) => (
            <NavLink activeItem={activeItem} collapsed={isSidebarCollapsed} item={item} key={item.label} tone={tone} />
          ))}

          <div className="pt-4">
            <p className={cn("px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em]", darkTone ? "text-white/34" : "text-muted-subtle", isSidebarCollapsed && "hidden")}>
              Workspace
            </p>
            <div className="space-y-1">
              {workspaceNavigation.map((item) => (
                <NavLink activeItem={activeItem} collapsed={isSidebarCollapsed} item={item} key={item.label} tone={tone} />
              ))}
            </div>
          </div>

          <div className="pt-4">
            <p className={cn("px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em]", darkTone ? "text-white/34" : "text-muted-subtle", isSidebarCollapsed && "hidden")}>
              System
            </p>
            <div className="space-y-1">
              {secondaryNavigation.map((item) => (
                <NavLink activeItem={activeItem} collapsed={isSidebarCollapsed} item={item} key={item.label} tone={tone} />
              ))}
            </div>
          </div>

          {props.sidebarPanel === undefined || isSidebarCollapsed ? null : (
            <div className="pt-4">
              <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-subtle">
                Context
              </p>
              {props.sidebarPanel}
            </div>
          )}

        </nav>
        <div className={cn("mt-auto p-2", isSidebarCollapsed ? "pb-3" : "pb-4")}>
          {isSidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "harwick-member-button flex h-10 w-full items-center justify-center rounded-[12px] border border-transparent text-left transition",
                    darkTone ? "hover:bg-white/[0.04]" : "hover:bg-harwick-linen",
                  )}
                  type="button"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className={cn("text-xs", darkTone ? "bg-white/[0.06] text-white" : "bg-harwick-ink text-harwick-paper")}>
                      {initialsFor(memberName)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">{memberName}</p>
                <p className="text-xs text-muted-foreground">{memberRole}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <button className={cn("harwick-member-button flex w-full items-center gap-2 rounded-[12px] border border-transparent px-2 py-2 text-left transition", darkTone ? "hover:bg-white/[0.04]" : "hover:bg-harwick-linen")} type="button">
              <Avatar className="size-7">
                <AvatarFallback className={cn("text-xs", darkTone ? "bg-white/[0.06] text-white" : "bg-harwick-ink text-harwick-paper")}>
                  {initialsFor(memberName)}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", darkTone ? "text-white" : "text-harwick-ink")}>{memberName}</span>
                <span className={cn("block truncate text-xs", darkTone ? "text-white/42" : "text-stone")}>{memberRole}</span>
              </span>
            </button>
          )}
        </div>
        </aside>

        <main className={cn("harwick-region harwick-main-region flex min-w-0 flex-1 flex-col overflow-hidden", darkTone ? "rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)] shadow-[var(--panel-inset-top),var(--panel-shadow-lift)]" : "")}>
          <header className={cn("harwick-topbar hidden h-14 shrink-0 items-center justify-between px-4 sm:px-6 md:flex", darkTone ? "bg-transparent" : "bg-transparent")}>
          <div className="flex min-w-0 items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  className={cn(
                    "harwick-topbar-icon hidden size-7 rounded-[8px] md:inline-flex",
                    darkTone ? "text-white/44 hover:bg-white/[0.04] hover:text-white/82" : "text-harwick-ink-soft hover:bg-harwick-linen hover:text-harwick-ink",
                  )}
                  onClick={() => setIsSidebarCollapsed((current) => !current)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  {isSidebarCollapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronLeft aria-hidden="true" className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}</TooltipContent>
            </Tooltip>
            <a className="flex items-center gap-2 md:hidden" href="/home">
              <img alt="" className="size-6 object-contain" src="/harwick-gemini-logo.png" />
              <span className={cn("harwick-wordmark text-xl", darkTone ? "text-white" : "text-harwick-ink")}>Harwick</span>
            </a>
            <div className="relative hidden sm:block">
              <Search aria-hidden="true" className={cn("absolute left-3 top-1/2 size-4 -translate-y-1/2", darkTone ? "text-white/40" : "text-harwick-ink-soft")} />
              <input
                className={cn("harwick-topbar-search h-10 w-[320px] rounded-[12px] border pl-9 pr-16 text-sm outline-none transition", darkTone ? "border-white/7 bg-white/[0.03] text-white placeholder:text-white/34" : "harwick-control border-transparent bg-harwick-linen/85 text-harwick-ink")}
                placeholder="Search or ask Harwick..."
                type="text"
              />
               <kbd className={cn("pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-[8px] border px-1.5 py-0.5 text-[10px] md:block", darkTone ? "border-white/7 bg-white/[0.03] text-white/38" : "border-harwick-border/80 bg-harwick-paper text-harwick-ink-soft")}>
                Ctrl K
              </kbd>
            </div>
          </div>

          <div className="flex items-center gap-2">
             <span className={cn("harwick-role-pill hidden items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] shadow-[var(--shadow-control)] sm:inline-flex", darkTone ? "border-white/7 bg-white/[0.03] text-white/58 shadow-none" : "border-harwick-border/80 bg-harwick-paper text-harwick-ink-soft")}>
              <CircleDot aria-hidden="true" className="size-3 text-sage" />
              {memberRole}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  asChild
                  className={cn("harwick-topbar-icon relative size-9 rounded-[10px]", darkTone ? "text-white/58 hover:bg-white/[0.04] hover:text-white" : "text-harwick-ink-soft hover:bg-harwick-linen hover:text-harwick-ink")}
                  size="icon"
                  variant="ghost"
                >
                  <a href={notificationHref} aria-label={`${notificationCount} pending notifications`}>
                    <Bell aria-hidden="true" className="size-4" />
                    {notificationCount > 0 ? (
                      <span className="absolute right-1 top-1 flex min-w-3.5 items-center justify-center rounded-full bg-oxblood px-1 text-[9px] font-semibold leading-3.5 text-white">
                        {notificationCount > 9 ? "9+" : notificationCount}
                      </span>
                    ) : null}
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Notifications</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button className={cn("harwick-topbar-icon size-9 rounded-[10px]", darkTone ? "text-white/58 hover:bg-white/[0.04] hover:text-white" : "text-harwick-ink-soft hover:bg-harwick-linen hover:text-harwick-ink")} size="icon" variant="ghost">
                  <RefreshCw aria-hidden="true" className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="sr-only">{props.title ?? activeItem}</div>
          {props.children}
        </div>
        </main>
      </div>
      {darkTone ? <MobileBottomNav pathname={pathname} /> : null}
      {props.workspaceId !== undefined && props.operatorRole !== undefined ? (
        <HarwickRail workspaceId={props.workspaceId} operatorRole={props.operatorRole} />
      ) : null}
    </div>
  );
}
