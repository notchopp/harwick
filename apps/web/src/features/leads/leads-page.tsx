"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { cn } from "../../lib/utils";

type LeadStatus = "new" | "qualified" | "nurture" | "lost";
type SourceChannel = "instagram" | "facebook" | "voice";
type SortBy = "newest" | "score" | "uncontacted";

type Lead = {
  id: string;
  full_name: string;
  status: LeadStatus;
  source_channel: SourceChannel;
  score: number;
  assigned_agent_name?: string;
  assigned_agent_initials?: string;
  last_message_at?: string;
  context?: string;
  sub_status?: string;
};

const MOCK_LEADS: Lead[] = [
  { id: "1", full_name: "Marcus Thompson", status: "new", source_channel: "instagram", score: 87, assigned_agent_initials: "SK", last_message_at: "2m ago", context: 'Comment on "4BR Coral Gables" · Purchase interest · Not contacted', sub_status: "Not contacted" },
  { id: "2", full_name: "Diana Reyes", status: "new", source_channel: "voice", score: 72, assigned_agent_initials: "SK", last_message_at: "18m ago", context: "Inbound call · 3BR rental $3,500/mo · Missed — callback needed", sub_status: "Callback due" },
  { id: "3", full_name: "Keisha Brown", status: "qualified", source_channel: "facebook", score: 91, assigned_agent_initials: "ML", last_message_at: "41m ago", context: 'DM on "Coconut Grove Open House" · Attending Sunday · FUB synced', sub_status: "FUB synced" },
  { id: "4", full_name: "Jordan Mills", status: "qualified", source_channel: "voice", score: 84, assigned_agent_initials: "SK", last_message_at: "2h ago", context: "Inbound call · Waterfront condo $800K · FUB ownership conflict", sub_status: "FUB conflict" },
  { id: "5", full_name: "Tonya Williams", status: "nurture", source_channel: "instagram", score: 44, assigned_agent_initials: "DP", last_message_at: "3h ago", context: "Story reply · Waterfront interest, early stage · Last contact 30d", sub_status: "Follow-up due" },
  { id: "6", full_name: "Raymond Foster", status: "lost", source_channel: "facebook", score: 21, assigned_agent_initials: "ML", last_message_at: "2 wks", context: "Comment on listing · Went with competitor · Closed 2 weeks ago", sub_status: "Closed lost" },
];

const statusStyles: Record<LeadStatus, string> = {
  new: "bg-harwick-brass/20 text-[#8B5E1A]",
  qualified: "bg-[#E0EDE7] text-[#2E6B4F]",
  nurture: "bg-muted text-muted-foreground",
  lost: "bg-[#F5E5E5] text-[#9B3A3A]",
};

const sourceStyles: Record<SourceChannel, string> = {
  instagram: "bg-[#F0E5F5] text-[#5B2D7B]",
  facebook: "bg-[#E5EBF5] text-[#1A3A6B]",
  voice: "bg-[#E0EDE7] text-[#2E6B4F]",
};

export function LeadsPageContent() {
  const [activeTab, setActiveTab] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceChannel | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let rows = [...MOCK_LEADS];
    if (activeTab !== "all") rows = rows.filter((r) => r.status === activeTab);
    if (sourceFilter !== "all") rows = rows.filter((r) => r.source_channel === sourceFilter);
    if (search.trim()) rows = rows.filter((r) => r.full_name.toLowerCase().includes(search.toLowerCase()));
    if (sortBy === "score") rows.sort((a, b) => b.score - a.score);
    return rows;
  }, [activeTab, sourceFilter, sortBy, search]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-14 items-center border-b border-border bg-surface px-7">
        <div className="font-display text-[19px]">Leads</div>
        <button className="ml-auto inline-flex items-center gap-1 rounded-[20px] bg-harwick-ink px-3 py-1.5 text-[11px] text-white"><Plus className="h-3.5 w-3.5" /> Add Lead</button>
      </div>

      <div className="flex border-b border-border bg-surface px-7">
        {["All Leads", "New", "Qualified", "Nurture", "Lost"].map((t) => {
          const key = t.toLowerCase().split(" ")[0] as LeadStatus | "all";
          return <button key={t} onClick={() => setActiveTab(key === "all" ? "all" : key)} className={cn("border-b-2 px-3 py-3 text-[12.5px]", activeTab === (key === "all" ? "all" : key) ? "border-foreground text-foreground" : "border-transparent text-muted")}>{t}</button>;
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-7 py-3 text-[11.5px]">
        <span className="text-muted">Source:</span>
        {(["all", "instagram", "facebook", "voice"] as const).map((f) => <button key={f} onClick={() => setSourceFilter(f)} className={cn("rounded-full border px-2.5 py-1", sourceFilter === f ? "bg-foreground text-background" : "text-muted-foreground")}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}</button>)}
        <div className="mx-1 h-4 w-px bg-border" />
        <span className="text-muted">Sort:</span>
        {(["newest", "score", "uncontacted"] as const).map((s) => <button key={s} onClick={() => setSortBy(s)} className={cn("rounded-full border px-2.5 py-1", sortBy === s ? "bg-foreground text-background" : "text-muted-foreground")}>{s === "score" ? "Score ↓" : s.charAt(0).toUpperCase() + s.slice(1)}</button>)}
        <div className="ml-auto flex w-[190px] items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[12px] text-muted-foreground"><Search className="h-3 w-3" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads…" className="w-full bg-transparent outline-none" /></div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pb-7 pt-4">
        {filtered.map((lead) => (
          <div key={lead.id} className="mb-2 flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong">
            <div className={cn("flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[11px] font-medium", sourceStyles[lead.source_channel])}>{lead.source_channel === "instagram" ? "IG" : lead.source_channel === "facebook" ? "FB" : "VC"}</div>
            <div className="min-w-0 flex-1"><div className="mb-0.5 flex items-center gap-2"><span className="text-[13.5px] font-medium">{lead.full_name}</span><span className={cn("rounded-full px-2 py-0.5 text-[10px]", statusStyles[lead.status])}>{lead.status.charAt(0).toUpperCase() + lead.status.slice(1)}</span></div><div className="truncate text-[12px] text-muted-foreground">{lead.context}</div></div>
            <div className="w-11 text-center"><div className="font-display text-[20px] leading-none">{lead.score}</div><div className="text-[9px] uppercase tracking-[0.1em] text-muted">Score</div></div>
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">{lead.assigned_agent_initials}</div>
            <div className="min-w-[70px] text-right text-[11px] text-muted"><div>{lead.last_message_at}</div><div className="mt-0.5 text-[10px]">{lead.sub_status}</div></div>
          </div>
        ))}
      </div>
    </div>
  );
}
