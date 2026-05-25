"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { LeadPageItem, LeadPageStage } from "./leads-data";
import { ArrowRight, type LucideIcon, MessageSquare, Phone } from "lucide-react";
import { useMemo, useState, type ComponentType, type SVGProps } from "react";
import { toast } from "sonner";

import { FacebookGlyph, InstagramGlyph } from "../../components/harwick-icons";
import { Card, Section, Shell } from "../../components/panels/panels";
import { EngravedNumeral, MicroLabel, MonoTag } from "../../components/panels/typography";
import { cn } from "../../lib/utils";

type GlyphIcon = ComponentType<SVGProps<SVGSVGElement>> | LucideIcon;

type Column = {
  id: LeadPageStage;
  label: string;
  dot: string;
  description: string;
};

const COLUMNS: Column[] = [
  { id: "hot", label: "Hot", dot: "bg-[var(--oxblood)]", description: "Needs the fastest next move" },
  { id: "qualified", label: "Qualified", dot: "bg-[var(--sage)]", description: "Routed and warm" },
  { id: "unrouted", label: "Owner review", dot: "bg-[var(--clay)]", description: "Waiting on routing context" },
  { id: "callback", label: "Callback", dot: "bg-[var(--clay)]", description: "Human contact should happen" },
  { id: "showing", label: "Showing", dot: "bg-[var(--sage)]", description: "Ready for calendar coordination" },
  { id: "nurture", label: "Nurture", dot: "bg-[color:var(--graphite-text-faint)]", description: "Warm follow-up keeps momentum" },
];

function sourceIcon(source: LeadPageItem["source"]): GlyphIcon {
  if (source === "instagram") return InstagramGlyph;
  if (source === "facebook") return FacebookGlyph;
  return Phone;
}

function sourceTint(source: LeadPageItem["source"]): { fill: string; ring: string; icon: string } {
  if (source === "instagram") {
    return {
      fill: "bg-gradient-to-br from-[#F58529]/22 via-[#DD2A7B]/22 to-[#8134AF]/22",
      ring: "ring-1 ring-inset ring-[#DD2A7B]/35",
      icon: "text-[#F4A8C7]",
    };
  }
  if (source === "facebook") {
    return {
      fill: "bg-gradient-to-br from-[#1877F2]/22 to-[#3C5EA9]/22",
      ring: "ring-1 ring-inset ring-[#5A8DEF]/35",
      icon: "text-[#9CBAF2]",
    };
  }
  return {
    fill: "bg-gradient-to-br from-[var(--clay)]/14 to-[var(--clay)]/4",
    ring: "ring-1 ring-inset ring-[var(--clay)]/30",
    icon: "text-[var(--clay)]",
  };
}

function intentChip(intent: string): { bg: string; text: string; ring: string } {
  const normalized = intent.toLowerCase();
  if (normalized.includes("buyer")) {
    return { bg: "bg-[oklch(72%_0.14_250/0.18)]", text: "text-[oklch(82%_0.12_250)]", ring: "ring-1 ring-inset ring-[oklch(72%_0.14_250/0.32)]" };
  }
  if (normalized.includes("seller")) {
    return { bg: "bg-[oklch(72%_0.14_305/0.18)]", text: "text-[oklch(82%_0.12_305)]", ring: "ring-1 ring-inset ring-[oklch(72%_0.14_305/0.32)]" };
  }
  if (normalized.includes("renter")) {
    return { bg: "bg-[oklch(72%_0.12_195/0.18)]", text: "text-[oklch(82%_0.12_195)]", ring: "ring-1 ring-inset ring-[oklch(72%_0.12_195/0.32)]" };
  }
  return { bg: "bg-[color:var(--panel-2)]", text: "text-[color:var(--graphite-text-muted)]", ring: "ring-1 ring-inset ring-[color:var(--panel-line)]" };
}

function priorityChip(score: number): { label: string; bg: string; text: string; ring: string } {
  if (score >= 80) return { label: "high", bg: "bg-[var(--oxblood-soft)]", text: "text-[var(--oxblood)]", ring: "ring-1 ring-inset ring-[var(--oxblood)]/30" };
  if (score >= 60) return { label: "medium", bg: "bg-[var(--clay-soft)]", text: "text-[var(--clay)]", ring: "ring-1 ring-inset ring-[var(--clay)]/30" };
  return { label: "low", bg: "bg-[var(--sage-soft)]", text: "text-[var(--sage)]", ring: "ring-1 ring-inset ring-[var(--sage)]/30" };
}

function LeadCard({ lead, onSelect }: { lead: LeadPageItem; onSelect?: (leadId: string) => void }) {
  const SourceIconCmp = sourceIcon(lead.source) as ComponentType<SVGProps<SVGSVGElement>>;
  const tint = sourceTint(lead.source);
  const intent = intentChip(lead.intent);
  const priority = priorityChip(lead.score);
  const initials = lead.initials.toUpperCase();
  const shortId = lead.id.slice(0, 6).toUpperCase();
  const draggable = useDraggable({ id: lead.id, data: { stage: lead.stage } });
  const dragStyle = draggable.transform
    ? {
        transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`,
        zIndex: 30,
      }
    : undefined;

  // Open the lead drawer on click. The DnD sensor has a 6px activation
  // distance so a real click (no movement) lands here, but a drag swallows
  // it. We also guard with isDragging in case the pointer-up still fires.
  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    if (draggable.isDragging) return;
    if (onSelect === undefined) return;
    // Don't override deliberate text selection or middle-click.
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    onSelect(lead.id);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (onSelect === undefined) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(lead.id);
    }
  }

  return (
    <div
      ref={draggable.setNodeRef}
      style={{ ...(dragStyle ?? {}), viewTransitionName: `lead-${lead.id.slice(0, 8)}` }}
      {...draggable.attributes}
      {...draggable.listeners}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role={onSelect === undefined ? undefined : "button"}
      tabIndex={onSelect === undefined ? undefined : 0}
      aria-label={onSelect === undefined ? undefined : `Open lead ${lead.name}`}
      className={cn("touch-none", draggable.isDragging && "z-20", onSelect !== undefined && "cursor-pointer")}
    >
    <Card
      interactive
      className={cn("flex flex-col gap-2.5 p-3", draggable.isDragging && "opacity-70 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.7)]")}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold", priority.bg, priority.text, priority.ring)}>
          {priority.label}
        </span>
        <span className={cn("inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold lowercase", intent.bg, intent.text, intent.ring)}>
          {lead.intent}
        </span>
        <MonoTag className="ml-auto">{shortId}</MonoTag>
      </div>

      <div className="flex items-start gap-2.5">
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-[9px]", tint.fill, tint.ring)}>
          <SourceIconCmp className={cn("size-3.5", tint.icon)} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-[14px] font-semibold tracking-[-0.005em] text-[color:var(--graphite-text)]">{lead.name}</h4>
          <p className="line-clamp-2 text-[11.5px] leading-[1.4] text-[color:var(--graphite-text-muted)]">
            {lead.listing || lead.area || lead.message}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1.5">
          <div className="flex size-5 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[9px] font-semibold text-[color:var(--graphite-text-muted)]">
            {initials}
          </div>
          <span className="truncate text-[10.5px] text-[color:var(--graphite-text-muted)]">
            {lead.assignedTo === "owner review" ? "Owner review" : lead.assignedTo}
          </span>
        </div>
        <MonoTag>{lead.lastTouch}</MonoTag>
      </div>

      <div className="flex items-center gap-2 border-t border-[color:var(--panel-line-soft)] pt-2 text-[11px] text-[color:var(--graphite-text-muted)]">
        <MessageSquare className="size-3 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{lead.routeReason}</span>
        <ArrowRight className="size-3 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
      </div>
    </Card>
    </div>
  );
}

function DroppableColumn({ id, children }: { id: LeadPageStage; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-2 p-2 transition-colors",
        isOver && "bg-[var(--sage-soft)]/30 ring-1 ring-inset ring-[var(--sage)]/30",
      )}
    >
      {children}
    </div>
  );
}

export function LeadsKanban({ leads, onLeadSelect }: { leads: LeadPageItem[]; onLeadSelect?: (leadId: string) => void }) {
  // Optimistic local stage overrides so dragged cards move instantly.
  const [overrides, setOverrides] = useState<Record<string, LeadPageStage>>({});
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const effective = useMemo(
    () => leads.map((lead) => (overrides[lead.id] === undefined ? lead : { ...lead, stage: overrides[lead.id]! })),
    [leads, overrides],
  );

  const byStage = useMemo(() => {
    const map = new Map<LeadPageStage, LeadPageItem[]>();
    for (const column of COLUMNS) map.set(column.id, []);
    for (const lead of effective) map.get(lead.stage)?.push(lead);
    return map;
  }, [effective]);

  function onDragEnd(event: DragEndEvent) {
    const leadId = String(event.active.id);
    const targetStage = event.over?.id as LeadPageStage | undefined;
    if (targetStage === undefined) return;
    const lead = effective.find((entry) => entry.id === leadId);
    if (lead === undefined || lead.stage === targetStage) return;

    // Optimistic move
    setOverrides((current) => ({ ...current, [leadId]: targetStage }));
    toast.success(`Moved to ${targetStage}`, { description: lead.name });

    // Fire-and-forget routing call. The real backend route can vary by stage.
    void fetch(`/api/workspaces/${lead.workspaceId}/leads/${leadId}/stage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stage: targetStage }),
    }).catch(() => {
      // Roll back if the backend rejects.
      setOverrides((current) => {
        const next = { ...current };
        delete next[leadId];
        return next;
      });
      toast.error("Move failed — rolled back", { description: lead.name });
    });
  }

  return (
    <Shell className="overflow-hidden">
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto p-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {COLUMNS.map((column) => {
          const items = byStage.get(column.id) ?? [];
          return (
            <div key={column.id} className="flex w-[88vw] max-w-[300px] shrink-0 snap-start flex-col md:w-[280px]">
              <Section
                className="h-full"
                eyebrow={(
                  <span className="inline-flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", column.dot)} aria-hidden="true" />
                    {column.label}
                  </span>
                )}
                title={(
                  <span className="flex items-baseline gap-2">
                    <EngravedNumeral className="text-[20px] leading-none">{items.length}</EngravedNumeral>
                    <span className="text-[11px] font-medium text-[color:var(--graphite-text-faint)]">cards</span>
                  </span>
                )}
                trailing={(
                  <button
                    type="button"
                    className="text-[11px] text-[color:var(--graphite-text-faint)] transition hover:text-[color:var(--graphite-text)]"
                    aria-label={`Add to ${column.label}`}
                  >
                    + add
                  </button>
                )}
                bodyClassName="p-0"
              >
                <DroppableColumn id={column.id}>
                  {items.length === 0 ? (
                    <div className="rounded-[var(--panel-radius-xs)] border border-dashed border-[color:var(--panel-line-soft)] px-3 py-4 text-center">
                      <MicroLabel>nothing here</MicroLabel>
                      <p className="mt-1 text-[11px] text-[color:var(--graphite-text-muted)]">{column.description}</p>
                    </div>
                  ) : (
                    items.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        {...(onLeadSelect === undefined ? {} : { onSelect: onLeadSelect })}
                      />
                    ))
                  )}
                </DroppableColumn>
              </Section>
            </div>
          );
        })}
      </div>
      </DndContext>
    </Shell>
  );
}
