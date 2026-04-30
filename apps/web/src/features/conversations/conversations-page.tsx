"use client";

import { useState } from "react";
import { Search, Send } from "lucide-react";
import { cn } from "../../lib/utils";

type MessageType = "in" | "out" | "ai";

type Conversation = {
  id: string;
  lead_id: string;
  lead_name: string;
  source_channel: "instagram" | "facebook" | "voice";
  last_message: string;
  timestamp: string;
  unread: boolean;
  avatar: string;
};

type Message = {
  id: string;
  type: MessageType;
  content: string;
  timestamp: string;
  meta?: string;
};

type Lead = {
  id: string;
  name: string;
  source: string;
  stage: string;
  score: number;
  assigned: string;
  fub_id?: string;
  type?: string;
  area?: string;
  timeline?: string;
  budget?: string;
  listing_name?: string;
  listing_price?: string;
  listing_verified?: boolean;
};

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: "conv_1",
    lead_id: "lead_1",
    lead_name: "Marcus Thompson",
    source_channel: "instagram",
    last_message: '"Is this still available? We\'ve been..."',
    timestamp: "2m",
    unread: true,
    avatar: "MT",
  },
  {
    id: "conv_2",
    lead_id: "lead_3",
    lead_name: "Keisha Brown",
    source_channel: "facebook",
    last_message: '"What time does the open house..."',
    timestamp: "41m",
    unread: false,
    avatar: "KB",
  },
  {
    id: "conv_3",
    lead_id: "lead_2",
    lead_name: "Diana Reyes",
    source_channel: "voice",
    last_message: "Voice call transcript ready",
    timestamp: "1h",
    unread: true,
    avatar: "DR",
  },
];

const MOCK_MESSAGES: Message[] = [
  {
    type: "in",
    id: "msg_1",
    content: "Is this still available? We've been looking in this area for months 👀",
    timestamp: "10:14 AM · Instagram Comment",
  },
  {
    type: "ai",
    id: "msg_2",
    content:
      "Hi Marcus — yes, still available! This one just had a price adjustment last week. Happy to send full details and schedule a walkthrough at your convenience. What's your timeline?",
    timestamp: "Draft · Not sent yet",
    meta: "AI Draft — Pending Approval",
  },
];

const MOCK_LEAD: Lead = {
  id: "lead_1",
  name: "Marcus Thompson",
  source: "Instagram",
  stage: "New",
  score: 87,
  assigned: "Sarah Kim",
  type: "Purchase",
  area: "Coral Gables",
  timeline: "Unknown",
  budget: "Unknown",
  listing_name: "4BR Coral Gables",
  listing_price: "$1.45M · 2,800 sqft · 4bd / 3ba",
  listing_verified: true,
};

function SourceBadge({ source }: { source: "instagram" | "facebook" | "voice" }) {
  const colors =
    source === "instagram"
      ? "bg-purple-100 text-purple-700"
      : source === "facebook"
        ? "bg-blue-100 text-blue-700"
        : "bg-green-100 text-green-700";
  const label = source === "instagram" ? "Instagram" : source === "facebook" ? "Facebook" : "Voice";

  return <span className={cn("rounded-full px-2 py-1 text-[9px] font-semibold whitespace-nowrap", colors)}>{label}</span>;
}

function MessageBubble({ message }: { message: Message }) {
  if (message.type === "in") {
    return (
      <div className="flex gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700 flex-shrink-0">MT</div>
        <div>
          <div className="max-w-sm rounded-[4px_13px_13px_13px] bg-gray-100 px-3 py-2 text-[12.5px] leading-[1.5]">{message.content}</div>
          <div className="mt-0.5 text-[10px] text-muted">{message.timestamp}</div>
        </div>
      </div>
    );
  }

  if (message.type === "ai") {
    return (
      <div className="flex gap-2 mb-3">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700 flex-shrink-0">AI</div>
        <div>
          <div className="max-w-sm rounded-[4px_13px_13px_13px] border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] leading-[1.5]">
            {message.meta && <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-amber-700 mb-1">{message.meta}</div>}
            {message.content}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">{message.timestamp}</div>
          <div className="mt-1 flex gap-1">
            <button className="inline-flex items-center gap-1 rounded-full bg-green-600 px-3 py-1 text-[11px] font-semibold text-white hover:opacity-90">
              <Send className="h-3 w-3" />
              Send
            </button>
            <button className="inline-flex items-center gap-1 rounded-full border border-border bg-transparent px-3 py-1 text-[11px] font-semibold text-foreground hover:border-border-strong">
              Edit
            </button>
            <button className="inline-flex items-center gap-1 rounded-full border border-border bg-transparent px-3 py-1 text-[11px] font-semibold text-foreground hover:border-border-strong">
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Outgoing message
  return (
    <div className="flex gap-2 mb-3 justify-end">
      <div>
        <div className="max-w-sm rounded-[13px_4px_13px_13px] bg-harwick-ink px-3 py-2 text-[12.5px] leading-[1.5] text-white">{message.content}</div>
        <div className="mt-0.5 text-right text-[10px] text-muted">{message.timestamp}</div>
      </div>
    </div>
  );
}

export function ConversationsPageContent() {
  const [selectedConvId, setSelectedConvId] = useState(MOCK_CONVERSATIONS[0]?.id);
  const [filterMode, setFilterMode] = useState<"all" | "dms" | "comments">("all");
  const [replyText, setReplyText] = useState("");

  const selectedConv = MOCK_CONVERSATIONS.find((c) => c.id === selectedConvId);

  return (
    <div className="flex flex-1 overflow-hidden bg-background">
      {/* Topbar */}
      <div className="absolute top-0 left-[220px] right-0 h-[58px] border-b border-border bg-surface px-8 flex items-center gap-4 z-10">
        <span className="font-display text-[19px] font-medium flex-1">Conversations</span>
        <div className="flex items-center gap-2 bg-muted rounded-lg border border-border px-3 py-1.5 ml-auto">
          <Search className="h-3 w-3 text-muted-foreground" strokeWidth={2} />
          <input type="text" placeholder="Search…" className="bg-transparent text-[12px] placeholder-muted-foreground focus:outline-none w-[180px]" />
        </div>
      </div>

      {/* 3-Column Layout */}
      <div className="flex flex-1 overflow-hidden pt-[58px]">
        {/* Left Sidebar - Conversations List (252px) */}
        <div className="w-[252px] border-r border-border bg-surface flex flex-col flex-shrink-0 overflow-hidden">
          {/* Filter Tabs */}
          <div className="flex gap-1 px-3 py-2.5 border-b border-border">
            {(["all", "dms", "comments"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  filterMode === mode ? "bg-foreground text-background" : "bg-transparent text-foreground/60 hover:text-foreground"
                )}
              >
                {mode === "all" ? "All" : mode === "dms" ? "DMs" : "Comments"}
              </button>
            ))}
          </div>

          {/* Conversation Items */}
          <div className="flex-1 overflow-y-auto">
            {MOCK_CONVERSATIONS.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={cn(
                  "w-full px-3.5 py-3.25 border-b border-border text-left transition-colors hover:bg-muted",
                  selectedConvId === conv.id ? "bg-muted" : "bg-transparent"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-700 flex-shrink-0">MT</div>
                  <span className="font-medium text-[12.5px] flex-1 truncate">{conv.lead_name}</span>
                  {conv.unread && <div className="h-1.75 w-1.75 rounded-full bg-harwick-brass flex-shrink-0" />}
                  <span className="text-[11px] text-muted flex-shrink-0">{conv.timestamp}</span>
                </div>
                <div className={cn("text-[11.5px] truncate ml-8", conv.unread ? "font-semibold text-foreground" : "text-muted")}>{conv.last_message}</div>
                <div className="mt-1 ml-8">
                  <SourceBadge source={conv.source_channel} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Center - Message Thread */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Conversation Header */}
          {selectedConv && (
            <div className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3 flex-shrink-0">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-700">MT</div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold">Marcus Thompson</div>
                <div className="flex items-center gap-2 text-[11px] text-muted">
                  <SourceBadge source={selectedConv.source_channel} />
                  <span>Comment on "4BR Coral Gables"</span>
                </div>
              </div>
              <button className="inline-flex items-center px-2.5 py-1.5 rounded-lg border border-border bg-transparent text-[12px] font-semibold hover:border-border-strong">
                View Lead
              </button>
              <button className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-harwick-ink text-white text-[12px] font-semibold hover:opacity-90">
                Open in Meta
              </button>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="text-center text-[11px] text-muted mb-4">Today, April 29</div>
            {MOCK_MESSAGES.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>

          {/* Compose Box */}
          <div className="border-t border-border bg-surface px-4 py-3 flex-shrink-0">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Write a reply or note…"
              className="w-full rounded-lg bg-muted border border-border px-3 py-2.5 text-[12.5px] font-sans placeholder-muted-foreground focus:outline-none focus:border-border-strong resize-none min-h-[56px]"
            />
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[11px] text-muted flex-1">Replying via Instagram Comment</span>
              <button className="inline-flex items-center px-3 py-1.5 rounded-lg border border-border bg-transparent text-[12px] font-semibold hover:border-border-strong">
                Generate Draft
              </button>
              <button className="inline-flex items-center px-3 py-1.5 rounded-lg bg-harwick-ink text-white text-[12px] font-semibold hover:opacity-90">
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Lead Context (288px) */}
        <div className="w-[288px] border-l border-border bg-surface flex flex-col flex-shrink-0 overflow-y-auto">
          {/* Lead Info Section */}
          <div className="border-b border-border px-3.5 py-3.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.25">Lead Info</div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Name</span>
                <span className="text-[12px] font-semibold text-foreground">{MOCK_LEAD.name}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Source</span>
                <span className="text-[12px] font-semibold text-foreground">{MOCK_LEAD.source}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Stage</span>
                <span className="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{MOCK_LEAD.stage}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Score</span>
                <span className="text-[12px] font-semibold text-foreground">{MOCK_LEAD.score} / 100</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Assigned</span>
                <span className="text-[12px] font-semibold text-foreground">{MOCK_LEAD.assigned}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">FUB ID</span>
                <span className="text-[12px] text-muted">—</span>
              </div>
            </div>
          </div>

          {/* Intent Signals Section */}
          <div className="border-b border-border px-3.5 py-3.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.25">Intent Signals</div>
            <div className="space-y-2">
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Type</span>
                <span className="text-[12px] font-semibold text-foreground">{MOCK_LEAD.type}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Area</span>
                <span className="text-[12px] font-semibold text-foreground">{MOCK_LEAD.area}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Timeline</span>
                <span className="text-[12px] text-muted">{MOCK_LEAD.timeline}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-[12px] text-muted w-[68px] flex-shrink-0">Budget</span>
                <span className="text-[12px] text-muted">{MOCK_LEAD.budget}</span>
              </div>
            </div>
          </div>

          {/* Listing Context Section */}
          <div className="border-b border-border px-3.5 py-3.5">
            <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted mb-2.25">Listing Context</div>
            <div className="bg-muted rounded-lg border border-border px-2.5 py-2.5 text-[12px] space-y-1">
              <div className="font-semibold text-foreground">{MOCK_LEAD.listing_name}</div>
              <div className="text-muted">{MOCK_LEAD.listing_price}</div>
              {MOCK_LEAD.listing_verified && <div className="text-[11px] text-green-600">✓ Verified</div>}
            </div>
          </div>

          {/* Actions */}
          <div className="px-3.5 py-3.5 space-y-2">
            <button className="w-full inline-flex items-center justify-center rounded-lg bg-harwick-ink px-4 py-2.5 text-[12px] font-semibold text-white hover:opacity-90">
              Open Full Lead
            </button>
            <button className="w-full inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-4 py-2.5 text-[12px] font-semibold hover:border-border-strong">
              Sync to FUB
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
