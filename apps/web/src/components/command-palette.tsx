"use client";

import { Bot, CheckSquare, Building2, History, Home, MessageSquareText, Mic, MoreHorizontal, Settings, Users, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — tinykeys ships types but the package.json `exports` map blocks
// TypeScript from resolving them through ESM. Runtime works fine.
import { tinykeys } from "tinykeys";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "./ui/command";

type PaletteRow = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Home;
  onSelect: () => void;
  group: "nav" | "voice" | "system";
  keywords?: string;
};

/** Mounted globally. Opens on ⌘K / Ctrl+K from any page. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const unsub = (tinykeys as (target: Window, map: Record<string, (e: KeyboardEvent) => void>) => () => void)(window, {
      "$mod+k": (event: KeyboardEvent) => {
        event.preventDefault();
        setOpen((current: boolean) => !current);
      },
      "$mod+/": (event: KeyboardEvent) => {
        event.preventDefault();
        setOpen((current: boolean) => !current);
      },
    });
    return () => unsub();
  }, []);

  const go = (href: string) => () => {
    setOpen(false);
    if (typeof window !== "undefined") {
      window.location.href = href;
    }
  };

  const rows: PaletteRow[] = [
    { id: "nav:home", label: "Home", hint: "Today's queue", icon: Home, onSelect: go("/home"), group: "nav" },
    { id: "nav:queue", label: "Queue", hint: "Approvals + holds", icon: CheckSquare, onSelect: go("/queue"), group: "nav" },
    { id: "nav:conversations", label: "Conversations", hint: "Live threads", icon: MessageSquareText, onSelect: go("/conversations"), group: "nav" },
    { id: "nav:leads", label: "Leads", hint: "Kanban + table", icon: Users, onSelect: go("/leads"), group: "nav" },
    { id: "nav:listings", label: "Listings", hint: "Inventory + verification", icon: Building2, onSelect: go("/listings"), group: "nav" },
    { id: "nav:team", label: "Team", hint: "Roster + capacity", icon: UsersRound, onSelect: go("/team"), group: "nav" },
    { id: "nav:more", label: "More", hint: "Settings, memory, activity", icon: MoreHorizontal, onSelect: go("/more"), group: "nav" },
    { id: "voice:talk", label: "Talk to Harwick", hint: "Voice — phone, car, anywhere", icon: Mic, onSelect: go("/v?voice=1"), group: "voice", keywords: "siri voice mic dictate" },
    { id: "voice:setup", label: "Set up Siri Shortcut", hint: "Hey Siri, ask Harwick…", icon: Bot, onSelect: go("/help/voice"), group: "voice", keywords: "siri shortcut hey" },
    { id: "sys:activity", label: "Activity log", hint: "Every AI action audited", icon: History, onSelect: go("/activity"), group: "system" },
    { id: "sys:settings", label: "Settings", hint: "Workspace, billing, policy", icon: Settings, onSelect: go("/settings"), group: "system" },
  ];

  const grouped = {
    nav: rows.filter((r) => r.group === "nav"),
    voice: rows.filter((r) => r.group === "voice"),
    system: rows.filter((r) => r.group === "system"),
  } as const;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Command palette" description="Jump to anywhere in Harwick">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          {grouped.nav.map((row) => {
            const Icon = row.icon;
            return (
              <CommandItem key={row.id} value={`${row.label} ${row.keywords ?? ""}`} onSelect={row.onSelect}>
                <Icon className="size-4 shrink-0 text-[color:var(--graphite-text-muted)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[color:var(--graphite-text)]">{row.label}</div>
                  {row.hint === undefined ? null : (
                    <div className="truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">{row.hint}</div>
                  )}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Voice">
          {grouped.voice.map((row) => {
            const Icon = row.icon;
            return (
              <CommandItem key={row.id} value={`${row.label} ${row.keywords ?? ""}`} onSelect={row.onSelect}>
                <Icon className="size-4 shrink-0 text-[var(--sage)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[color:var(--graphite-text)]">{row.label}</div>
                  {row.hint === undefined ? null : (
                    <div className="truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">{row.hint}</div>
                  )}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="System">
          {grouped.system.map((row) => {
            const Icon = row.icon;
            return (
              <CommandItem key={row.id} value={`${row.label} ${row.keywords ?? ""}`} onSelect={row.onSelect}>
                <Icon className="size-4 shrink-0 text-[color:var(--graphite-text-muted)]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-[color:var(--graphite-text)]">{row.label}</div>
                  {row.hint === undefined ? null : (
                    <div className="truncate text-[11.5px] text-[color:var(--graphite-text-muted)]">{row.hint}</div>
                  )}
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
