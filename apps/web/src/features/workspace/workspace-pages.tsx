"use client";

import {
  AlertCircle,
  AtSign,
  Ban,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  CheckSquare,
  Clock,
  Code,
  ExternalLink,
  FileText,
  Hash,
  Image as ImageIcon,
  Inbox,
  Link2,
  MoreHorizontal,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Route,
  Send,
  ShieldCheck,
  Smile,
  Sparkles,
  Type,
  User,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Avatar, AvatarFallback } from "../../components/ui/avatar";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

type PageShellProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  fullWidth?: boolean;
};

function PageShell(props: PageShellProps) {
  return (
    <main className={cn(
      "mx-auto flex min-h-full w-full flex-col px-5 py-8",
      props.fullWidth ? "max-w-none" : "max-w-6xl",
    )}>
      <div className="mb-7">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-subtle">{props.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal text-harwick-ink">{props.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone">{props.subtitle}</p>
      </div>
      {props.children}
    </main>
  );
}

type ThreadStatus = "active" | "resolved" | "archived";
type ThreadType = "lead" | "task" | "listing" | "general";
type ThreadParticipant = {
  id: string;
  name: string;
  role: "agent" | "harwick" | "operator";
};
type ThreadMessage = {
  authorName: string;
  authorRole: ThreadParticipant["role"];
  content: string;
  harwickAction?: {
    confidence: number;
    description: string;
    reasoning: string;
    results: Array<{ id: string; title: string; type: string }>;
    tools: string[];
    type: "created" | "drafted" | "qualified" | "routed" | "sent";
  };
  id: string;
  isHarwickCommand?: boolean;
  timestamp: string;
};
type ThreadBoardItem = {
  id: string;
  linkedName?: string;
  messages: ThreadMessage[];
  participants: ThreadParticipant[];
  status: ThreadStatus;
  title: string;
  type: ThreadType;
  unreadCount?: number;
};

const threadBoardItems: ThreadBoardItem[] = [
  {
    id: "thread-1",
    linkedName: "Michael Thompson",
    messages: [
      { authorName: "Sarah Chen", authorRole: "agent", content: "Perfect. I’ll reach out to schedule showings for this weekend.", id: "m1", timestamp: "2026-05-08T09:40:00.000Z" },
      { authorName: "Coya Systems", authorRole: "operator", content: "@harwick show Joe my last 3 qualified buyer leads in full and send it to his inbox.", id: "m2", isHarwickCommand: true, timestamp: "2026-05-08T09:42:00.000Z" },
      {
        authorName: "Harwick",
        authorRole: "harwick",
        content: "I found three qualified buyer leads with source, budget signal, last touch, and recommended next move. I prepared a handoff for Joe and can send it after approval.",
        harwickAction: {
          confidence: 91,
          description: "Prepared Joe buyer handoff",
          reasoning: "Joe is online, accepts new buyer work, and has lower open lead load than the other available agents.",
          results: [
            { id: "artifact-1", title: "Joe buyer lead handoff", type: "artifact" },
            { id: "task-1", title: "Send handoff to Joe", type: "task" },
          ],
          tools: ["lead memory", "team presence", "inbox"],
          type: "drafted",
        },
        id: "m3",
        timestamp: "2026-05-08T09:45:00.000Z",
      },
    ],
    participants: [
      { id: "p1", name: "Jordan Davis", role: "operator" },
      { id: "p2", name: "Sarah Chen", role: "agent" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "active",
    title: "Michael Thompson - Katy buyer",
    type: "lead",
    unreadCount: 4,
  },
  {
    id: "thread-2",
    linkedName: "David Park",
    messages: [
      {
        authorName: "Harwick",
        authorRole: "harwick",
        content: "Automation paused for David Park. You’re now in control of outbound communication.",
        id: "m4",
        timestamp: "2026-05-08T08:15:00.000Z",
      },
    ],
    participants: [
      { id: "p1", name: "Maya", role: "agent" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "active",
    title: "David Park - Seller inquiry",
    type: "lead",
    unreadCount: 3,
  },
  {
    id: "thread-3",
    messages: [
      {
        authorName: "Harwick",
        authorRole: "harwick",
        content: "Morning brief: New leads (3), stale replies (2), and one FUB sync issue that needs retry.",
        id: "m5",
        timestamp: "2026-05-08T07:30:00.000Z",
      },
    ],
    participants: [
      { id: "p1", name: "Jordan", role: "operator" },
      { id: "p2", name: "Sarah", role: "agent" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "active",
    title: "Morning standup",
    type: "general",
    unreadCount: 2,
  },
  {
    id: "thread-5",
    linkedName: "789 Maple Ave",
    messages: [
      {
        authorName: "Harwick",
        authorRole: "harwick",
        content: "Listing status changed to Pending. Verified with MLS and updated the listing context.",
        id: "m6",
        timestamp: "2026-05-07T15:20:00.000Z",
      },
    ],
    participants: [
      { id: "p2", name: "Sarah", role: "agent" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "resolved",
    title: "Listing verification - 789 Maple",
    type: "listing",
    unreadCount: 1,
  },
  {
    id: "thread-6",
    linkedName: "Robert Kim",
    messages: [
      {
        authorName: "Harwick",
        authorRole: "harwick",
        content: "Callback completed. Robert decided to wait six months before listing. Nurture reminder created.",
        id: "m7",
        timestamp: "2026-05-06T16:12:00.000Z",
      },
    ],
    participants: [
      { id: "p1", name: "Jordan", role: "operator" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "resolved",
    title: "Robert Kim - Seller callback",
    type: "lead",
    unreadCount: 1,
  },
  {
    id: "thread-7",
    linkedName: "Amanda Foster",
    messages: [
      {
        authorName: "Harwick",
        authorRole: "harwick",
        content: "Showing scheduled for Saturday 10am. Calendar invite sent to Amanda and Sarah.",
        id: "m8",
        timestamp: "2026-05-05T14:25:00.000Z",
      },
    ],
    participants: [
      { id: "p1", name: "Jordan", role: "operator" },
      { id: "p2", name: "Sarah", role: "agent" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "archived",
    title: "Amanda Foster - 123 Main showing",
    type: "task",
    unreadCount: 1,
  },
  {
    id: "thread-8",
    messages: [
      {
        authorName: "Jordan Davis",
        authorRole: "operator",
        content: "Good meeting everyone. Let’s close the pending replies before noon.",
        id: "m9",
        timestamp: "2026-05-03T10:05:00.000Z",
      },
    ],
    participants: [
      { id: "p1", name: "Jordan", role: "operator" },
      { id: "p2", name: "Sarah", role: "agent" },
      { id: "p4", name: "Maya", role: "agent" },
      { id: "p3", name: "Harwick", role: "harwick" },
    ],
    status: "archived",
    title: "Weekly pipeline review",
    type: "general",
    unreadCount: 1,
  },
];

const threadTypeIcons: Record<ThreadType, LucideIcon> = {
  general: Hash,
  lead: Users,
  listing: Building2,
  task: CheckSquare,
};

const threadActionIcons: Record<NonNullable<ThreadMessage["harwickAction"]>["type"], LucideIcon> = {
  created: FileText,
  drafted: FileText,
  qualified: Users,
  routed: Route,
  sent: Send,
};

const threadColumns: Array<{ id: ThreadStatus; label: string; tone: string }> = [
  { id: "active", label: "Active", tone: "bg-sage" },
  { id: "resolved", label: "Resolved", tone: "bg-blue-500" },
  { id: "archived", label: "Archived", tone: "bg-stone" },
];

export function ThreadsPageContent() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const selectedThread = useMemo(
    () => threadBoardItems.find((thread) => thread.id === selectedThreadId) ?? null,
    [selectedThreadId],
  );

  return (
    <PageShell
      fullWidth
      eyebrow="Workspace"
      subtitle="Team discussions with @harwick."
      title="Threads"
    >
      <div className="flex min-h-[calc(100vh-13rem)] overflow-hidden rounded-[18px] border border-harwick-border bg-harwick-paper shadow-[var(--shadow-raised)]">
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="flex min-w-max gap-4 p-5">
            {threadColumns.map((column) => {
              const columnThreads = threadBoardItems.filter((thread) => thread.status === column.id);
              return (
                <section className="w-[330px] shrink-0" key={column.id}>
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn("size-3 rounded-full", column.tone)} />
                      <h2 className="text-sm font-semibold text-harwick-ink">{column.label}</h2>
                      <span className="text-xs text-stone">{columnThreads.length}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button className="size-7" size="icon" variant="ghost"><Plus className="size-4" /></Button>
                      <Button className="size-7" size="icon" variant="ghost"><MoreHorizontal className="size-4" /></Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {columnThreads.map((thread) => (
                      <ThreadBoardCard
                        isSelected={thread.id === selectedThreadId}
                        key={thread.id}
                        onClick={() => setSelectedThreadId(thread.id)}
                        thread={thread}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        {selectedThread === null ? null : (
          <div className="hidden w-[500px] shrink-0 border-l border-harwick-border bg-harwick-paper xl:flex xl:flex-col">
            <div className="flex items-center justify-between border-b border-harwick-border px-4 py-3">
              <span className="text-xs text-stone">
                Thread in <span className="font-medium text-harwick-ink">#{selectedThread.type}</span>
              </span>
              <Button className="size-7" onClick={() => setSelectedThreadId(null)} size="icon" variant="ghost">
                <X aria-hidden="true" className="size-4" />
              </Button>
            </div>
            <ThreadDetailView thread={selectedThread} />
          </div>
        )}
      </div>
    </PageShell>
  );
}

function ThreadBoardCard(props: {
  isSelected: boolean;
  onClick: () => void;
  thread: ThreadBoardItem;
}) {
  const Icon = threadTypeIcons[props.thread.type];
  const lastMessage = props.thread.messages.at(-1);
  const hasHarwick = props.thread.participants.some((participant) => participant.role === "harwick");

  return (
    <button
      className={cn(
        "w-full rounded-[12px] border bg-harwick-paper p-3 text-left transition hover:border-harwick-border-strong hover:bg-harwick-linen/45",
        props.isSelected ? "border-harwick-border-strong ring-1 ring-harwick-border-strong" : "border-harwick-border",
      )}
      onClick={props.onClick}
      type="button"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase text-muted-subtle">{props.thread.id}</span>
          {props.thread.unreadCount === undefined ? null : <span className="size-2 rounded-full bg-blue-500" />}
        </div>
        <span className="flex size-6 items-center justify-center rounded-full border border-harwick-border bg-harwick-linen text-stone">
          <Icon aria-hidden="true" className="size-3.5" />
        </span>
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold text-harwick-ink">{props.thread.title}</h3>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge className="text-[10px]" variant="outline">{props.thread.type}</Badge>
        {hasHarwick ? (
          <Badge className="gap-1 text-[10px]" tone="green" variant="outline">
            <Sparkles aria-hidden="true" className="size-2.5" />
            Harwick
          </Badge>
        ) : null}
        {props.thread.linkedName === undefined ? null : (
          <Badge className="text-[10px]" variant="outline">{props.thread.linkedName}</Badge>
        )}
      </div>
      {lastMessage === undefined ? null : (
        <div className="mt-3 rounded-[10px] bg-harwick-linen/70 p-2">
          <div className="mb-1 flex items-center gap-1.5">
            <MessageSquareText aria-hidden="true" className="size-3 text-stone" />
            <span className={cn("text-xs font-medium", lastMessage.authorRole === "harwick" ? "text-sage" : "text-harwick-ink")}>
              {lastMessage.authorName}
            </span>
            <span className="text-[10px] text-muted-subtle">{formatThreadTime(lastMessage.timestamp)}</span>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-stone">{lastMessage.content}</p>
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-harwick-border/60 pt-2">
        <div className="flex -space-x-1">
          {props.thread.participants.slice(0, 4).map((participant) => (
            <ParticipantAvatar key={participant.id} participant={participant} />
          ))}
        </div>
        <span className="flex items-center gap-1 text-xs text-stone">
          <MessageSquareText aria-hidden="true" className="size-3" />
          {props.thread.messages.length}
        </span>
      </div>
    </button>
  );
}

function ThreadDetailView({ thread }: { thread: ThreadBoardItem }) {
  const [aiPaused, setAiPaused] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-harwick-border px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-harwick-ink">{thread.title}</h2>
          {thread.linkedName === undefined ? null : (
            <p className="mt-1 text-xs text-stone">{thread.linkedName}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            className={cn("h-7 gap-1.5 text-xs", aiPaused ? "text-clay" : "text-sage")}
            onClick={() => setAiPaused((current) => !current)}
            size="sm"
            variant="ghost"
          >
            {aiPaused ? <Pause className="size-3" /> : <Play className="size-3" />}
            {aiPaused ? "Paused" : "Active"}
          </Button>
          <Button className="size-7" size="icon" variant="ghost"><MoreHorizontal className="size-4" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-1 border-b border-harwick-border px-4 py-2">
        {thread.participants.map((participant) => (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
              participant.role === "harwick" ? "bg-sage-soft text-sage" : "bg-harwick-linen text-stone",
            )}
            key={participant.id}
          >
            {participant.role === "harwick" ? <Sparkles className="size-2.5" /> : null}
            {participant.name}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-4">
        {thread.messages.map((message) => (
          <ThreadMessageBubble key={message.id} message={message} />
        ))}
      </div>
      <ThreadComposer />
    </div>
  );
}

function ThreadMessageBubble({ message }: { message: ThreadMessage }) {
  const isHarwick = message.authorRole === "harwick";
  return (
    <div className={cn("flex gap-2.5", isHarwick && "-mx-2 rounded-[12px] bg-sage-soft/40 px-2 py-3")}>
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className={cn("text-[10px]", isHarwick ? "bg-sage text-harwick-paper" : "bg-harwick-linen text-harwick-ink")}>
          {isHarwick ? <Sparkles className="size-3" /> : initialsForLabel(message.authorName)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-center gap-2">
          <span className={cn("text-xs font-semibold", isHarwick ? "text-sage" : "text-harwick-ink")}>{message.authorName}</span>
          {isHarwick ? <Badge className="px-1 py-0 text-[9px]" tone="green" variant="outline">AI</Badge> : null}
          <span className="text-[10px] text-muted-subtle">{formatThreadTime(message.timestamp)}</span>
        </div>
        <div className="whitespace-pre-wrap text-sm leading-6 text-stone">
          {message.isHarwickCommand ? <span className="rounded bg-harwick-linen px-1 py-0.5 font-mono text-xs text-harwick-ink">{message.content}</span> : message.content}
        </div>
        {message.harwickAction === undefined ? null : <HarwickActionCard action={message.harwickAction} />}
      </div>
    </div>
  );
}

function HarwickActionCard({ action }: { action: NonNullable<ThreadMessage["harwickAction"]> }) {
  const Icon = threadActionIcons[action.type];
  return (
    <div className="mt-3 rounded-[12px] border border-harwick-border bg-harwick-paper p-3">
      <div className="flex items-start gap-2">
        <Icon aria-hidden="true" className="mt-0.5 size-3.5 text-sage" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-harwick-ink">{action.description}</p>
          <p className="mt-1 text-[11px] leading-5 text-stone">Reasoning: {action.reasoning}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            <span className="text-[10px] text-muted-subtle">Tools:</span>
            {action.tools.map((tool) => <Badge className="text-[9px]" key={tool} variant="outline">{tool}</Badge>)}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-harwick-linen">
              <div className="h-full rounded-full bg-sage" style={{ width: `${action.confidence}%` }} />
            </div>
            <span className="text-[10px] text-stone">{action.confidence}%</span>
          </div>
          <div className="mt-2 space-y-1">
            {action.results.map((result) => (
              <div className="flex items-center gap-1.5 text-[11px]" key={result.id}>
                <Badge className="text-[9px]" variant="outline">{result.type}</Badge>
                <span className="inline-flex cursor-pointer items-center gap-1 text-sage hover:underline">
                  {result.title}
                  <ExternalLink className="size-2.5" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadComposer() {
  return (
    <div className="border-t border-harwick-border p-3">
      <div className="rounded-[12px] border border-harwick-border bg-harwick-parchment">
        <textarea
          className="min-h-[64px] w-full resize-none bg-transparent px-3 py-2 text-sm text-harwick-ink outline-none placeholder:text-muted-subtle"
          placeholder="Reply... Type @harwick to command"
        />
        <div className="flex items-center justify-between border-t border-harwick-border px-2 py-1.5">
          <div className="flex items-center gap-0.5 text-stone">
            {[Plus, Type, Smile, AtSign, ImageIcon, Code].map((Icon, index) => (
              <Button aria-label="Thread composer action" className="size-7" key={index} size="icon" variant="ghost">
                <Icon className="size-4" />
              </Button>
            ))}
          </div>
          <Button className="h-7 gap-1.5" size="sm"><Send className="size-3.5" /></Button>
        </div>
      </div>
    </div>
  );
}

function ParticipantAvatar({ participant }: { participant: ThreadParticipant }) {
  return (
    <div className={cn(
      "flex size-5 items-center justify-center rounded-full border-2 border-harwick-paper text-[9px] font-semibold",
      participant.role === "harwick" ? "bg-sage text-harwick-paper" : "bg-harwick-linen text-stone",
    )}>
      {participant.role === "harwick" ? <Sparkles className="size-2.5" /> : participant.name[0]}
    </div>
  );
}

function initialsForLabel(value: string): string {
  return value.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatThreadTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString();
}

const intakeRows = [
  {
    classification: "buyer",
    confidence: "86%",
    message: "Hey! I’m looking for a 3 bedroom downtown. What do you have?",
    sender: "testuser_1777",
    status: "Needs Review",
    tone: "amber" as const,
  },
  {
    classification: "seller",
    confidence: "93%",
    message: "Can someone call me about selling my condo next month?",
    sender: "Website form",
    status: "Ready to Act",
    tone: "green" as const,
  },
  {
    classification: "vendor",
    confidence: "78%",
    message: "Inspection report is ready for review.",
    sender: "Email",
    status: "Not a Lead",
    tone: "stone" as const,
  },
];

const intakeStatusCards: Array<{ count: string; icon: LucideIcon; label: string }> = [
  { count: "1", icon: AlertCircle, label: "Needs Review" },
  { count: "1", icon: CheckCircle2, label: "Ready to Act" },
  { count: "0", icon: ShieldCheck, label: "Auto-Handled" },
  { count: "1", icon: Ban, label: "Not Leads" },
];

export function IntakePageContent() {
  return (
    <PageShell
      eyebrow="Front door"
      subtitle="Inbound messages arrive here before Harwick turns them into leads, tasks, threads, replies, or dismissals."
      title="Intake"
    >
      <div className="grid gap-3 md:grid-cols-4">
        {intakeStatusCards.map(({ count, icon: Icon, label }) => (
          <div className="rounded-[14px] border border-harwick-border bg-harwick-paper p-4" key={label}>
            <Icon aria-hidden="true" className="size-4 text-sage" />
            <div className="mt-3 text-2xl font-semibold text-harwick-ink">{count}</div>
            <div className="mt-1 text-xs text-stone">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-5 space-y-3">
        {intakeRows.map((item) => (
          <div className="rounded-[18px] border border-harwick-border bg-harwick-paper p-4 shadow-[var(--shadow-control)]" key={item.sender}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Inbox aria-hidden="true" className="size-4 text-sage" />
                  <span className="text-sm font-semibold text-harwick-ink">{item.sender}</span>
                  <Badge tone={item.tone} variant="outline">{item.status}</Badge>
                  <Badge tone="green">{item.classification}</Badge>
                </div>
                <p className="mt-3 max-w-3xl rounded-[12px] bg-harwick-linen px-3 py-2 text-sm leading-6 text-harwick-ink">“{item.message}”</p>
              </div>
              <Badge variant="outline">{item.confidence} confidence</Badge>
            </div>
            <div className="mt-4 rounded-[14px] border border-harwick-border bg-harwick-parchment p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-sage">
                <Bot aria-hidden="true" className="size-3.5" />
                Harwick analysis
              </div>
              <p className="mt-2 text-sm leading-6 text-stone">
                Likely {item.classification} context. Missing budget and timeline. Safe next move is one qualifying question before routing.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm"><Send className="size-3.5" />Approve reply</Button>
              <Button size="sm" variant="outline"><Link2 className="size-3.5" />Attach lead</Button>
              <Button size="sm" variant="outline"><User className="size-3.5" />Assign</Button>
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function TasksPageContent() {
  return (
    <PageShell
      eyebrow="Work"
      subtitle="Approvals, follow-ups, routing reviews, sync failures, callbacks, and Harwick proposed actions."
      title="Tasks"
    >
      <div className="grid gap-4 lg:grid-cols-3">
        {["Todo", "In Progress", "Waiting"].map((column) => (
          <section className="rounded-[18px] border border-harwick-border bg-harwick-paper p-4" key={column}>
            <h2 className="text-sm font-semibold text-harwick-ink">{column}</h2>
            <div className="mt-4 space-y-3">
              {["Approve Instagram reply", "Route downtown buyer", "Retry FUB sync"].map((title, index) => (
                <div className="rounded-[14px] border border-harwick-border bg-harwick-parchment p-3" key={`${column}:${title}`}>
                  <Badge tone={index === 0 ? "amber" : "stone"} variant="outline">{index === 0 ? "high" : "medium"}</Badge>
                  <p className="mt-3 text-sm font-medium text-harwick-ink">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-stone">Created by Harwick from intake and workspace context.</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageShell>
  );
}

export function ArtifactsPageContent() {
  return (
    <PageShell
      eyebrow="Harwick output"
      subtitle="Versioned briefs, policies, handoff packets, reply drafts, playbooks, and listing packets."
      title="Artifacts"
    >
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ["Buyer lead handoff for Joe", "handoff packet", "V2 warmer client-facing version"],
          ["Downtown buyer qualification policy", "policy", "V1 operator checklist"],
          ["Sarah Mitchell listing packet", "listing packet", "V3 reviewed"],
        ].map(([title, type, version]) => (
          <article className="rounded-[18px] border border-harwick-border bg-harwick-paper p-5" key={title}>
            <FileText aria-hidden="true" className="size-5 text-sage" />
            <h2 className="mt-4 text-base font-semibold text-harwick-ink">{title}</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline">{type}</Badge>
              <Badge tone="green">{version}</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-stone">Created from a thread with source context, reasoning, and action history attached.</p>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

export function TeamPageContent() {
  return (
    <PageShell
      eyebrow="Workspace"
      subtitle="Members, roles, queues, availability, personal inboxes, and assignment load."
      title="Team"
    >
      <div className="grid gap-4 md:grid-cols-3">
        {["Coya Systems", "Joe Rivera", "Maya Chen"].map((name, index) => (
          <div className="rounded-[18px] border border-harwick-border bg-harwick-paper p-5" key={name}>
            <div className="flex size-10 items-center justify-center rounded-full bg-harwick-linen text-sm font-semibold text-harwick-ink">
              {name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
            </div>
            <h2 className="mt-4 text-sm font-semibold text-harwick-ink">{name}</h2>
            <p className="mt-1 text-xs text-stone">{index === 0 ? "Owner" : "Agent"} · {index + 1} open work</p>
            <Button className="mt-4 w-full" size="sm" variant="outline"><Inbox className="size-3.5" />Open inbox</Button>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function MemoryPageContent() {
  return (
    <PageShell
      eyebrow="Harwick memory"
      subtitle="Workspace preferences, policy narrative, learned lead patterns, and reusable brokerage knowledge."
      title="Memory"
    >
      <div className="space-y-3">
        {[
          ["Pattern", "Downtown buyer leads often ask for listings before sharing budget. Harwick should ask timeline and budget before routing."],
          ["Policy", "Draft external replies, but ask for approval before sending until the workspace enables auto-send."],
          ["Preference", "Owner prefers concise operator briefs with action buttons first and reasoning underneath."],
        ].map(([type, body]) => (
          <div className="rounded-[18px] border border-harwick-border bg-harwick-paper p-5" key={body}>
            <div className="flex items-center gap-2">
              <Brain aria-hidden="true" className="size-4 text-sage" />
              <Badge variant="outline">{type}</Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-harwick-ink">{body}</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-stone">
              <Clock aria-hidden="true" className="size-3.5" />
              Used by Harwick when composing replies, routes, and artifacts.
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}

export function ActivityFoundationsPageContent() {
  return (
    <PageShell
      eyebrow="Audit"
      subtitle="A unified timeline of Harwick, users, integrations, and system events."
      title="Activity"
    >
      <div className="rounded-[18px] border border-harwick-border bg-harwick-paper p-5">
        <div className="space-y-4">
          {[
            ["Harwick classified Instagram DM", "Used Meta, lead memory, and routing context."],
            ["Coya Systems approved reply", "Reply sent through operator approval."],
            ["Follow Up Boss sync queued", "CRM update waiting on provider response."],
          ].map(([title, detail]) => (
            <div className="flex gap-3 border-b border-harwick-border/60 pb-4 last:border-b-0 last:pb-0" key={title}>
              <Wrench aria-hidden="true" className="mt-0.5 size-4 text-sage" />
              <div>
                <p className="text-sm font-medium text-harwick-ink">{title}</p>
                <p className="mt-1 text-xs text-stone">{detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
