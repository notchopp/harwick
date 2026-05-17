"use client";

import { Bot, Check, Loader2, Send, Wrench } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";

import { cn } from "../../lib/utils";
import { tryRenderSmartCard } from "./tool-result-cards";
import { useHarwickChat } from "./use-harwick-chat";

const HINTS: Array<{ label: string; prompt: string }> = [
  { label: "Hot leads", prompt: "Show me my hot leads." },
  { label: "Routing desk", prompt: "Who needs routing right now?" },
  { label: "Team status", prompt: "Who's on my team and what's their load?" },
  { label: "What needs me?", prompt: "What needs me first today?" },
];

function ToolPill({ name, state }: { name: string; state: "input-streaming" | "input-available" | "output-available" | "output-error" }) {
  const styles = state === "output-available"
    ? "border-[var(--sage)]/30 bg-[var(--sage)]/8 text-[var(--sage)]"
    : state === "output-error"
      ? "border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] text-[var(--oxblood)]"
      : "border-white/[0.1] bg-white/[0.025] text-white/72";
  const icon = state === "output-available"
    ? <Check className="size-2.5" aria-hidden="true" />
    : state === "output-error"
      ? <Wrench className="size-2.5" aria-hidden="true" />
      : <span className="size-1.5 animate-pulse rounded-full bg-white/72" aria-hidden="true" />;

  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", styles)}>
      {icon}
      <span className="font-mono uppercase tracking-[0.08em]">{name.replace(/^tool-/, "").replace(/_/g, " ")}</span>
    </span>
  );
}

type LeadResult = {
  filter: string;
  count: number;
  leads: Array<{
    leadId: string;
    name: string;
    source: string;
    stage: string;
    assignedTo: string | null;
    lastTouch: string;
    openLeadHref: string;
    openConvoHref: string;
  }>;
};

type RoutingResult = {
  count: number;
  decisions: Array<{
    leadId: string;
    leadName: string;
    recommendedAssignee: string;
    reason: string;
    requiresApproval: boolean;
    summary: string;
  }>;
};

type TeamResult = {
  count: number;
  members: Array<{
    memberId: string;
    name: string;
    role: string;
    status: string;
    openWork: number;
    activeLeads: number;
    lastSeen: string;
  }>;
};

type LeadCardResult = {
  kind: "lead_card";
  leadId: string;
  name: string;
  source: string | null;
  status: string | null;
  summary: string;
  assignedTo: string | null;
  score: number | null;
  reason?: string;
  openLeadHref: string;
  openConvoHref: string;
};

type RoutingCardResult = {
  kind: "routing_card";
  leadId: string;
  leadName: string;
  recommendedAssignee: string;
  summary: string;
  requiresApproval: boolean;
  reason: string;
  openLeadHref: string;
  openConvoHref: string;
};

type SubagentTaskResult = {
  kind: "subagent_task";
  taskId: string;
  status: string;
  title: string;
  subagentType: string;
  priority: string;
  instructions: string;
  leadId?: string | null;
  queued?: boolean;
  result?: unknown;
  errorMessage?: string | null;
  updatedAt?: string;
};

type SubagentListResult = {
  count: number;
  tasks: SubagentTaskResult[];
  error?: string;
};

function isLeadResult(value: unknown): value is LeadResult {
  if (value === null || typeof value !== "object") return false;
  return Array.isArray((value as { leads?: unknown }).leads);
}
function isRoutingResult(value: unknown): value is RoutingResult {
  if (value === null || typeof value !== "object") return false;
  return Array.isArray((value as { decisions?: unknown }).decisions);
}
function isTeamResult(value: unknown): value is TeamResult {
  if (value === null || typeof value !== "object") return false;
  return Array.isArray((value as { members?: unknown }).members);
}
function isLeadCardResult(value: unknown): value is LeadCardResult {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "lead_card";
}
function isRoutingCardResult(value: unknown): value is RoutingCardResult {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "routing_card";
}
function isSubagentTaskResult(value: unknown): value is SubagentTaskResult {
  return value !== null && typeof value === "object" && (value as { kind?: unknown }).kind === "subagent_task";
}
function isSubagentListResult(value: unknown): value is SubagentListResult {
  return value !== null && typeof value === "object" && Array.isArray((value as { tasks?: unknown }).tasks);
}

function statusTone(status: string): string {
  if (status === "completed") return "border-[var(--sage)]/35 bg-[var(--sage)]/10 text-[var(--sage)]";
  if (status === "failed") return "border-[var(--oxblood)]/35 bg-[var(--oxblood-soft)] text-[var(--oxblood)]";
  if (status === "running") return "border-[var(--clay)]/35 bg-[var(--clay)]/10 text-[var(--clay)]";
  return "border-white/[0.1] bg-white/[0.035] text-white/68";
}

function ActionButton({ href, children, primary = false }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <a
      href={href}
      className={cn(
        "inline-flex items-center gap-1 rounded-[7px] px-2 py-1 text-[11px] font-medium transition",
        primary
          ? "border border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)]"
          : "border border-white/[0.08] bg-white/[0.025] text-white/72 hover:text-white",
      )}
    >
      {children}
    </a>
  );
}

function LeadCard({ lead }: { lead: LeadCardResult }) {
  return (
    <div className="max-w-full overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.014] p-3">
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.035] text-[10px] font-semibold uppercase text-white/64">
          {(lead.source ?? "lead").slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <div className="truncate text-[13px] font-semibold text-white">{lead.name}</div>
            {lead.score === null ? null : (
              <span className="rounded-full bg-white/[0.045] px-1.5 py-0.5 font-mono text-[9.5px] text-white/48">{lead.score}</span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-white/66">{lead.reason ?? lead.summary}</p>
          {lead.reason === undefined ? null : (
            <p className="mt-1 text-[11.5px] leading-4 text-white/48">{lead.summary}</p>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ActionButton href={lead.openConvoHref} primary>See convo</ActionButton>
        <ActionButton href={lead.openLeadHref}>Open lead</ActionButton>
      </div>
    </div>
  );
}

function RoutingCard({ item }: { item: RoutingCardResult }) {
  return (
    <div className="max-w-full overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.014] p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="rounded-full border border-[var(--clay)]/30 bg-[var(--clay)]/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--clay)]">
          routing
        </span>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em]", item.requiresApproval ? statusTone("running") : statusTone("completed"))}>
          {item.requiresApproval ? "needs approval" : "ready"}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-white">{item.leadName}</div>
      <p className="mt-1 text-[12px] leading-5 text-white/66">{item.summary}</p>
      <p className="mt-1 text-[11.5px] leading-4 text-white/48">Recommended: {item.recommendedAssignee}. {item.reason}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <ActionButton href={item.openConvoHref} primary>See convo</ActionButton>
        <ActionButton href={item.openLeadHref}>Open lead</ActionButton>
      </div>
    </div>
  );
}

function SubagentTaskCard({ task }: { task: SubagentTaskResult }) {
  const resultText = typeof task.result === "object" && task.result !== null
    ? JSON.stringify(task.result, null, 2)
    : typeof task.result === "string"
      ? task.result
      : null;

  return (
    <div className="max-w-full overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.014] p-3">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="rounded-full border border-[var(--sage)]/25 bg-[var(--sage)]/8 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[var(--sage)]">
          {task.subagentType}
        </span>
        <span className={cn("rounded-full border px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em]", statusTone(task.status))}>
          {task.status}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-white">{task.title}</div>
      <p className="mt-1 text-[12px] leading-5 text-white/66">{task.instructions}</p>
      {task.errorMessage === undefined || task.errorMessage === null ? null : (
        <p className="mt-1 text-[11.5px] leading-4 text-[var(--oxblood)]">{task.errorMessage}</p>
      )}
      {resultText === null ? null : (
        <details className="mt-2 max-w-full overflow-hidden rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2 text-[11px]">
          <summary className="cursor-pointer text-white/60">result</summary>
          <pre className="mt-1.5 max-h-36 max-w-full overflow-auto whitespace-pre-wrap break-words text-[10.5px] leading-4 text-white/62">{resultText}</pre>
        </details>
      )}
    </div>
  );
}

export function ToolResultCard({ toolName, output }: { toolName: string; output: unknown }) {
  // New smart-tool kinds first — memory, semantic search, calendar, pipeline
  // mutations, briefings, query_workspace, delegate_complex_task, etc.
  const smartCard = tryRenderSmartCard(output);
  if (smartCard !== null) return smartCard;

  if (isLeadCardResult(output)) {
    return <LeadCard lead={output} />;
  }

  if (isRoutingCardResult(output)) {
    return <RoutingCard item={output} />;
  }

  if (isSubagentTaskResult(output)) {
    return <SubagentTaskCard task={output} />;
  }

  if (
    toolName === "tool-cancel_subagent_task"
    && output !== null
    && typeof output === "object"
    && isSubagentTaskResult((output as { task?: unknown }).task)
  ) {
    return <SubagentTaskCard task={(output as { task: SubagentTaskResult }).task} />;
  }

  if (toolName === "tool-list_subagent_tasks" && isSubagentListResult(output)) {
    if (output.tasks.length === 0) {
      return (
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-white/56">
          No subagent tasks match that status.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {output.tasks.map((task) => <SubagentTaskCard key={task.taskId} task={task} />)}
      </div>
    );
  }

  // Type-narrow on the actual tool result shape and render the right card.
  if (toolName === "tool-list_leads" && isLeadResult(output)) {
    if (output.leads.length === 0) {
      return (
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-white/56">
          No leads match that filter.
        </div>
      );
    }
    return (
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.012]">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/72">
          {output.count} {output.filter} {output.count === 1 ? "lead" : "leads"}
        </div>
        <ul className="grid gap-1.5 p-2.5">
          {output.leads.map((lead) => (
            <li key={lead.leadId} className="rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-white">{lead.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/60">
                    {lead.assignedTo === null ? "Unassigned" : `with ${lead.assignedTo}`} · {lead.lastTouch}
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-white/56">
                  {lead.stage}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <a href={lead.openLeadHref} className="inline-flex items-center gap-1 rounded-[7px] border border-[var(--sage)]/40 bg-[var(--sage-soft)] px-2 py-1 text-[11px] font-medium text-[var(--sage)]">
                  Open lead
                </a>
                <a href={lead.openConvoHref} className="inline-flex items-center gap-1 rounded-[7px] border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[11px] font-medium text-white/72 hover:text-white">
                  See convo
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (toolName === "tool-list_routing_desk" && isRoutingResult(output)) {
    if (output.decisions.length === 0) {
      return (
        <div className="rounded-[10px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px] text-white/56">
          Routing desk is clear.
        </div>
      );
    }
    return (
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.012]">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/72">
          {output.count} routing {output.count === 1 ? "decision" : "decisions"}
        </div>
        <ul className="grid gap-1.5 p-2.5">
          {output.decisions.map((d) => (
            <li key={d.leadId} className="rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold text-white">{d.leadName}</div>
                  <div className="mt-0.5 truncate text-[11px] text-white/64">→ {d.recommendedAssignee}</div>
                </div>
                {d.requiresApproval ? (
                  <span className="shrink-0 rounded-full bg-[var(--clay)]/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-[var(--clay)]">approval</span>
                ) : (
                  <span className="shrink-0 rounded-full bg-[var(--sage)]/15 px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-[var(--sage)]">ready</span>
                )}
              </div>
              <div className="mt-1 text-[11px] leading-4.5 text-white/60">{d.reason}</div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (toolName === "tool-list_team" && isTeamResult(output)) {
    return (
      <div className="overflow-hidden rounded-[12px] border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.012]">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/72">
          team ({output.count})
        </div>
        <ul className="grid gap-1 p-2.5">
          {output.members.map((m) => {
            const dot = m.status === "online" ? "bg-[var(--sage)]" : m.status === "away" ? "bg-[var(--clay)]" : "bg-white/[0.18]";
            return (
              <li key={m.memberId} className="flex items-center gap-2 rounded-[7px] px-2 py-1.5 hover:bg-white/[0.025]">
                <span className={cn("size-1.5 shrink-0 rounded-full", dot)} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-white">{m.name}</div>
                  <div className="truncate text-[10.5px] text-white/52">{m.role}</div>
                </div>
                <div className="shrink-0 font-mono text-[10.5px] text-white/56">{m.openWork} open</div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Fallback: collapsible raw JSON for tool results we don't have a card for yet.
  return (
    <details className="max-w-full overflow-hidden rounded-[8px] border border-white/[0.06] bg-white/[0.02] p-2 text-[11px]">
      <summary className="cursor-pointer text-white/56">tool result · {toolName.replace(/^tool-/, "")}</summary>
      <pre className="mt-1.5 max-w-full overflow-auto whitespace-pre-wrap break-words text-[10.5px] text-white/64">{JSON.stringify(output, null, 2)}</pre>
    </details>
  );
}

// Lookup tools render no card on their own — Harwick uses them silently to
// gather context for its prose reply. New smart-tool lookups (recall_fact,
// find_similar_leads, search_listings, find_comps, check_availability,
// summarize_call_recording, query_workspace) DO render cards because their
// shape carries useful structured info for the operator to scan.
const SILENT_TOOL_TYPES = new Set([
  "tool-list_leads",
  "tool-list_routing_desk",
  "tool-list_team",
  "tool-get_lead_detail",
  "tool-list_calendar",
]);

function HarwickChatInner({ workspaceId, threadId, initialMessages }: { workspaceId: string; threadId: string; initialMessages: UIMessage[] }) {
  const { messages, sendMessage, status, error } = useHarwickChat({ workspaceId, threadId, initialMessages });
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (messagesRef.current === null) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current === null) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(160, Math.max(36, textareaRef.current.scrollHeight))}px`;
  }, [draft]);

  function submit() {
    const text = draft.trim();
    if (text.length === 0 || status === "streaming" || status === "submitted") return;
    void sendMessage({ text });
    setDraft("");
  }

  return (
    <>
      <div ref={messagesRef} className="min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-3">
        {messages.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-white/[0.1] bg-white/[0.01] px-3 py-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.1em] text-white/56">
              <Bot className="size-3 text-[var(--sage)]" aria-hidden="true" />
              harwick
            </div>
            <p className="text-[12.5px] leading-5 text-white/82">
              Ask me anything — leads, routing, calendar, team. I'll call the right tool and surface what matters.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {HINTS.map((hint) => (
                <button
                  key={hint.label}
                  type="button"
                  className="rounded-[6px] border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[11px] text-white/72 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
                  onClick={() => setDraft(hint.prompt)}
                >
                  {hint.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((message) => {
          if (message.role === "user") {
            const text = message.parts.filter((p): p is { type: "text"; text: string } => p.type === "text").map((p) => p.text).join("");
            return (
              <div key={message.id} className="flex min-w-0 justify-end">
                <div className="max-w-[88%] overflow-hidden rounded-[12px] rounded-tr-[4px] bg-white px-3 py-2 text-[12.5px] leading-5 text-[#0f1011] whitespace-pre-wrap break-words shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                  {text}
                </div>
              </div>
            );
          }

          // Assistant message — render each part in order
          return (
            <div key={message.id} className="min-w-0 space-y-2 overflow-hidden">
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  if (part.text.trim().length === 0) return null;
                  return (
                    <p key={`${message.id}:p:${index}`} className="whitespace-pre-wrap break-words text-[13px] leading-5 text-white/92">
                      {part.text}
                    </p>
                  );
                }
                if (part.type.startsWith("tool-")) {
                  const toolPart = part as { type: string; state: "input-streaming" | "input-available" | "output-available" | "output-error"; output?: unknown };
                  if (SILENT_TOOL_TYPES.has(part.type)) {
                    return null;
                  }
                  return (
                    <div key={`${message.id}:t:${index}`} className="min-w-0 space-y-1.5 overflow-hidden">
                      <ToolPill name={part.type} state={toolPart.state} />
                      {toolPart.state === "output-available" && toolPart.output !== undefined ? (
                        <ToolResultCard toolName={part.type} output={toolPart.output} />
                      ) : null}
                    </div>
                  );
                }
                if (part.type === "reasoning") {
                  return null; // Suppressed by request (no brain pills).
                }
                return null;
              })}
            </div>
          );
        })}

        {status === "streaming" && messages[messages.length - 1]?.role !== "assistant" ? (
          <div className="inline-flex items-center gap-1.5 text-[12px] italic text-white/56">
            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
            Thinking…
          </div>
        ) : null}

        {error !== undefined ? (
          <div className="rounded-[8px] border border-[var(--oxblood)]/40 bg-[var(--oxblood-soft)] px-3 py-2 text-[11.5px] text-[var(--oxblood)]">
            {error.message}
          </div>
        ) : null}
      </div>

      <div className="min-w-0 shrink-0 border-t border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
        <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 transition focus-within:border-white/[0.18] focus-within:bg-white/[0.04]">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Ask Harwick — leads, routing, calendar, team..."
            className="block w-full resize-none bg-transparent text-[12.5px] leading-5 text-white outline-none placeholder:text-white/40"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-white/52">⌘↵</span>
            <span className="text-[10.5px] text-white/40">to send</span>
            <button
              type="button"
              onClick={submit}
              disabled={draft.trim().length === 0 || status === "streaming" || status === "submitted"}
              className={cn(
                "ml-auto flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11px] font-semibold transition",
                draft.trim().length === 0 || status === "streaming" || status === "submitted"
                  ? "border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-faint)]"
                  : "bg-white text-[color:var(--panel-0)] shadow-[var(--panel-inset-top),0_1px_2px_rgba(0,0,0,0.3)] hover:bg-white/92",
              )}
            >
              {status === "streaming" || status === "submitted"
                ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                : <Send className="size-3.5" aria-hidden="true" />}
              <span className="hidden sm:inline">Send</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function HarwickChat({ workspaceId, threadId }: { workspaceId: string; threadId: string }) {
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMessages() {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}/harwick-chat?threadId=${encodeURIComponent(threadId)}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          if (!cancelled) setInitialMessages([]);
          return;
        }
        const payload = (await response.json()) as { messages?: unknown };
        if (!cancelled) setInitialMessages(Array.isArray(payload.messages) ? payload.messages as UIMessage[] : []);
      } catch {
        if (!cancelled) setInitialMessages([]);
      }
    }
    void loadMessages();
    return () => { cancelled = true; };
  }, [threadId, workspaceId]);

  if (initialMessages === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-[12px] text-white/52">
        Loading Harwick thread…
      </div>
    );
  }

  return <HarwickChatInner key={threadId} workspaceId={workspaceId} threadId={threadId} initialMessages={initialMessages} />;
}
