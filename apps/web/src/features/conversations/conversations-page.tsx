"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { cn } from "../../lib/utils";

type Source = "instagram" | "facebook" | "voice";

const conversations = [
  { id: "1", name: "Marcus Thompson", ts: "2m", unread: true, preview: '"Is this still available? We\'ve been..."', source: "instagram" as Source, avatar: "MT" },
  { id: "2", name: "Keisha Brown", ts: "41m", unread: false, preview: '"What time does the open house..."', source: "facebook" as Source, avatar: "KB" },
  { id: "3", name: "Diana Reyes", ts: "1h", unread: true, preview: "Voice call transcript ready", source: "voice" as Source, avatar: "DR" },
];

export function ConversationsPageContent() {
  const [selected, setSelected] = useState(conversations[0]?.id ?? "");
  const [reply, setReply] = useState("");

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="flex h-14 items-center border-b border-border bg-surface px-7">
        <div className="font-display text-[19px]">Conversations</div>
        <div className="ml-auto flex w-[180px] items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-[12px] text-muted-foreground"><Search className="h-3 w-3" />Search…</div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[252px] overflow-y-auto border-r border-border bg-surface">
          <div className="flex gap-1 border-b border-border p-3">
            <button className="rounded-full bg-foreground px-3 py-1 text-[11px] text-background">All</button>
            <button className="rounded-full border px-3 py-1 text-[11px]">DMs</button>
            <button className="rounded-full border px-3 py-1 text-[11px]">Comments</button>
          </div>
          {conversations.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className={cn("w-full border-b border-border px-3.5 py-3 text-left", selected === c.id ? "bg-muted" : "hover:bg-muted") }>
              <div className="mb-1 flex items-center gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">{c.avatar}</div><div className="flex-1 text-[12.5px] font-medium">{c.name}</div>{c.unread ? <div className="h-1.5 w-1.5 rounded-full bg-harwick-brass" /> : null}<div className="text-[11px] text-muted">{c.ts}</div></div>
              <div className={cn("ml-8 truncate text-[11.5px]", c.unread ? "font-medium" : "text-muted")}>{c.preview}</div>
              <div className="ml-8 mt-1 text-[9px] text-muted">{c.source.charAt(0).toUpperCase() + c.source.slice(1)}</div>
            </button>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border bg-surface px-3.5 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px]">MT</div>
            <div><div className="text-[13.5px] font-medium">Marcus Thompson</div><div className="text-[11px] text-muted">Instagram · Comment on "4BR Coral Gables"</div></div>
            <div className="ml-auto flex gap-2"><button className="rounded-lg border px-2.5 py-1.5 text-[12px]">View Lead</button><button className="rounded-lg bg-harwick-ink px-2.5 py-1.5 text-[12px] text-white">Open in Meta</button></div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4 text-center text-[11px] text-muted">Today, April 29</div>
            <div className="mb-3 flex gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px]">MT</div><div><div className="max-w-[72%] rounded-[4px_13px_13px_13px] bg-muted px-3 py-2 text-[12.5px]">Is this still available? We've been looking in this area for months 👀</div><div className="mt-0.5 text-[10px] text-muted">10:14 AM · Instagram Comment</div></div></div>
            <div className="mb-3 flex gap-2"><div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#F5EDD6] text-[10px] text-[#8B5E1A]">AI</div><div><div className="max-w-[72%] rounded-[4px_13px_13px_13px] border border-dashed border-[#E8D08A] bg-[#F5EDD6] px-3 py-2 text-[12.5px]"><div className="mb-1 text-[9px] uppercase tracking-[0.1em] text-[#8B5E1A]">AI Draft — Pending Approval</div>Hi Marcus — yes, still available! This one just had a price adjustment last week. Happy to send full details and schedule a walkthrough at your convenience. What's your timeline?</div><div className="mt-0.5 text-[10px] text-muted">Draft · Not sent yet</div></div></div>
          </div>
          <div className="border-t border-border bg-surface p-3">
            <textarea value={reply} onChange={(e) => setReply(e.target.value)} className="min-h-[56px] w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-[12.5px] outline-none" placeholder="Write a reply or note…" />
            <div className="mt-2 flex items-center gap-2"><div className="flex-1 text-[11px] text-muted">Replying via Instagram Comment</div><button className="rounded-lg border px-3 py-1.5 text-[12px]">Generate Draft</button><button className="rounded-lg bg-harwick-ink px-3 py-1.5 text-[12px] text-white">Send</button></div>
          </div>
        </div>

        <div className="w-[288px] overflow-y-auto border-l border-border bg-surface p-3.5">
          <div className="mb-2 text-[9.5px] uppercase tracking-[0.12em] text-muted">Lead Info</div>
          <div className="space-y-2 text-[12px]"><div><span className="text-muted">Name</span> <span className="font-medium">Marcus Thompson</span></div><div><span className="text-muted">Source</span> <span className="font-medium">Instagram</span></div><div><span className="text-muted">Stage</span> <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">New</span></div><div><span className="text-muted">Score</span> <span className="font-medium">87 / 100</span></div></div>
        </div>
      </div>
    </div>
  );
}
