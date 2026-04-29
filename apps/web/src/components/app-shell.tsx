import {
  Bell,
  Bot,
  Building2,
  CircleDot,
  Command,
  Inbox,
  PlugZap,
  Route,
  Settings,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "./ui/button";

const navigationItems = [
  { label: "Work queue", icon: Inbox, active: true },
  { label: "Pipeline", icon: Route, active: false },
  { label: "Automation", icon: Bot, active: false },
  { label: "Integrations", icon: PlugZap, active: false },
  { label: "Settings", icon: Settings, active: false },
] as const;

type AppShellProps = {
  children: ReactNode;
};

export function AppShell(props: AppShellProps) {
  return (
    <div className="min-h-screen p-3 text-foreground sm:p-4">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1520px] grid-cols-1 overflow-hidden rounded-[2rem] border border-border bg-surface/82 shadow-[0_24px_80px_rgba(24,24,22,0.10)] backdrop-blur-xl lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-border bg-surface-muted/55 p-4 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-white">
                <Building2 className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold">Realty Ops</p>
                <p className="text-xs text-muted">internal build</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" aria-label="Open notifications">
              <Bell className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-6 rounded-3xl border border-border bg-surface p-4">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">
              Workspace
            </p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Houston brokerage</p>
                <p className="text-xs text-muted">owner view</p>
              </div>
              <CircleDot className="h-4 w-4 text-qualified" aria-hidden="true" />
            </div>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto lg:block lg:space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  className={
                    item.active
                      ? "flex min-w-fit items-center gap-3 rounded-2xl bg-accent px-3 py-2.5 text-sm font-medium text-white"
                      : "flex min-w-fit items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
                  }
                  href="#"
                  key={item.label}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </a>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-col">
          <header className="flex flex-col gap-4 border-b border-border bg-surface/72 px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
                Lead operating system
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-[-0.01em] sm:text-3xl">
                qualify, assign, follow up
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary">
                <Command className="h-4 w-4" aria-hidden="true" />
                Command
              </Button>
              <Button>Review hot leads</Button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-4 sm:p-5 lg:p-8">{props.children}</main>
        </div>
      </div>
    </div>
  );
}
