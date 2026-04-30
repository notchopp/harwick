"use client";

import { useState, useMemo } from "react";
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
};

// Mock data - will be replaced with real queries
const MOCK_LEADS: Lead[] = [
  {
    id: "lead_1",
    full_name: "Marcus Thompson",
    status: "new",
    source_channel: "instagram",
    score: 87,
    assigned_agent_name: "Sarah Kim",
    assigned_agent_initials: "SK",
    last_message_at: "2m ago",
    context: 'Comment on "4BR Coral Gables" · Purchase interest · Not contacted',
  },
  {
    id: "lead_2",
    full_name: "Diana Reyes",
    status: "new",
    source_channel: "voice",
    score: 72,
    assigned_agent_name: "Sarah Kim",
    assigned_agent_initials: "SK",
    last_message_at: "18m ago",
    context: "Inbound call · 3BR rental $3,500/mo · Missed — callback needed",
  },
  {
    id: "lead_3",
    full_name: "Keisha Brown",
    status: "qualified",
    source_channel: "facebook",
    score: 91,
    assigned_agent_name: "Marcus Lee",
    assigned_agent_initials: "ML",
    last_message_at: "41m ago",
    context: 'DM on "Coconut Grove Open House" · Attending Sunday · FUB synced',
  },
  {
    id: "lead_4",
    full_name: "Jordan Mills",
    status: "qualified",
    source_channel: "voice",
    score: 84,
    assigned_agent_name: "Sarah Kim",
    assigned_agent_initials: "SK",
    last_message_at: "2h ago",
    context: "Inbound call · Waterfront condo $800K · FUB ownership conflict",
  },
  {
    id: "lead_5",
    full_name: "Tonya Williams",
    status: "nurture",
    source_channel: "instagram",
    score: 44,
    assigned_agent_name: "Diana Prince",
    assigned_agent_initials: "DP",
    last_message_at: "3h ago",
    context: "Story reply · Waterfront interest, early stage · Last contact 30d",
  },
];

function getSourceIcon(channel: SourceChannel) {
  switch (channel) {
    case "instagram":
      return "📷";
    case "facebook":
      return "f";
    case "voice":
      return "☎";
    default:
      return "•";
  }
}

function getSourceColor(channel: SourceChannel) {
  switch (channel) {
    case "instagram":
      return "bg-purple-100 text-purple-700";
    case "facebook":
      return "bg-blue-100 text-blue-700";
    case "voice":
      return "bg-green-100 text-green-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function getStatusBadgeColor(status: LeadStatus) {
  switch (status) {
    case "new":
      return "bg-amber-100 text-amber-700";
    case "qualified":
      return "bg-green-100 text-green-700";
    case "nurture":
      return "bg-gray-100 text-gray-600";
    case "lost":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function getStatusLabel(status: LeadStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[12px] border border-border bg-surface px-4 py-3.25 transition-all duration-150 hover:border-border-strong hover:shadow-sm">
      {/* Source Icon */}
      <div className={cn("flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-sm font-medium flex-shrink-0", getSourceColor(lead.source_channel))}>
        {getSourceIcon(lead.source_channel)}
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[13.5px] font-semibold truncate">{lead.full_name}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap", getStatusBadgeColor(lead.status))}>
            {getStatusLabel(lead.status)}
          </span>
        </div>
        <div className="text-[12px] text-muted truncate">{lead.context}</div>
      </div>

      {/* Score */}
      <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-11">
        <div className="font-display text-[20px] font-medium leading-none">{lead.score}</div>
        <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted">Score</div>
      </div>

      {/* Assigned Avatar */}
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700 flex-shrink-0 title={lead.assigned_agent_name || 'Unassigned'}">
        {lead.assigned_agent_initials || "–"}
      </div>

      {/* Timestamp & Status */}
      <div className="flex flex-col items-end gap-0.5 flex-shrink-0 min-w-[70px] text-right">
        <div className="text-[11px] text-muted">{lead.last_message_at}</div>
        <div className="text-[10px] text-muted">Not contacted</div>
      </div>
    </div>
  );
}

export function LeadsPageContent() {
  const [activeTab, setActiveTab] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<SourceChannel | "all">("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredLeads = useMemo(() => {
    let results = MOCK_LEADS;

    if (activeTab !== "all") {
      results = results.filter((lead) => lead.status === activeTab);
    }

    if (sourceFilter !== "all") {
      results = results.filter((lead) => lead.source_channel === sourceFilter);
    }

    if (searchQuery) {
      results = results.filter((lead) =>
        lead.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Sort results
    if (sortBy === "score") {
      results.sort((a, b) => b.score - a.score);
    } else if (sortBy === "newest") {
      // Keep original order (would be by timestamp in real data)
    }

    return results;
  }, [activeTab, sourceFilter, sortBy, searchQuery]);

  const tabs: { id: LeadStatus | "all"; label: string }[] = [
    { id: "all", label: "All Leads" },
    { id: "new", label: "New" },
    { id: "qualified", label: "Qualified" },
    { id: "nurture", label: "Nurture" },
    { id: "lost", label: "Lost" },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {/* Topbar */}
      <div className="flex h-[58px] items-center gap-4 border-b border-border bg-surface px-8">
        <span className="font-display text-[19px] font-medium flex-1">Leads</span>
        <button className="inline-flex items-center gap-2 rounded-lg bg-harwick-ink px-3.5 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-92">
          <Plus className="h-4 w-4" strokeWidth={2} />
          Add Lead
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border bg-surface px-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "border-b-2 px-3.5 py-3 text-[12.5px] transition-colors duration-150",
              activeTab === tab.id
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent font-medium text-muted hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-8 py-3">
        <span className="text-[11.5px] text-muted">Source:</span>
        {(["all", "instagram", "facebook", "voice"] as const).map((source) => (
          <button
            key={source}
            onClick={() => setSourceFilter(source)}
            className={cn(
              "rounded-full border px-2.75 py-1 text-[11.5px] transition-all duration-150",
              sourceFilter === source
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-border bg-transparent text-foreground hover:border-border-strong"
            )}
          >
            {source === "all" ? "All" : source.charAt(0).toUpperCase() + source.slice(1)}
          </button>
        ))}

        <div className="h-4 w-px bg-border mx-1" />

        <span className="text-[11.5px] text-muted">Sort:</span>
        {(["newest", "score", "uncontacted"] as const).map((sort) => (
          <button
            key={sort}
            onClick={() => setSortBy(sort)}
            className={cn(
              "rounded-full border px-2.75 py-1 text-[11.5px] transition-all duration-150",
              sortBy === sort
                ? "border-foreground bg-foreground text-background font-semibold"
                : "border-border bg-transparent text-foreground hover:border-border-strong"
            )}
          >
            {sort === "score" ? "Score ↓" : sort.charAt(0).toUpperCase() + sort.slice(1)}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 bg-muted rounded-lg border border-border px-3 py-1.5">
          <Search className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
          <input
            type="text"
            placeholder="Search leads…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent text-[12px] placeholder-muted-foreground focus:outline-none w-[180px]"
          />
        </div>
      </div>

      {/* Leads List */}
      <div className="flex-1 overflow-y-auto px-8 py-4 space-y-2">
        {filteredLeads.length === 0 ? (
          <div className="text-center text-muted py-12">
            <p className="text-[13px]">No leads found</p>
          </div>
        ) : (
          filteredLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
        )}
      </div>
    </div>
  );
}
