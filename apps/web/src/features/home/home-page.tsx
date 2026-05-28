"use client";

import {
  ConversationsInboxResponseSchema,
  FollowUpBossConflictQueueResponseSchema,
  HarwickAssistantResponseSchema,
  HarwickHomeWorkItemsResponseSchema,
  OperationsFailureQueueResponseSchema,
  RecentLeadsResponseSchema,
  RoutingDeskResponseSchema,
  TeamPresenceResponseSchema,
  VoiceDailyBriefResponseSchema,
  VoiceShowingBriefResponseSchema,
  type ConversationInboxThread,
  type ConversationAutomationMode,
  type HarwickAssistantResponse,
  type HarwickHomeWorkItem,
  type OwnerHomeQueueItem,
  type RecentLeadItem,
  type RoutingDeskItem,
  type TeamPresenceMember,
  type WorkspaceRole,
  OwnerHomeQueueResponseSchema,
} from "@realty-ops/core";
import {
  ArrowLeft,
  AlertCircle,
  AtSign,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  ClipboardIcon,
  Database,
  DollarSign,
  Edit3,
  FileText,
  GitBranch,
  Home as HomeIcon,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Phone,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  User,
  type LucideIcon,
  Wrench,
  X,
} from "lucide-react";
import { RiLoader4Line } from "react-icons/ri";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "../../components/ai-elements/chain-of-thought";
import { Conversation, ConversationContent, ConversationScrollButton } from "../../components/ai-elements/conversation";
import { Message, MessageContent } from "../../components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputProvider,
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
  usePromptInputController,
} from "../../components/ai-elements/prompt-input";
import { Shimmer } from "../../components/ai-elements/shimmer";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from "../../components/ai-elements/confirmation";
import { AppShell } from "../../components/app-shell";
import { type HarwickSurfaceTone } from "../../components/harwick-surface-card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { Separator } from "../../components/ui/separator";
import { cn } from "../../lib/utils";

type Source = "instagram" | "facebook";
type Tone = "green" | "red" | "amber" | "stone";
export type WorkItem = { kind: "reply"; item: Reply } | { kind: "task"; item: Task };

type LoopToolCallDetail = {
  tool: string;
  reason: string;
  requiresApproval: boolean;
};

type LoopDetail = {
  outputMode?: string;
  draftBody?: string;
  agentLoopBrief?: string;
  audienceReason?: string;
  notificationMode?: string;
  notificationReason?: string;
  proposedToolCalls: LoopToolCallDetail[];
};

export type Reply = {
  workspaceId?: string;
  reviewId?: string;
  leadId?: string;
  channel?: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment";
  thread?: ConversationInboxThread;
  automationMode: ConversationAutomationMode;
  helper: string;
  source: Source;
  lead: string;
  time: string;
  message: string;
  draft: string;
};

export type Task = {
  workspaceId?: string;
  handoffId?: string;
  backsyncEventId?: string;
  operationsFailureResourceId?: string;
  operationsFailureItemType?: "workflow_job" | "crm_sync" | "provider_error";
  operationsFailureRetryable?: boolean;
  workItemId?: string;
  leadId?: string;
  workItemType?: HarwickHomeWorkItem["type"];
  type: "callback" | "listing" | "crm" | "insight";
  thread?: ConversationInboxThread;
  label: string;
  title: string;
  detail: string;
  reason?: string;
  time: string;
  action: string;
  tone: Tone;
  icon: typeof Phone;
  loopDetail?: LoopDetail;
  // Subagent-originated insights carry these so the drawer can render the full
  // analysis context (what was investigated, by which subagent, with what
  // confidence) instead of generic "Harwick surfaced this" language.
  subagentType?: "research" | "writer" | "calendar" | "routing";
  subagentConfidence?: number;
  subagentTaskId?: string;
  subagentFindings?: Array<{
    subject: string;
    observation: string;
    implication: string;
    confidence: number;
  }>;
  subagentNextSteps?: Array<{
    who: string;
    action: string;
    why: string;
    urgency: "now" | "this_week" | "this_month" | "later";
  }>;
  subagentBlockers?: string[];
  subagentDataGaps?: string[];
};

type DashboardHealthRow = { label: string; value: string; tone: "green" | "amber" | "red"; detail?: string | null };
type AssistantArtifact = NonNullable<HarwickAssistantResponse["artifact"]>;
type AssistantReasoningStep = { detail: string; icon: LucideIcon; label: string; status: "active" | "complete" | "pending" };
type AssistantTurn = {
  answer: string;
  artifact?: AssistantArtifact;
  id: string;
  isStreaming?: boolean;
  question: string;
  reasoningSteps: AssistantReasoningStep[];
  scope: string;
  toolCalls: HarwickAssistantResponse["toolCalls"];
};
type InlineQuestionOption = { label: string; value: string };
type PendingInlineQuestion = {
  helper: string;
  id: string;
  minSelections: number;
  options: InlineQuestionOption[];
  question: string;
  selectionMode: "single" | "multiple";
  submitLabel: string;
};
type AssistantMentionType = "lead" | "person" | "harwick";
type AssistantMentionOption = {
  id: string;
  label: string;
  subtitle: string;
  type: AssistantMentionType;
};
type ChatStarterCard = {
  description: string;
  icon: LucideIcon;
  prompt: string;
  title: string;
  tone: HarwickSurfaceTone;
};
type ChatToolAction = {
  icon: LucideIcon;
  label: string;
  prompt: string;
};
type HarwickAssistantStreamEvent =
  | {
      type: "response-metadata";
      data: {
        reasoningSteps: Array<{ detail: string; label: string }>;
        scope: string;
        toolCalls: HarwickAssistantResponse["toolCalls"];
      };
    }
  | { type: "answer-chunk"; data: string }
  | { type: "artifact-start"; data: AssistantArtifact }
  | { type: "artifact-chunk"; data: string }
  | { type: "follow-up-question"; data: HarwickAssistantResponse["followUpQuestion"] }
  | { type: "done"; data: null };

export type HomePageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
  operatorMemberId: string;
};

export function readObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];
  return typeof value === "boolean" ? value : null;
}

function mapHarwickLoopPayloadToDetail(payload: Record<string, unknown>): LoopDetail | null {
  const actionPlan = readObject(payload["actionPlan"]);
  const intelligence = readObject(payload["intelligence"]);
  const audience = readObject(intelligence?.["audience"] ?? null);
  const notification = readObject(intelligence?.["notification"] ?? null);
  const proposedRaw = Array.isArray(actionPlan?.["proposedToolCalls"])
    ? actionPlan["proposedToolCalls"]
    : Array.isArray(payload["proposedToolCalls"])
      ? payload["proposedToolCalls"]
      : [];
  const proposedToolCalls = proposedRaw.flatMap((item): LoopToolCallDetail[] => {
    const record = readObject(item);
    const tool = record === null ? null : readString(record, "tool");
    if (record === null || tool === null) return [];
    return [{
      tool,
      reason: readString(record, "reason") ?? "Harwick proposed this tool call.",
      requiresApproval: readBoolean(record, "requiresApproval") ?? true,
    }];
  });

  const detail: LoopDetail = { proposedToolCalls };
  const outputMode = readString(payload, "outputMode");
  const draftBody = readString(payload, "draftBody");
  const agentLoopBrief = readString(actionPlan ?? {}, "executionBrief");
  const audienceReason = readString(audience ?? {}, "reason");
  const notificationMode = readString(notification ?? {}, "mode");
  const notificationReason = readString(notification ?? {}, "reason");
  if (outputMode !== null) detail.outputMode = outputMode;
  if (draftBody !== null) detail.draftBody = draftBody;
  if (agentLoopBrief !== null) detail.agentLoopBrief = agentLoopBrief;
  if (audienceReason !== null) detail.audienceReason = audienceReason;
  if (notificationMode !== null) detail.notificationMode = notificationMode;
  if (notificationReason !== null) detail.notificationReason = notificationReason;

  return Object.keys(detail).length === 1 && proposedToolCalls.length === 0 ? null : detail;
}

function mapHomePayloadToHealth(payload: Record<string, unknown>): DashboardHealthRow[] {
  const readiness = readObject(payload["readiness"]);
  const items = Array.isArray(readiness?.["items"]) ? readiness["items"] : [];
  return items.flatMap((item) => {
    const row = readObject(item);
    if (row === null) return [];
    const label = readString(row, "label");
    const status = readString(row, "status");
    if (label === null || status === null) return [];
    return [{
      label,
      value: status === "ready" ? "Live" : status === "degraded" ? "Review" : "Setup",
      tone: status === "ready" ? "green" : "amber",
      detail: readString(row, "detail"),
    }];
  });
}

function toneFromHarwickPriority(priority: HarwickHomeWorkItem["priority"]): Tone {
  if (priority === "urgent") return "red";
  if (priority === "high") return "amber";
  if (priority === "low") return "stone";
  return "green";
}

function mapHarwickWorkItemToQueueItem(item: HarwickHomeWorkItem, thread: ConversationInboxThread | null): WorkItem {
  const loopDetail = mapHarwickLoopPayloadToDetail(item.payload);
  // Strip the "Subagent result: " prefix so titles read like the analysis they
  // are, not like a debug log line.
  const cleanedTitle = item.title.replace(/^subagent result:\s*/i, "");
  const task: Task = {
    workspaceId: item.workspaceId,
    workItemId: item.id,
    workItemType: item.type,
    type: "insight",
    label: item.type === "approval" ? "Approval" : "Insight",
    title: cleanedTitle,
    detail: item.summary,
    reason: item.reason,
    time: item.dueAt ?? item.createdAt,
    action: item.recommendedAction,
    tone: toneFromHarwickPriority(item.priority),
    icon: ListChecks,
  };
  if (item.leadId !== null) task.leadId = item.leadId;
  if (loopDetail !== null) task.loopDetail = loopDetail;
  if (thread !== null) task.thread = thread;

  // Surface subagent-source metadata for the drawer when this work item was
  // produced by the subagent executor.
  const payload = item.payload;
  const subagentType = payload["subagentType"];
  if (subagentType === "research" || subagentType === "writer" || subagentType === "calendar" || subagentType === "routing") {
    task.subagentType = subagentType;
  }
  const confidence = payload["confidence"];
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    task.subagentConfidence = confidence;
  }
  const taskId = payload["taskId"];
  if (typeof taskId === "string" && taskId.length > 0) {
    task.subagentTaskId = taskId;
  }

  // Findings + next-steps + blockers + dataGaps come through as arrays on the
  // payload. Validate shape per element so a malformed payload doesn't crash
  // the home queue.
  type Finding = { subject: string; observation: string; implication: string; confidence: number };
  const rawFindings = payload["findings"];
  if (Array.isArray(rawFindings)) {
    const findings: Finding[] = rawFindings.flatMap((entry): Finding[] => {
      if (entry === null || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      if (typeof row["subject"] !== "string" || typeof row["observation"] !== "string"
        || typeof row["implication"] !== "string" || typeof row["confidence"] !== "number") {
        return [];
      }
      return [{
        subject: row["subject"],
        observation: row["observation"],
        implication: row["implication"],
        confidence: row["confidence"],
      }];
    });
    if (findings.length > 0) task.subagentFindings = findings;
  }

  const rawNextSteps = payload["nextSteps"];
  if (Array.isArray(rawNextSteps)) {
    const steps = rawNextSteps.flatMap((entry) => {
      if (entry === null || typeof entry !== "object") return [];
      const row = entry as Record<string, unknown>;
      const who = row["who"];
      const action = row["action"];
      const why = row["why"];
      const urgency = row["urgency"];
      if (typeof who !== "string" || typeof action !== "string"
        || typeof why !== "string") {
        return [];
      }
      let nextStepUrgency: "now" | "this_week" | "this_month" | "later";
      if (urgency === "now" || urgency === "this_week" || urgency === "this_month" || urgency === "later") {
        nextStepUrgency = urgency;
      } else {
        return [];
      }
      return [{
        who,
        action,
        why,
        urgency: nextStepUrgency,
      }];
    });
    if (steps.length > 0) task.subagentNextSteps = steps;
  }

  const rawBlockers = payload["blockers"];
  if (Array.isArray(rawBlockers)) {
    const blockers = rawBlockers.filter((entry): entry is string => typeof entry === "string");
    if (blockers.length > 0) task.subagentBlockers = blockers;
  }

  const rawDataGaps = payload["dataGaps"];
  if (Array.isArray(rawDataGaps)) {
    const gaps = rawDataGaps.filter((entry): entry is string => typeof entry === "string");
    if (gaps.length > 0) task.subagentDataGaps = gaps;
  }

  return {
    kind: "task",
    item: task,
  };
}

export function mapHomePayloadToWorkItems(
  payload: Record<string, unknown>,
  threadMap: Map<string, ConversationInboxThread>,
): WorkItem[] {
  const socialQueue = readObject(payload["socialQueue"]);
  const voiceQueue = readObject(payload["voiceQueue"]);
  const socialItems = Array.isArray(socialQueue?.["items"]) ? socialQueue["items"] : [];
  const voiceItems = Array.isArray(voiceQueue?.["items"]) ? voiceQueue["items"] : [];
  const harwickWorkItemsParsed = HarwickHomeWorkItemsResponseSchema.safeParse(payload["harwickWorkItems"]);
  const fubConflictsParsed = FollowUpBossConflictQueueResponseSchema.safeParse(payload["fubConflicts"]);
  const operationsFailuresParsed = OperationsFailureQueueResponseSchema.safeParse(payload["operationsFailures"]);

  const mappedSocial: WorkItem[] = socialItems.flatMap((item) => {
    const row = readObject(item);
    if (row === null) return [];
    const leadId = readString(row, "leadId");
    const workspaceId = readString(row, "workspaceId");
    const reviewId = readString(row, "id");
    const channel = readString(row, "channel") ?? "instagram_dm";
    const thread = leadId === null ? null : threadMap.get(leadId) ?? null;
    const reply: Reply = {
      automationMode: readString(row, "automationMode") === "human_takeover"
        ? "human_takeover"
        : readString(row, "automationMode") === "paused_by_rule"
          ? "paused_by_rule"
          : "ai_on",
      helper: thread?.aiSynthesis?.handoffBrief
        ?? thread?.automationReason
        ?? readString(row, "automationReason")
        ?? "Harwick used the latest thread and lead context.",
      source: channel.startsWith("facebook") ? "facebook" : "instagram",
      lead: thread?.name ?? `Lead ${leadId?.slice(0, 8) ?? "pending"}`,
      time: readString(row, "createdAt") ?? "now",
      message: thread?.preview ?? readString(row, "inboundText") ?? "New social message",
      draft: readString(row, "suggestedReply") ?? "",
    };
    if (workspaceId !== null) reply.workspaceId = workspaceId;
    if (reviewId !== null) reply.reviewId = reviewId;
    if (leadId !== null) reply.leadId = leadId;
    if (
      channel === "instagram_dm"
      || channel === "instagram_comment"
      || channel === "facebook_dm"
      || channel === "facebook_comment"
    ) {
      reply.channel = channel;
    }
    if (thread !== null) reply.thread = thread;
    return [{
      kind: "reply",
      item: reply,
    }];
  });

  const mappedVoice: WorkItem[] = voiceItems.flatMap((item) => {
    const row = readObject(item);
    if (row === null) return [];
    const workspaceId = readString(row, "workspaceId");
    const handoffId = readString(row, "id");
    const leadId = readString(row, "leadId");
    const thread = leadId === null ? null : threadMap.get(leadId) ?? null;
    const task: Task = {
      type: "callback",
      label: "Callback",
      title: `${readString(row, "callerName") ?? "Voice lead"} - ${readString(row, "urgency") ?? "callback"}`,
      detail: readString(row, "summary") ?? "Voice handoff is waiting for review.",
      time: readString(row, "createdAt") ?? "now",
      action: "Call back",
      tone: readString(row, "urgency") === "hot" ? "red" : "amber",
      icon: Phone,
    };
    if (workspaceId !== null) task.workspaceId = workspaceId;
    if (handoffId !== null) task.handoffId = handoffId;
    if (leadId !== null) task.leadId = leadId;
    if (thread !== null) task.thread = thread;
    return [{
      kind: "task",
      item: task,
    }];
  });

  const mappedHarwick = harwickWorkItemsParsed.success
    ? harwickWorkItemsParsed.data.items.map((item) => mapHarwickWorkItemToQueueItem(
      item,
      item.leadId === null ? null : threadMap.get(item.leadId) ?? null,
    ))
    : [];
  const mappedFubConflicts = fubConflictsParsed.success
    ? fubConflictsParsed.data.items.map((item): WorkItem => {
      const task: Task = {
        workspaceId: item.workspaceId,
        leadId: item.leadId,
        backsyncEventId: item.id.startsWith("fub_conflict:") ? item.id.slice("fub_conflict:".length) : item.id,
        workItemId: item.id,
        type: "crm",
        label: "FUB conflict",
        title: `Follow Up Boss ${item.eventType}`,
        detail: item.detail ?? `Contact ${item.followUpBossContactId} changed while this lead is assigned.`,
        reason: "Replay queues the back-sync reconciler.",
        time: item.occurredAt,
        action: "Replay sync",
        tone: item.status === "failed" ? "red" : "amber",
        icon: GitBranch,
      };
      const thread = threadMap.get(item.leadId);
      if (thread !== undefined) task.thread = thread;
      return {
        kind: "task",
        item: task,
      };
    })
    : [];
  const mappedOperationsFailures = operationsFailuresParsed.success
    ? operationsFailuresParsed.data.items.map((item): WorkItem => {
      const [, ...rest] = item.id.split(":");
      return {
        kind: "task",
        item: {
          workspaceId: item.workspaceId ?? operationsFailuresParsed.data.workspaceId,
          workItemId: item.id,
          operationsFailureResourceId: rest.join(":") || item.id,
          operationsFailureItemType: item.itemType,
          operationsFailureRetryable: item.retryable,
          type: "crm",
          label: item.itemType === "provider_error" ? "Provider" : "Worker",
          title: item.title,
          detail: item.detail ?? `${item.provider ?? "Provider"} needs review.`,
          reason: `Status: ${item.status}${item.provider === null ? "" : ` / Provider: ${item.provider}`}`,
          time: item.occurredAt,
          action: item.retryable ? "Retry now" : "Review",
          tone: item.retryable ? "red" : "amber",
          icon: GitBranch,
        },
      };
    })
    : [];

  // Scheduled callbacks from lead_tasks (status=pending, task_type=callback).
  // These are rows created by the /leads drawer Schedule popover, the voice
  // handoff callback flow, and Harwick-initiated callbacks. Surfacing them
  // here is what stops /home from looking empty when work actually exists.
  const callbackQueueRaw = readObject(payload["callbackQueue"]);
  const callbackItems = Array.isArray(callbackQueueRaw?.["items"]) ? callbackQueueRaw["items"] : [];
  const mappedCallbacks: WorkItem[] = callbackItems.flatMap((entry): WorkItem[] => {
    const row = readObject(entry);
    if (row === null) return [];
    const workspaceId = readString(row, "workspaceId");
    const leadId = readString(row, "leadId");
    const title = readString(row, "title") ?? "Scheduled callback";
    const detail = readString(row, "detail") ?? "Pending callback awaiting action.";
    const dueAt = readString(row, "dueAt");
    const priority = readString(row, "priority") ?? "normal";
    const taskId = readString(row, "id");
    const thread = leadId === null ? null : threadMap.get(leadId) ?? null;

    const task: Task = {
      type: "callback",
      label: "Callback",
      title,
      detail,
      time: dueAt ?? readString(row, "createdAt") ?? new Date().toISOString(),
      action: "Call back",
      tone: priority === "urgent" ? "red" : priority === "high" ? "amber" : "green",
      icon: Phone,
    };
    if (workspaceId !== null) task.workspaceId = workspaceId;
    if (leadId !== null) task.leadId = leadId;
    if (taskId !== null) task.workItemId = taskId;
    if (thread !== null) task.thread = thread;

    return [{
      kind: "task",
      item: task,
    }];
  });

  return [...mappedCallbacks, ...mappedHarwick, ...mappedOperationsFailures, ...mappedFubConflicts, ...mappedSocial, ...mappedVoice];
}

export function getWorkItemKey(entry: WorkItem): string {
  return entry.kind === "reply" ? `reply:${entry.item.reviewId ?? entry.item.lead}` : `task:${entry.item.workItemId ?? entry.item.title}`;
}

function getWorkItemLeadName(entry: WorkItem): string {
  if (entry.kind === "reply") {
    return entry.item.thread?.name ?? entry.item.lead;
  }
  return entry.item.thread?.name ?? entry.item.title.split(" - ")[0] ?? entry.item.title;
}

function getWorkItemChannel(entry: WorkItem): string {
  if (entry.kind === "reply") {
    if (entry.item.thread !== undefined) {
      return `${entry.item.thread.sourceLabel} ${entry.item.thread.channelLabel}`;
    }
    return entry.item.source === "instagram" ? "Instagram" : "Facebook";
  }
  if (entry.item.thread !== undefined) {
    return `${entry.item.thread.sourceLabel} ${entry.item.thread.channelLabel}`;
  }
  if (entry.item.type === "callback") return "Voice";
  if (entry.item.type === "insight") return "Harwick";
  return "Operations";
}

function getWorkItemThread(entry: WorkItem): ConversationInboxThread | null {
  return entry.kind === "reply" ? entry.item.thread ?? null : entry.item.thread ?? null;
}

function getWorkItemSummary(entry: WorkItem): string {
  const thread = getWorkItemThread(entry);
  return thread?.aiSynthesis?.handoffBrief
    ?? thread?.preview
    ?? (entry.kind === "reply" ? entry.item.message : entry.item.detail);
}

function getWorkItemReason(entry: WorkItem): string {
  const thread = getWorkItemThread(entry);
  return thread?.automationReason
    ?? (entry.kind === "reply" ? entry.item.helper : entry.item.reason ?? entry.item.detail);
}

function getWorkItemRecommendation(entry: WorkItem): string {
  const thread = getWorkItemThread(entry);
  return thread?.aiSynthesis?.nextAction
    ?? (entry.kind === "reply" ? "Review Harwick's draft and decide whether it should go live." : entry.item.action);
}

function getWorkItemChips(entry: WorkItem): string[] {
  const thread = getWorkItemThread(entry);
  if (thread === null) {
    return [getWorkItemChannel(entry), getPriorityLabel(entry)];
  }

  const liveFieldValues = thread.aiSynthesis?.liveFields.map((field) => field.value) ?? [];
  const synthesisMissingFields = thread.aiSynthesis?.missingFields ?? [];
  return [
    `${thread.score} score`,
    thread.stageLabel,
    thread.intentType,
    thread.area,
    ...liveFieldValues.slice(0, 2),
    ...synthesisMissingFields.slice(0, 2),
  ]
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && value.toLowerCase() !== "unknown" && values.indexOf(value) === index)
    .slice(0, 5);
}

function getWorkItemReviewHref(entry: WorkItem): string {
  const thread = getWorkItemThread(entry);
  if (thread === null) return "/conversations";
  const params = new URLSearchParams({ leadId: thread.leadId });
  if (thread.reviewId !== null) {
    params.set("reviewId", thread.reviewId);
  }
  return `/conversations?${params.toString()}`;
}

function getLeadHref(entry: WorkItem): string | null {
  const leadId = getWorkItemLeadId(entry);
  return leadId === null ? null : `/leads?leadId=${leadId}`;
}

function getWorkItemLeadId(entry: WorkItem): string | null {
  const thread = getWorkItemThread(entry);
  return thread?.leadId ?? (entry.kind === "reply" ? entry.item.leadId ?? null : entry.item.leadId ?? null);
}

function getWorkItemScore(entry: WorkItem): number {
  const thread = getWorkItemThread(entry);
  if (thread !== null) {
    return thread.score;
  }
  const tone = getWorkItemTone(entry);
  return tone === "red" ? 91 : tone === "amber" ? 74 : tone === "green" ? 87 : 58;
}

function getWorkItemRecommendations(entry: WorkItem): string[] {
  const thread = getWorkItemThread(entry);
  if (thread !== null) {
    const recommendations = [
      thread.aiSynthesis?.nextAction ?? "",
      ...(thread.aiSynthesis?.toolActivity.map((activity) => activity.summary) ?? []),
      ...(thread.aiSynthesis?.missingFields.map((field) => `Capture ${field}`) ?? []),
    ]
      .map((value) => value.trim())
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
      .slice(0, 3);

    if (recommendations.length > 0) {
      return recommendations;
    }
  }

  if (entry.kind === "reply") {
    return [
      "Review the draft against the latest thread",
      "Send if the qualification question is still correct",
      "Take over if the lead needs a human tone",
    ];
  }

  return [
    entry.item.action,
    "Keep the queue state current",
    "Open the related record if more context is needed",
  ];
}

function getWorkItemRequirements(entry: WorkItem): Array<{ icon: LucideIcon; label: string; value: string }> {
  const thread = getWorkItemThread(entry);
  if (thread !== null) {
    return [
      { icon: DollarSign, label: "Budget", value: thread.budget },
      { icon: Clock, label: "Timeline", value: thread.timeline },
      { icon: HomeIcon, label: "Intent", value: thread.intentType },
      { icon: MapPin, label: "Area", value: thread.area },
    ].filter((item) => item.value.trim().length > 0 && item.value.toLowerCase() !== "unknown");
  }

  const task = entry.kind === "task" ? entry.item : null;
  return [
    { icon: DollarSign, label: "Value", value: entry.kind === "reply" ? "qualification" : task?.type ?? "work" },
    { icon: Clock, label: "Timeline", value: entry.kind === "reply" ? entry.item.time : task?.time ?? "now" },
    { icon: HomeIcon, label: "Type", value: entry.kind === "reply" ? "Social lead" : task?.label ?? "Task" },
    { icon: MapPin, label: "Location", value: getWorkItemChannel(entry) },
  ];
}

function getWorkItemSummaryLabel(entry: WorkItem): string {
  const thread = getWorkItemThread(entry);
  if (thread !== null) {
    return "Conversation Summary";
  }
  return entry.kind === "reply" ? "Conversation Summary" : "Work Summary";
}

function getWorkItemSummaryText(entry: WorkItem): string {
  const thread = getWorkItemThread(entry);
  if (thread !== null) {
    return thread.aiSynthesis?.handoffBrief
      ?? thread.aiSynthesis?.documentUpdate
      ?? thread.preview;
  }
  return entry.kind === "reply" ? entry.item.message : entry.item.detail;
}

function getWorkItemContactRows(entry: WorkItem): Array<{ icon: LucideIcon; label: string; value: string }> {
  const thread = getWorkItemThread(entry);
  if (thread !== null) {
    return [
      { icon: User, label: "Assigned", value: thread.assignedTo },
      { icon: Mail, label: "Channel", value: `${thread.sourceLabel} ${thread.channelLabel}` },
      { icon: Phone, label: "Context", value: thread.sourceContext },
      {
        icon: Bot,
        label: "Automation",
        value: thread.automationReason ?? thread.listingStatus,
      },
    ].filter((row) => row.value.trim().length > 0);
  }

  const task = entry.kind === "task" ? entry.item : null;
  return [
    { icon: Mail, label: "Email", value: entry.kind === "reply" ? `lead-${entry.item.leadId?.slice(0, 8) ?? "pending"}@workspace.local` : "not captured yet" },
    { icon: Phone, label: "Channel", value: entry.kind === "reply" ? "social channel" : task?.type === "callback" ? "voice handoff" : "workspace task" },
  ];
}

function getWorkItemTone(entry: WorkItem): Tone {
  return entry.kind === "reply" ? entry.item.automationMode === "ai_on" ? "green" : "amber" : entry.item.tone;
}

function getEntryNextAction(entry: WorkItem | null): string {
  if (entry === null) return "Ask a question or choose a work item.";
  if (entry.kind === "reply") return "Approve, edit, or take over before anything leaves the channel.";
  if (entry.item.type === "callback") return "Create a callback task or mark the handoff reviewed.";
  if (entry.item.type === "crm") return "Replay or resolve the sync issue before the next CRM cycle.";
  return entry.item.action;
}

function getQueueIcon(entry: WorkItem): LucideIcon {
  if (entry.kind === "reply") return MessageSquare;
  if (entry.item.type === "callback") return Phone;
  if (entry.item.type === "listing") return HomeIcon;
  if (entry.item.type === "crm") return AlertCircle;
  if (entry.item.workItemType === "approval") return Calendar;
  return entry.item.icon;
}

function getPriorityLabel(entry: WorkItem): "urgent" | "high" | "medium" | "low" {
  const tone = getWorkItemTone(entry);
  if (tone === "red") return "urgent";
  if (tone === "amber") return "high";
  if (tone === "green") return "medium";
  return "low";
}

function priorityClass(priority: "urgent" | "high" | "medium" | "low"): string {
  if (priority === "urgent") return "bg-oxblood text-harwick-paper";
  if (priority === "high") return "bg-clay-soft text-clay";
  if (priority === "medium") return "bg-sage-soft text-sage";
  return "bg-stone-soft text-stone";
}

function formatQueueTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffHours = Math.floor((date.getTime() - Date.now()) / (1000 * 60 * 60));
  if (diffHours < 0) return "overdue";
  if (diffHours === 0) return "soon";
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

function buildChatStarterCards(params: {
  dashboardHealth: DashboardHealthRow[];
  dashboardWorkItems: WorkItem[];
  operatorRole: WorkspaceRole;
  ownerQueueItems: OwnerHomeQueueItem[];
  recentLeads: RecentLeadItem[];
  routingDeskItems: RoutingDeskItem[];
}): ChatStarterCard[] {
  const cards: ChatStarterCard[] = [];

  if (params.operatorRole === "owner" || params.operatorRole === "admin") {
    cards.push({
      description: "Get the owner-only exceptions, approvals, and brokerage risks that Harwick could not clear alone.",
      icon: Bot,
      prompt: "Give me the owner command brief. What needs my judgment right now across the brokerage?",
      title: "Owner command brief",
      tone: "command",
    });
  } else {
    cards.push({
      description: "See the work Harwick surfaced for you first, in the order it should be cleared.",
      icon: MessageSquare,
      prompt: "What should I clear first from my queue right now?",
      title: "What needs me first?",
      tone: "focus",
    });
  }

  cards.push({
    description: "Walk the active routing pressure, explain the decisions, and tell me where Harwick wants a human call.",
    icon: GitBranch,
    prompt: `Review the ${params.routingDeskItems.filter((item) => item.decision.status !== "assigned").length} routing decisions waiting right now and tell me what to do first.`,
    title: "Routing review",
    tone: "routing",
  });

  if (params.dashboardWorkItems.length > 0) {
    cards.push({
      description: "Turn the live queue into a tight action plan instead of making me inspect every item manually.",
      icon: ListChecks,
      prompt: "Convert the current work queue into a prioritized action plan with the exact next move for each item.",
      title: "Action plan",
      tone: "focus",
    });
  }

  if (params.dashboardHealth.some((row) => row.tone !== "green")) {
    cards.push({
      description: "See what system or provider issue could block Harwick before it turns into a bigger ops miss.",
      icon: AlertCircle,
      prompt: "What system risk or provider issue is most likely to block Harwick right now?",
      title: "System watch",
      tone: "attention",
    });
  }

  if (cards.length < 4 && params.recentLeads.length > 0) {
    cards.push({
      description: "Look at the newest leads and tell me who needs a reply, routing move, or human intervention.",
      icon: HomeIcon,
      prompt: "Review the newest leads and tell me which one needs action first.",
      title: "Recent leads",
      tone: "memory",
    });
  }

  if (cards.length < 4 && params.ownerQueueItems.length > 0) {
    cards.push({
      description: "Collapse owner queue items into the shortest possible decision list.",
      icon: CheckCircle2,
      prompt: "Turn the owner queue into a concise decision list for me.",
      title: "Decision list",
      tone: "command",
    });
  }

  return cards.slice(0, 4);
}

function buildChatToolActions(role: WorkspaceRole): ChatToolAction[] {
  const base: ChatToolAction[] = [
    { icon: Search, label: "diagnose queue", prompt: "Diagnose the live queue and tell me what is actually blocked versus just noisy." },
    { icon: GitBranch, label: "review routing", prompt: "Review routing and explain which leads need a human routing call." },
    { icon: MessageSquare, label: "draft reply", prompt: "Draft the best reply for the lead Harwick is focused on right now." },
    { icon: Database, label: "check FUB sync", prompt: "Check what needs to sync to Follow Up Boss and what looks at risk." },
    { icon: Wrench, label: "tool plan", prompt: "Show me the tool plan Harwick would use to handle this from start to finish." },
  ];

  if (role === "owner" || role === "admin") {
    return [
      { icon: ListChecks, label: "owner brief", prompt: "Give me the owner decision brief for the brokerage right now." },
      ...base,
    ];
  }

  return base;
}

function getToolUsageItems(entry: WorkItem | null): Array<{ detail: string | null; id: string; status: string; summary: string; tool: string }> {
  if (entry === null) return [];
  const thread = getWorkItemThread(entry);
  const threadTools = thread?.aiSynthesis?.toolActivity.map((activity) => ({
    detail: activity.detail,
    id: activity.id,
    status: activity.status.replace(/_/g, " "),
    summary: activity.summary,
    tool: activity.tool,
  })) ?? [];
  const loopTools = entry.kind === "task"
    ? (entry.item.loopDetail?.proposedToolCalls ?? []).map((toolCall, index) => ({
        detail: toolCall.reason,
        id: `${getWorkItemKey(entry)}:tool:${index}`,
        status: toolCall.requiresApproval ? "approval needed" : "ready",
        summary: toolCall.reason,
        tool: toolCall.tool,
      }))
    : [];

  return [...threadTools, ...loopTools].slice(0, 4);
}

function buildMentionOptions(params: {
  recentLeads: RecentLeadItem[];
  teamMembers: TeamPresenceMember[];
}): AssistantMentionOption[] {
  const teamMentions = params.teamMembers.map((member) => ({
    id: member.id,
    label: member.name,
    subtitle: `${member.roleLabel} · ${member.status.replace("_", " ")} · ${member.openWork} open work`,
    type: "person" as const,
  }));

  return [
    {
      id: "harwick",
      label: "harwick",
      subtitle: "Ask Harwick to reason, draft, compare, or create an artifact",
      type: "harwick",
    },
    ...params.recentLeads.map((lead) => ({
      id: lead.id,
      label: lead.name,
      subtitle: `${lead.stageLabel} · ${lead.sourceLabel} ${lead.channelLabel} · ${lead.lastTouchLabel}`,
      type: "lead" as const,
    })),
    ...teamMentions,
  ];
}

function iconForMention(type: AssistantMentionType): LucideIcon {
  if (type === "lead") return MessageSquare;
  if (type === "person") return User;
  return Bot;
}

function mentionInsertText(mention: AssistantMentionOption): string {
  return `@${mention.label.replace(/\s+/g, " ").trim()}`;
}

function toneAccentClassName(tone: HarwickSurfaceTone) {
  switch (tone) {
    case "attention":
      return "bg-oxblood";
    case "routing":
      return "bg-sage";
    case "memory":
      return "bg-stone";
    case "focus":
      return "bg-clay";
    case "command":
    default:
      return "bg-harwick-brass";
  }
}

function buildPendingQuestionFromResponse(response: HarwickAssistantResponse): PendingInlineQuestion | null {
  if (response.followUpQuestion === null) return null;
  return {
    helper: response.followUpQuestion.helper,
    id: `${Date.now()}:question`,
    minSelections: 1,
    options: response.followUpQuestion.options,
    question: response.followUpQuestion.question,
    selectionMode: "single",
    submitLabel: "continue",
  };
}

function buildReasoningStepsFromResponse(response: HarwickAssistantResponse): AssistantReasoningStep[] {
  const icons = [Search, AtSign, FileText, Wrench];
  return response.reasoningSteps.map((step, index) => ({
    detail: step.detail,
    icon: icons[index] ?? Wrench,
    label: step.label,
    status: "complete",
  }));
}

function buildReasoningStepsFromMetadata(reasoningSteps: Array<{ detail: string; label: string }>): AssistantReasoningStep[] {
  const icons = [Search, AtSign, FileText, Wrench];
  return reasoningSteps.map((step, index) => ({
    detail: step.detail,
    icon: icons[index] ?? Wrench,
    label: step.label,
    status: "complete",
  }));
}

function isHarwickAssistantResponse(value: unknown): value is HarwickAssistantResponse {
  return HarwickAssistantResponseSchema.safeParse(value).success;
}

function isHarwickAssistantStreamEvent(value: unknown): value is HarwickAssistantStreamEvent {
  const record = readObject(value);
  return record !== null && typeof record["type"] === "string" && "data" in record;
}

const HARWICK_LOADING_STATES = [
  {
    detail: "Sweeping live workspace context, mentions, and queue pressure into one tighter brief.",
    label: "Triaging the queue",
  },
  {
    detail: "Cross-checking live leads, team load, and the sharpest next move.",
    label: "Sharpening the signal",
  },
  {
    detail: "Braiding mentions, routing context, and active work into a tighter brief.",
    label: "Braiding the context",
  },
  {
    detail: "Untangling the live queue so Harwick can answer without drifting.",
    label: "Untying the routing knot",
  },
  {
    detail: "Pulling the right threads before Harwick writes back.",
    label: "Threading the next move",
  },
  {
    detail: "Scanning handoffs, mentions, and the operator lane for the cleanest reply path.",
    label: "Surveying the desk",
  },
  {
    detail: "Sorting what matters now from what can wait until the next pass.",
    label: "Sifting the noise",
  },
  {
    detail: "Tightening the answer so it lands like a polished owner brief.",
    label: "Polishing the brief",
  },
  {
    detail: "Checking who owns the lane, the lead, and the next move before answering.",
    label: "Charting the lane",
  },
  {
    detail: "Lining up the next move so Harwick can answer without losing the thread.",
    label: "Steadying the thread",
  },
] as const;

function pickHarwickLoadingState(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return HARWICK_LOADING_STATES[hash % HARWICK_LOADING_STATES.length] ?? HARWICK_LOADING_STATES[0];
}

function HarwickSpinnerLabel({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium text-[var(--sage)]">
      <RiLoader4Line
        aria-hidden="true"
        className="size-3.5 animate-spin"
      />
      <Shimmer className="text-[var(--sage)]" duration={1.8}>
        {`${label}...`}
      </Shimmer>
    </span>
  );
}

function summarizeAssistantToolPayload(payload: Record<string, unknown>): string | null {
  const fields = ["title", "listing", "reply", "instructions", "subagentType", "reason"]
    .map((key) => {
      const value = payload[key];
      return typeof value === "string" && value.trim().length > 0 ? `${key}: ${value.trim()}` : null;
    })
    .filter((value): value is string => value !== null);
  if (fields.length > 0) {
    return fields.slice(0, 2).join(" • ");
  }
  const keys = Object.keys(payload);
  return keys.length === 0 ? null : `${keys.length} payload field${keys.length === 1 ? "" : "s"}`;
}

async function readAssistantErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const payload = readObject(await response.json().catch(() => null));
    const message = payload !== null && typeof payload["message"] === "string" ? payload["message"].trim() : null;
    if (message !== null && message.length > 0) {
      return message;
    }
  }
  const text = (await response.text().catch(() => "")).trim();
  return text.length > 0 ? text : "Harwick assistant returned an invalid response.";
}

function speakBrowserVoice(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  const spoken = text.trim();
  if (spoken.length === 0) {
    return;
  }
  const utterance = new SpeechSynthesisUtterance(spoken);
  utterance.rate = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function InlineQuestionDeck(props: {
  pendingQuestion: PendingInlineQuestion | null;
  pendingSelections: string[];
  onOptionSelect: (value: string) => void;
  onSubmitSelections: () => void;
}) {
  if (props.pendingQuestion === null) return null;
  const allowsMultiple = props.pendingQuestion.selectionMode === "multiple";

  return (
    <PromptInputHeader className="w-full border-b border-harwick-border/80 bg-harwick-paper px-4 py-4">
      <div className="w-full">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-harwick-brass">guided question</span>
          <span className="rounded-full border border-harwick-border bg-harwick-linen px-2 py-1 text-[10px] text-harwick-brass">
            inline
          </span>
        </div>
        <p className="mt-3 text-sm font-medium leading-6 text-harwick-ink">{props.pendingQuestion.question}</p>
        <p className="mt-1 text-xs leading-5 text-stone">{props.pendingQuestion.helper}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {props.pendingQuestion.options.map((option) => {
            const selected = props.pendingSelections.includes(option.value);
            return (
              <button
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-[background-color,border-color,color]",
                  selected
                    ? "border-harwick-ink bg-harwick-ink text-harwick-paper"
                    : "border-harwick-border bg-harwick-paper text-stone hover:border-harwick-border-strong hover:text-harwick-ink",
                )}
                key={option.value}
                onClick={() => props.onOptionSelect(option.value)}
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>
        {allowsMultiple ? (
          <div className="mt-4 flex items-center justify-between border-t border-harwick-border/80 pt-3">
            <span className="text-xs text-stone">{props.pendingSelections.length} selected</span>
            <button
              className="rounded-full bg-harwick-ink px-4 py-2 text-xs font-medium text-harwick-paper disabled:opacity-40"
              disabled={props.pendingSelections.length < props.pendingQuestion.minSelections}
              onClick={props.onSubmitSelections}
              type="button"
            >
              {props.pendingQuestion.submitLabel}
            </button>
          </div>
        ) : null}
      </div>
    </PromptInputHeader>
  );
}

function MentionTargetPicker(props: {
  mentions: AssistantMentionOption[];
  selectedMentions: AssistantMentionOption[];
  onMentionToggle: (mention: AssistantMentionOption) => void;
}) {
  const controller = usePromptInputController();
  const selectedIds = new Set(props.selectedMentions.map((mention) => `${mention.type}:${mention.id}`));
  const groups: Array<{ label: string; type: AssistantMentionType }> = [
    { label: "Harwick", type: "harwick" },
    { label: "Leads", type: "lead" },
    { label: "People", type: "person" },
  ];

  function handleSelect(mention: AssistantMentionOption) {
    props.onMentionToggle(mention);
    const token = mentionInsertText(mention);
    const current = controller.textInput.value.trimEnd();
    const alreadyInserted = current.toLowerCase().includes(token.toLowerCase());
    if (!alreadyInserted) {
      controller.textInput.setInput(`${current}${current.length === 0 ? "" : " "}${token} `);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="harwick-home-control-button inline-flex h-8 items-center gap-1 rounded-[10px] px-2.5 text-[12.5px]"
          type="button"
        >
          <AtSign aria-hidden="true" className="size-3.5" />
          Mention
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="harwick-home-menu w-80 rounded-[14px] p-1.5">
        {groups.map((group) => {
          const items = props.mentions.filter((mention) => mention.type === group.type).slice(0, group.type === "lead" ? 8 : 5);
          if (items.length === 0) return null;
          return (
            <div key={group.type}>
              <div className="harwick-home-eyebrow px-2 py-1.5">
                {group.label}
              </div>
              {items.map((mention) => {
                const Icon = iconForMention(mention.type);
                const selected = selectedIds.has(`${mention.type}:${mention.id}`);
                return (
                  <DropdownMenuItem
                    className="harwick-home-menu-item flex cursor-pointer items-start gap-2 rounded-[10px] px-2 py-2 text-sm"
                    key={`${mention.type}:${mention.id}`}
                    onSelect={(event) => {
                      event.preventDefault();
                      handleSelect(mention);
                    }}
                  >
                    <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--sage)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-[var(--graphite-text)]">@{mention.label}</span>
                      <span className="block truncate text-xs text-[var(--graphite-text-subtle)]">{mention.subtitle}</span>
                    </span>
                    {selected ? <Check aria-hidden="true" className="mt-0.5 size-4 text-[var(--sage)]" /> : null}
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssistantComposer(props: {
  toolActions: ChatToolAction[];
  mentions: AssistantMentionOption[];
  pendingQuestion: PendingInlineQuestion | null;
  pendingSelections: string[];
  placeholder?: string;
  voiceActionPending: "daily" | "showing" | null;
  voiceShowingDisabled: boolean;
  onOptionSelect: (value: string) => void;
  onMentionToggle: (mention: AssistantMentionOption) => void;
  onRequestDailyBrief: () => void;
  onRequestShowingBrief: () => void;
  onSubmit: (message: string) => void | Promise<void>;
  onSubmitSelections: () => void;
  selectedMentions: AssistantMentionOption[];
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="mb-2 flex items-center gap-2 px-1">
        <button
          className="harwick-home-control-button inline-flex h-8 items-center gap-1 rounded-[10px] px-2.5 text-[12.5px] disabled:opacity-45"
          disabled={props.voiceActionPending !== null}
          onClick={props.onRequestDailyBrief}
          type="button"
        >
          Driving brief
        </button>
        <button
          className="harwick-home-control-button inline-flex h-8 items-center gap-1 rounded-[10px] px-2.5 text-[12.5px] disabled:opacity-45"
          disabled={props.voiceActionPending !== null || props.voiceShowingDisabled}
          onClick={props.onRequestShowingBrief}
          type="button"
        >
          Showing brief
        </button>
      </div>
      <PromptInputProvider>
        <PromptInput
          className={cn(
            "[&_[data-slot=input-group]]:overflow-hidden [&_[data-slot=input-group]]:shadow-none",
            "[&_[data-slot=input-group]]:rounded-[24px] [&_[data-slot=input-group]]:border-transparent [&_[data-slot=input-group]]:bg-transparent",
            "harwick-composer-dock",
          )}
          onSubmit={(message) => {
            const text = message.text.trim();
            if (text.length > 0 || props.pendingQuestion !== null) return props.onSubmit(text);
            return undefined;
          }}
        >
          <InlineQuestionDeck
            onOptionSelect={props.onOptionSelect}
            onSubmitSelections={props.onSubmitSelections}
            pendingQuestion={props.pendingQuestion}
            pendingSelections={props.pendingSelections}
          />
          {props.selectedMentions.length === 0 ? null : (
            <div className="flex flex-wrap gap-1.5 px-5 pt-3">
              {props.selectedMentions.map((mention) => (
                <span
                  className="harwick-home-token"
                  key={`${mention.type}:${mention.id}`}
                >
                  @{mention.label}
                  <button
                    aria-label={`Remove ${mention.label}`}
                    className="harwick-home-token-remove"
                    onClick={() => {
                      props.onMentionToggle(mention);
                    }}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <PromptInputBody>
            <PromptInputTextarea
              className={cn(
                "min-h-[88px] resize-none px-5 py-5 text-[15.5px] leading-7 text-[var(--graphite-text)] placeholder:text-[var(--graphite-text-faint)]",
                "focus:outline-none",
              )}
              placeholder={props.placeholder ?? "Ask Harwick anything. Type @lead, @person, or @harwick."}
              ref={textareaRef}
            />
          </PromptInputBody>
          <PromptInputFooter className="border-t border-[var(--graphite-line)] px-3 py-2">
            <PromptInputTools className="gap-1">
              <ComposerAttachmentButton />
              <ComposerToolMenu actions={props.toolActions} />
              <MentionTargetPicker
                mentions={props.mentions}
                onMentionToggle={props.onMentionToggle}
                selectedMentions={props.selectedMentions}
              />
              <PromptInputSpeechButton
                className="harwick-home-icon-button inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--graphite-line)] bg-[var(--graphite-surface-1)] text-[var(--graphite-text-muted)] shadow-none hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]"
                textareaRef={textareaRef}
              />
            </PromptInputTools>
            <PromptInputSubmit
              className={cn(
                "size-9 rounded-full border border-[var(--graphite-line)] bg-[var(--graphite-text)] text-[var(--graphite-2)] shadow-[var(--shadow-elev-2)]",
                "transition hover:brightness-105 disabled:opacity-40",
              )}
            >
              <Send aria-hidden="true" className="size-4" />
            </PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </PromptInputProvider>
    </div>
  );
}

// ComposerStarterCards has been folded into AssistantHero's capability columns.
// Keeping the symbol removed reduces visual noise and matches the
// single-canvas direction (no card-grid overlay above the composer).

function ComposerToolMenu(props: {
  actions: ChatToolAction[];
}) {
  const controller = usePromptInputController();

  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger className="harwick-home-control-button h-8 gap-1 rounded-[10px] px-2.5 text-[12.5px] shadow-none">
        <Wrench aria-hidden="true" className="size-3.5" />
        Tools
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent className="harwick-home-menu w-72 rounded-[14px] p-1.5">
        <PromptInputActionAddAttachments className="harwick-home-menu-item rounded-[10px]" />
        {props.actions.map((action) => (
          <PromptInputActionMenuItem
            className="harwick-home-menu-item rounded-[10px]"
            key={action.label}
            onSelect={() => {
              controller.textInput.setInput(action.prompt);
            }}
          >
            <action.icon className="mr-2 size-4" />
            {action.label}
          </PromptInputActionMenuItem>
        ))}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
}

function ComposerAttachmentButton() {
  const attachments = usePromptInputAttachments();

  return (
    <button
      aria-label="Attach files"
      className="harwick-home-icon-button inline-flex size-8 items-center justify-center rounded-[10px]"
      onClick={() => attachments.openFileDialog()}
      type="button"
    >
      <Paperclip aria-hidden="true" className="size-4" />
    </button>
  );
}

function buildLandingPromptChips(params: {
  isOwnerHome: boolean;
  liveQueueCount: number;
  liveRoutingCount: number;
}): Array<{ label: string; prompt: string; tone: HarwickSurfaceTone }> {
  const prompts = [
    params.isOwnerHome
      ? {
          label: "what needs my judgment?",
          prompt: "Give me the owner decision brief for the brokerage right now.",
          tone: "command" as const,
        }
      : {
          label: "what needs me first?",
          prompt: "What should I clear first from my queue right now?",
          tone: "focus" as const,
        },
    {
      label: "what is in queue right now?",
      prompt: `Summarize the ${params.liveQueueCount} live queue item${params.liveQueueCount === 1 ? "" : "s"} and tell me what matters first.`,
      tone: "memory" as const,
    },
    {
      label: "what needs a routing call?",
      prompt: `Review the ${params.liveRoutingCount} routing decision${params.liveRoutingCount === 1 ? "" : "s"} waiting right now and tell me where a human should step in.`,
      tone: "routing" as const,
    },
    {
      label: "what could block Harwick?",
      prompt: "What system risk or provider issue is most likely to block Harwick right now?",
      tone: "attention" as const,
    },
    {
      label: "write me an action plan",
      prompt: "Convert the current work queue into a prioritized action plan with the exact next move for each item.",
      tone: "focus" as const,
    },
  ];

  return prompts.filter((item, currentIndex, values) => (
    values.findIndex((value) => value.label === item.label) === currentIndex
  ));
}

function AssistantCapabilityColumn(props: {
  actions: Array<{ label: string; prompt: string }>;
  onSubmit: (message: string) => void | Promise<void>;
  title: string;
  tone: HarwickSurfaceTone;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", toneAccentClassName(props.tone))} />
        <p className="harwick-home-eyebrow">{props.title}</p>
      </div>
      <div className="space-y-1.5">
        {props.actions.map((action) => (
          <button
            className="harwick-home-panel harwick-home-panel-hover flex w-full items-center justify-between gap-3 rounded-[14px] px-4 py-3 text-left text-[13.5px] text-[var(--graphite-text-muted)]"
            key={action.label}
            onClick={() => {
              void props.onSubmit(action.prompt);
            }}
            type="button"
          >
            <span>{action.label}</span>
            <ChevronRight aria-hidden="true" className="size-3.5 text-[var(--graphite-text-faint)]" />
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantHero(props: {
  firstName: string;
  isOwnerHome: boolean;
  liveQueueCount: number;
  liveRoutingCount: number;
  onSubmit: (message: string) => void | Promise<void>;
  starterCards: ChatStarterCard[];
  toolActions: ChatToolAction[];
}) {
  const promptChips = buildLandingPromptChips({
    isOwnerHome: props.isOwnerHome,
    liveQueueCount: props.liveQueueCount,
    liveRoutingCount: props.liveRoutingCount,
  });
  const operatingActions = props.starterCards.slice(0, 3).map((card) => ({
    label: card.title,
    prompt: card.prompt,
  }));
  const workspaceActions = props.toolActions.slice(0, 3).map((action) => ({
    label: action.label,
    prompt: action.prompt,
  }));

  return (
    <div className="harwick-hero-fade mx-auto w-full max-w-3xl space-y-10 pt-6 md:pt-12">
      <div className="space-y-4 text-center">
        <img
          alt=""
          aria-hidden="true"
          className="mx-auto h-10 w-auto object-contain opacity-95 md:h-12"
          src="/harwick-gemini-logo.png"
        />
        <p className="harwick-home-eyebrow">harwick · chief of staff</p>
        <h1
          className="harwick-home-title text-balance text-[44px] leading-[1.04] md:text-[56px]"
          style={{ fontWeight: 400 }}
        >
          good to see you, {props.firstName.toLowerCase()}.
        </h1>
      </div>

      {promptChips.length === 0 ? null : (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {promptChips.map((chip) => (
            <button
              className="harwick-prompt-chip"
              key={chip.label}
              onClick={() => {
                void props.onSubmit(chip.prompt);
              }}
              type="button"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
        <AssistantCapabilityColumn actions={operatingActions} onSubmit={props.onSubmit} title="what harwick can do" tone="command" />
        <AssistantCapabilityColumn actions={workspaceActions} onSubmit={props.onSubmit} title="see across the workspace" tone="routing" />
      </div>
    </div>
  );
}

function ReasoningTrace(props: { isStreaming: boolean | undefined; steps: AssistantReasoningStep[] }) {
  const activeLabel = props.steps.find((step) => step.status === "active")?.label ?? props.steps[0]?.label ?? "Braiding the context";
  const restingLabel = props.steps.length <= 1 ? (props.steps[0]?.label ?? "Reasoning") : `${props.steps.length} reasoning steps`;
  const visibleSteps = props.isStreaming
    ? props.steps.filter((step) => !(step.status === "active" && step.label === activeLabel))
    : props.steps;

  return (
    <ChainOfThought className="mb-2.5 w-full space-y-2" defaultOpen>
      <ChainOfThoughtHeader className="gap-2 text-[12px] font-medium text-[var(--graphite-text-subtle)] hover:text-[var(--graphite-text)]">
        {props.isStreaming ? <HarwickSpinnerLabel label={activeLabel} /> : restingLabel}
      </ChainOfThoughtHeader>
      {visibleSteps.length === 0 ? null : (
        <ChainOfThoughtContent className="space-y-3">
          {visibleSteps.map((step) => {
            const Icon = step.icon;
            return (
              <ChainOfThoughtStep
                className="gap-3 text-[13px] leading-6"
                description={<span className="text-[12.5px] leading-5 text-[var(--graphite-text-subtle)]">{step.detail}</span>}
                icon={Icon}
                key={step.label}
                label={<span className="font-medium text-[var(--graphite-text)]">{step.label}</span>}
                status={step.status}
              />
            );
          })}
        </ChainOfThoughtContent>
      )}
    </ChainOfThought>
  );
}

function ArtifactPreview({ artifact }: { artifact: AssistantArtifact }) {
  return (
    <div className="harwick-home-panel mt-3 overflow-hidden rounded-[16px] shadow-[var(--shadow-elev-2)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--graphite-line)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-[var(--sage)]" />
          <span className="truncate text-[13.5px] font-medium text-[var(--graphite-text)]">{artifact.title}</span>
          <Badge className="harwick-home-chip px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]" variant="outline">
            {artifact.type}
          </Badge>
        </div>
        <button
          aria-label="Copy artifact"
          className="harwick-home-icon-button flex size-8 items-center justify-center rounded-full border border-[var(--graphite-line)]"
          onClick={() => {
            void navigator.clipboard.writeText(artifact.body);
          }}
          type="button"
        >
          <ClipboardIcon aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-5 py-4 text-[13px] leading-6 text-[var(--graphite-text)]">
        {artifact.body}
      </pre>
    </div>
  );
}

function PlanGate(props: {
  decision: "approved" | "rejected" | null;
  onApprove: () => void;
  onReject: () => void;
  show: boolean;
}) {
  if (!props.show) return null;

  return (
    <Confirmation
      approval={props.decision === null ? { id: "harwick-plan" } : { approved: props.decision === "approved", id: "harwick-plan" }}
      className="harwick-home-panel mx-auto max-w-3xl text-[var(--graphite-text)] shadow-[var(--shadow-elev-2)]"
      state={props.decision === null ? "approval-requested" : "approval-responded"}
    >
      <ConfirmationTitle>Harwick can build this plan from live workspace context before taking an external action.</ConfirmationTitle>
      <ConfirmationRequest>
        <ConfirmationActions>
          <ConfirmationAction className="border-[var(--graphite-line)] bg-transparent text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]" onClick={props.onReject} variant="outline">
            revise
          </ConfirmationAction>
          <ConfirmationAction
            className="bg-[var(--sage)] text-[var(--graphite-2)] hover:brightness-105"
            onClick={props.onApprove}
          >
            approve plan
          </ConfirmationAction>
        </ConfirmationActions>
      </ConfirmationRequest>
      <ConfirmationAccepted>Approved. Harwick can continue.</ConfirmationAccepted>
      <ConfirmationRejected>Paused. Give Harwick one more constraint.</ConfirmationRejected>
    </Confirmation>
  );
}

function AssistantThread(props: {
  assistantTurns: AssistantTurn[];
  toolUsage: Array<{ detail: string | null; id: string; status: string; summary: string; tool: string }>;
}) {
  const hasAssistantToolCalls = props.assistantTurns.some((turn) => turn.toolCalls.length > 0);

  return (
    <Conversation className="min-h-[40vh]">
      <ConversationContent className="gap-7 px-0 py-2">
        {props.assistantTurns.map((turn) => (
          <div className="contents" key={turn.id}>
            <Message from="user">
              <MessageContent className="harwick-bubble-user max-w-[80%] !bg-transparent !p-0">
                <div className="harwick-bubble-user">{turn.question}</div>
              </MessageContent>
            </Message>
            <Message className="max-w-[94%]" from="assistant">
              <MessageContent className="!w-full !max-w-none !bg-transparent !p-0">
                <div className="mb-2 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.16em] text-[var(--graphite-text-faint)]">
                  <Bot aria-hidden="true" className="size-3 text-[var(--sage)]" />
                  harwick
                </div>
                {turn.reasoningSteps.length === 0 ? null : <ReasoningTrace isStreaming={turn.isStreaming} steps={turn.reasoningSteps} />}
                {turn.answer.length === 0 && turn.isStreaming ? null : (
                  <div className="harwick-bubble-assistant mt-3">
                    {turn.answer}
                  </div>
                )}
                {turn.isStreaming && turn.answer.length > 0 ? (
                  <div className="mt-2 text-[10.5px] uppercase tracking-[0.16em] text-[var(--graphite-text-faint)]">streaming</div>
                ) : null}
                {turn.toolCalls.length === 0 ? null : (
                  <div className="mt-3 grid gap-2">
                    {turn.toolCalls.map((toolCall, index) => {
                      const detail = summarizeAssistantToolPayload(toolCall.payload);
                      return (
                        <div className="harwick-home-panel rounded-[14px] px-4 py-3" key={`${turn.id}:tool:${toolCall.tool}:${index}`}>
                          <div className="flex items-center justify-between gap-3 text-[10.5px] uppercase tracking-[0.16em] text-[var(--graphite-text-subtle)]">
                            <span>{toolCall.tool.replace(/_/g, " ")}</span>
                            <span>{toolCall.requiresApproval ? "approval required" : "ready"}</span>
                          </div>
                          <p className="mt-1.5 text-[13.5px] text-[var(--graphite-text)]">{toolCall.reason}</p>
                          {detail === null ? null : (
                            <p className="mt-1 text-[12.5px] leading-5 text-[var(--graphite-text-subtle)]">{detail}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </MessageContent>
              {turn.artifact === undefined ? null : <ArtifactPreview artifact={turn.artifact} />}
            </Message>
          </div>
        ))}

        {hasAssistantToolCalls || props.toolUsage.length === 0 ? null : (
          <div className="grid gap-2">
            {props.toolUsage.map((activity) => (
              <div className="harwick-home-panel rounded-[14px] px-4 py-3" key={activity.id}>
                <div className="flex items-center justify-between gap-3 text-[10.5px] uppercase tracking-[0.16em] text-[var(--graphite-text-subtle)]">
                  <span>{activity.tool.replace(/_/g, " ")}</span>
                  <span>{activity.status}</span>
                </div>
                <p className="mt-1.5 text-[13.5px] text-[var(--graphite-text)]">{activity.summary}</p>
                {activity.detail === null ? null : (
                  <p className="mt-1 text-[12.5px] leading-5 text-[var(--graphite-text-subtle)]">{activity.detail}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </ConversationContent>
      <ConversationScrollButton className="border-[var(--graphite-line)] bg-[var(--graphite-surface-3)] text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-4)] hover:text-[var(--graphite-text)]" />
    </Conversation>
  );
}

export function ContextRibbon(props: {
  activeKey: string | null;
  items: WorkItem[];
  limit?: number;
  onReplyAction: (action: "approve" | "send", reply: Reply) => void;
  onSelect: (entry: WorkItem) => void;
  onTaskAction: (action: "callback" | "reviewed" | "dismiss", task: Task) => void;
  showViewAllLink?: boolean;
}) {
  const visibleItems = props.items.slice(0, props.limit ?? 4);
  const expandedId = props.activeKey;

  return (
    <section className="w-full">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-[var(--graphite-text)]">Work Queue</h2>
          <Badge className="harwick-home-chip px-2 py-0.5 text-xs" variant="outline">
            {props.items.length}
          </Badge>
        </div>
        {props.showViewAllLink === false ? null : (
          <a className="harwick-home-link inline-flex items-center gap-1 text-xs" href="/conversations">
            View all
            <ChevronRight aria-hidden="true" className="size-3.5 -rotate-45" />
          </a>
        )}
      </div>
      {visibleItems.length > 0 ? (
        <div className="space-y-2">
          {visibleItems.map((entry) => {
            const key = getWorkItemKey(entry);
            const isExpanded = expandedId === key;
            const task = entry.kind === "task" ? entry.item : null;
            const reasoning = getWorkItemReason(entry);
            const draft = entry.kind === "reply" ? entry.item.draft : task?.loopDetail?.draftBody;
            const Icon = getQueueIcon(entry);
            const priority = getPriorityLabel(entry);
            const summary = getWorkItemSummary(entry);
            const recommendation = getWorkItemRecommendation(entry);
            const chips = getWorkItemChips(entry);
            const leadHref = getLeadHref(entry);
            return (
              <Collapsible
                key={key}
                onOpenChange={(open) => {
                  if (open) props.onSelect(entry);
                }}
                open={isExpanded}
              >
                <div className="harwick-home-panel overflow-hidden rounded-[22px] shadow-none">
                  <CollapsibleTrigger asChild>
                    <button className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-[var(--graphite-surface-3)]" type="button">
                      <div className="flex size-8 items-center justify-center rounded-[10px] bg-[var(--graphite-surface-3)]">
                        <Icon className="size-4 text-[var(--graphite-text-muted)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[var(--graphite-text)]">
                            {getWorkItemLeadName(entry)}
                          </span>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", priorityClass(priority))}>
                            {priority}
                          </span>
                        </div>
                        <p className="truncate text-xs text-[var(--graphite-text-subtle)]">
                          {getWorkItemChannel(entry)} / {summary}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-[var(--graphite-text-subtle)]">
                          <Clock className="size-3" />
                          {formatQueueTime(entry.kind === "reply" ? entry.item.time : entry.item.time)}
                        </span>
                        <ChevronRight className={cn("size-4 text-[var(--graphite-text-subtle)] transition-transform", isExpanded && "rotate-90")} />
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="space-y-3 border-t border-[var(--graphite-line)] p-4">
                      {reasoning.length > 0 ? (
                        <div className="harwick-home-panel rounded-[16px] p-3">
                          <div className="mb-1.5 flex items-center gap-1.5">
                            <Bot className="size-3.5 text-[var(--sage)]" />
                            <span className="text-xs font-medium text-[var(--graphite-text-muted)]">Why Harwick surfaced this</span>
                          </div>
                          <p className="text-sm text-[var(--graphite-text)]">{reasoning}</p>
                        </div>
                      ) : null}

                      <div className="harwick-home-panel rounded-[16px] space-y-2 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-medium text-[var(--graphite-text-muted)]">AI assessment</p>
                          <span className="text-[11px] text-[var(--graphite-text-subtle)]">{recommendation}</span>
                        </div>
                        <p className="text-sm text-[var(--graphite-text)]">{summary}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {chips.map((chip) => (
                            <span className="harwick-home-chip px-2 py-0.5 text-[11px]" key={chip}>
                              {chip}
                            </span>
                          ))}
                        </div>
                      </div>

                      {draft === undefined || draft.length === 0 ? null : (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-[var(--graphite-text-muted)]">Suggested response</p>
                          <div className="harwick-home-panel rounded-[16px] p-3">
                            <p className="whitespace-pre-wrap text-sm text-[var(--graphite-text)]">{draft}</p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          className="h-8 gap-1.5 bg-[var(--sage)] text-[var(--graphite-2)] hover:brightness-105"
                          onClick={() => {
                            if (entry.kind === "reply") props.onReplyAction("send", entry.item);
                            else if (task !== null) props.onTaskAction(task.type === "callback" ? "callback" : "reviewed", task);
                          }}
                          size="sm"
                        >
                          <Check className="size-3.5" />
                          {entry.kind === "reply" ? "Approve & Send" : getEntryNextAction(entry)}
                        </Button>
                        <Button asChild className="h-8 border-[var(--graphite-line)] bg-[var(--graphite-surface-1)] text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)] shadow-none" size="sm" variant="outline">
                          <a href={getWorkItemReviewHref(entry)}>Review full</a>
                        </Button>
                        {leadHref === null ? null : (
                          <Button asChild className="h-8 text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]" size="sm" variant="ghost">
                            <a href={leadHref}>Open lead</a>
                          </Button>
                        )}
                        <Button
                          className="h-8 text-[var(--graphite-text-subtle)] hover:bg-[var(--graphite-surface-3)] hover:text-oxblood-soft"
                          onClick={() => {
                            if (task !== null) props.onTaskAction("dismiss", task);
                          }}
                          size="sm"
                          variant="ghost"
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <div className="harwick-home-panel rounded-[22px] px-4 py-6 text-sm text-[var(--graphite-text-muted)] shadow-none">
          Harwick has no open work items from the live queue.
        </div>
      )}
    </section>
  );
}

export function DetailPanel(props: {
  activeEntry: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onReplyAction: (action: "approve" | "send", reply: Reply) => void;
  onTaskAction: (action: "callback" | "reviewed" | "dismiss", task: Task) => void;
}) {
  const [draftValue, setDraftValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setDraftValue(props.activeEntry?.kind === "reply" ? props.activeEntry.item.draft : "");
    setIsEditing(false);
  }, [props.activeEntry]);

  if (!props.isOpen || props.activeEntry === null) return null;

  const entry = props.activeEntry;
  const title = getWorkItemLeadName(entry);
  const channel = getWorkItemChannel(entry);
  const tone = getWorkItemTone(entry);
  const thread = getWorkItemThread(entry);
  const task = entry.kind === "task" ? entry.item : null;
  const assessment = getWorkItemReason(entry);
  const sourceText = getWorkItemSummaryText(entry);
  const score = getWorkItemScore(entry);
  const recommendations = getWorkItemRecommendations(entry);
  const requirements = getWorkItemRequirements(entry);
  const contactRows = getWorkItemContactRows(entry);
  const reviewHref = getWorkItemReviewHref(entry);
  const leadHref = getLeadHref(entry);

  return (
    <aside className="harwick-detail-panel harwick-home-sidepanel fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto text-[var(--graphite-text)]">
      <div className="harwick-home-sidepanel-header sticky top-0 z-10 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={cn("flex size-10 items-center justify-center rounded-full text-sm font-medium", tone === "red" ? "bg-oxblood-soft text-oxblood" : tone === "amber" ? "bg-clay-soft text-clay" : "bg-sage-soft text-sage")}>
              {title.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <h2 className="font-medium text-[var(--graphite-text)]">{title}</h2>
              <p className="text-xs text-[var(--graphite-text-subtle)]">{thread?.sourceContext ?? `Lead via ${channel}`}</p>
            </div>
          </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="size-8 text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]" size="icon" variant="ghost">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {leadHref === null ? null : (
                <DropdownMenuItem asChild>
                  <a href={leadHref}>Open related lead</a>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem>Assign to agent</DropdownMenuItem>
              <DropdownMenuItem>Mark as not relevant</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button className="size-8 text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]" onClick={props.onClose} size="icon" variant="ghost">
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-6 p-4">
        <div className="harwick-home-panel rounded-[18px] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-[var(--sage)]" />
              <span className="text-sm font-medium text-[var(--graphite-text)]">AI Assessment</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-2xl font-semibold text-[var(--graphite-text)]">{score}</span>
              <span className="text-xs text-[var(--graphite-text-subtle)]">/100</span>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-[var(--graphite-text-muted)]">{assessment}</p>
          <div className="mt-4 space-y-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--graphite-text-faint)]">Recommendations</span>
            {recommendations.map((rec) => (
              <div className="flex items-center gap-2" key={rec}>
                <CheckCircle2 className="size-3 shrink-0 text-sage" />
                <span className="text-sm text-[var(--graphite-text)]">{rec}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--graphite-text-faint)]">Contact</h3>
          <div className="space-y-2">
            {contactRows.map((row) => {
              const Icon = row.icon;
              return (
                <div className="flex items-start gap-3 text-sm" key={row.label}>
                  <Icon className="mt-0.5 size-4 text-[var(--graphite-text-subtle)]" />
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--graphite-text-faint)]">{row.label}</p>
                    <p className="text-[var(--graphite-text)]">{row.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--graphite-text-faint)]">
            {thread !== null ? "Qualification snapshot" : "Requirements"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {requirements.map((item) => {
              const Icon = item.icon;
              return (
                <div className="harwick-home-panel rounded-[14px] px-3 py-2" key={item.label}>
                  <div className="mb-1 flex items-center gap-2 text-xs text-[var(--graphite-text-subtle)]">
                    <Icon className="size-3" />
                    {item.label}
                  </div>
                  <span className="block truncate text-sm font-medium text-[var(--graphite-text)]">{item.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--graphite-text-faint)]">{getWorkItemSummaryLabel(entry)}</h3>
          <div className="harwick-home-panel rounded-[14px] p-3">
            <p className="text-sm leading-relaxed text-[var(--graphite-text)]">{sourceText}</p>
          </div>
          <Button asChild className="mt-2 h-8 px-2 text-xs text-[var(--graphite-text-subtle)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]" size="sm" variant="ghost">
            <a href={reviewHref}>
              <MessageSquare className="mr-1 size-3" />
              View full conversation
            </a>
          </Button>
        </div>

        <Separator />

        {entry.kind === "reply" ? (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--graphite-text-faint)]">Suggested Response</h3>
              <Button
                className="h-7 text-xs text-[var(--graphite-text-muted)] hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]"
                onClick={() => setIsEditing(!isEditing)}
                size="sm"
                variant="ghost"
              >
                <Edit3 className="mr-1 size-3" />
                {isEditing ? "Done" : "Edit"}
              </Button>
            </div>
            {isEditing ? (
              <textarea
                className="min-h-[120px] w-full rounded-[14px] border border-[var(--graphite-line)] bg-[var(--graphite-surface-3)] p-3 text-sm leading-relaxed text-[var(--graphite-text)] outline-none transition focus:border-[var(--graphite-line-strong)] focus:bg-[var(--graphite-surface-4)] focus:ring-4 focus:ring-[var(--graphite-surface-3)]"
                onChange={(e) => setDraftValue(e.target.value)}
                value={draftValue}
              />
            ) : (
              <div className="harwick-home-panel rounded-[14px] p-3">
                <p className="text-sm leading-relaxed text-[var(--graphite-text)]">{draftValue}</p>
              </div>
            )}
            <div className="mt-3 flex items-center gap-2">
              <Button
                className="flex-1 bg-harwick-ink text-harwick-paper hover:bg-harwick-ink-soft"
                onClick={() => props.onReplyAction("send", { ...entry.item, draft: draftValue })}
                size="sm"
              >
                <Send className="mr-1 size-3" />
                Approve & Send
              </Button>
              <Button
                className="size-9 border-[var(--graphite-line)] bg-[var(--graphite-surface-1)] p-0 text-[var(--graphite-text-muted)] shadow-none hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]"
                onClick={() => props.onReplyAction("approve", { ...entry.item, draft: draftValue })}
                size="sm"
                variant="outline"
              >
                <ThumbsUp className="size-4" />
              </Button>
              <Button
                className="size-9 border-[var(--graphite-line)] bg-[var(--graphite-surface-1)] p-0 text-[var(--graphite-text-muted)] shadow-none hover:bg-[var(--graphite-surface-3)] hover:text-[var(--graphite-text)]"
                onClick={() => props.onClose()}
                size="sm"
                variant="outline"
              >
                <ThumbsDown className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {task === null ? null : (
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-[var(--graphite-text-faint)]">Task Action</h3>
            <Button
              className="w-full bg-harwick-ink text-harwick-paper hover:bg-harwick-ink-soft"
              onClick={() => props.onTaskAction(task.type === "callback" ? "callback" : "reviewed", task)}
              size="sm"
            >
              <AlertCircle className="mr-2 size-4" />
              {task.action}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

export function HomePage(props: HomePageProps) {
  const [dashboardHealth, setDashboardHealth] = useState<DashboardHealthRow[]>([]);
  const [dashboardWorkItems, setDashboardWorkItems] = useState<WorkItem[]>([]);
  const [ownerQueueItems, setOwnerQueueItems] = useState<OwnerHomeQueueItem[]>([]);
  const [recentLeads, setRecentLeads] = useState<RecentLeadItem[]>([]);
  const [routingDeskItems, setRoutingDeskItems] = useState<RoutingDeskItem[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamPresenceMember[]>([]);
  const [activeWorkItemKey, setActiveWorkItemKey] = useState<string | null>(null);
  const [assistantTurns, setAssistantTurns] = useState<AssistantTurn[]>([]);
  const [assistantMentions, setAssistantMentions] = useState<AssistantMentionOption[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState<PendingInlineQuestion | null>(null);
  const [pendingQuestionSelections, setPendingQuestionSelections] = useState<string[]>([]);
  const [planDecision, setPlanDecision] = useState<"approved" | "rejected" | null>(null);
  const [voiceActionPending, setVoiceActionPending] = useState<"daily" | "showing" | null>(null);
  const [voiceActionError, setVoiceActionError] = useState<string | null>(null);

  const activeWorkItem = useMemo(() => {
    if (dashboardWorkItems.length === 0) return null;
    const active = activeWorkItemKey === null
      ? null
      : dashboardWorkItems.find((entry) => getWorkItemKey(entry) === activeWorkItemKey) ?? null;
    return active ?? dashboardWorkItems[0] ?? null;
  }, [activeWorkItemKey, dashboardWorkItems]);

  const firstName = useMemo(
    () => props.operatorName.trim().split(/\s+/)[0] ?? props.operatorName,
    [props.operatorName],
  );
  const isOwnerHome = props.operatorRole === "owner" || props.operatorRole === "admin";
  const assistantMentionOptions = useMemo(() => buildMentionOptions({
    recentLeads,
    teamMembers,
  }), [recentLeads, teamMembers]);
  const voiceShowingLeadId = useMemo(() => {
    if (activeWorkItem !== null) {
      const leadId = getWorkItemLeadId(activeWorkItem);
      if (leadId !== null) {
        return leadId;
      }
    }
    return recentLeads[0]?.id ?? null;
  }, [activeWorkItem, recentLeads]);
  const starterCards = useMemo(() => buildChatStarterCards({
    dashboardHealth,
    dashboardWorkItems,
    operatorRole: props.operatorRole,
    ownerQueueItems,
    recentLeads,
    routingDeskItems,
  }), [dashboardHealth, dashboardWorkItems, ownerQueueItems, props.operatorRole, recentLeads, routingDeskItems]);
  const toolActions = useMemo(() => buildChatToolActions(props.operatorRole), [props.operatorRole]);
  const liveQueueCount = isOwnerHome ? ownerQueueItems.length : dashboardWorkItems.length;
  const liveRoutingCount = isOwnerHome
    ? ownerQueueItems.filter((item) => item.kind === "routing").length
    : routingDeskItems.filter((item) => item.decision.status !== "assigned").length;
  const activeToolUsage = useMemo(() => getToolUsageItems(activeWorkItem), [activeWorkItem]);

  const hasActiveThread = assistantTurns.length > 0 || pendingQuestion !== null;

  async function refreshHomeData() {
    const [response, ownerQueueResponse] = await Promise.all([
      fetch(`/api/home?workspaceId=${props.workspaceId}`, { cache: "no-store" }),
      isOwnerHome ? fetch(`/api/home/owner-queue?workspaceId=${props.workspaceId}`, { cache: "no-store" }) : Promise.resolve(null),
    ]);
    if (!response.ok) return;
    const payload = readObject(await response.json());
    if (payload === null) return;

    const conversationsParsed = ConversationsInboxResponseSchema.safeParse(payload["conversations"]);
    const nextThreads = conversationsParsed.success ? conversationsParsed.data.threads : [];
    const threadMap = new Map(nextThreads.map((thread) => [thread.leadId, thread]));

    setDashboardHealth(mapHomePayloadToHealth(payload));
    setDashboardWorkItems(mapHomePayloadToWorkItems(payload, threadMap));

    const recentLeadsParsed = RecentLeadsResponseSchema.safeParse(payload["recentLeads"]);
    setRecentLeads(recentLeadsParsed.success ? recentLeadsParsed.data.items : []);

    const routingDeskParsed = RoutingDeskResponseSchema.safeParse(payload["routingDesk"]);
    setRoutingDeskItems(routingDeskParsed.success ? routingDeskParsed.data.items : []);

    const teamPresenceParsed = TeamPresenceResponseSchema.safeParse(payload["teamPresence"]);
    setTeamMembers(teamPresenceParsed.success ? teamPresenceParsed.data.members : []);

    if (!isOwnerHome) {
      setOwnerQueueItems([]);
      return;
    }

    const ownerQueuePayload = ownerQueueResponse !== null && ownerQueueResponse.ok
      ? readObject(await ownerQueueResponse.json())
      : null;

    const ownerQueueParsed = OwnerHomeQueueResponseSchema.safeParse(ownerQueuePayload);
    setOwnerQueueItems(ownerQueueParsed.success ? ownerQueueParsed.data.items : []);
  }

  function handleAssistantMentionToggle(mention: AssistantMentionOption) {
    setAssistantMentions((current) => {
      const key = `${mention.type}:${mention.id}`;
      const exists = current.some((entry) => `${entry.type}:${entry.id}` === key);
      return exists
        ? current.filter((entry) => `${entry.type}:${entry.id}` !== key)
        : [...current, mention];
    });
  }

  function updateAssistantTurn(turnId: string, updater: (turn: AssistantTurn) => AssistantTurn) {
    setAssistantTurns((current) => current.map((turn) => (turn.id === turnId ? updater(turn) : turn)));
  }

  function appendVoiceBriefTurn(params: {
    question: string;
    answer: string;
    scope?: string;
  }) {
    setAssistantTurns((current) => [
      ...current,
      {
        id: `${Date.now()}:${current.length}`,
        question: params.question,
        answer: params.answer,
        isStreaming: false,
        reasoningSteps: [{
          label: "Voice brief ready",
          detail: "Prepared spoken summary for mobile and driving workflows.",
          icon: Phone,
          status: "complete",
        }],
        scope: params.scope ?? props.workspaceName,
        toolCalls: [],
      },
    ]);
    speakBrowserVoice(params.answer);
  }

  async function streamAssistantTurn(turnId: string, response: Response) {
    const reader = response.body?.getReader();
    if (reader === undefined) {
      throw new Error("Missing stream body.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame.split("\n").find((entry) => entry.startsWith("data: "));
        if (line === undefined) continue;
        const payload = JSON.parse(line.slice(6)) as unknown;
        if (!isHarwickAssistantStreamEvent(payload)) continue;

        if (payload.type === "response-metadata") {
          updateAssistantTurn(turnId, (turn) => ({
            ...turn,
            reasoningSteps: buildReasoningStepsFromMetadata(payload.data.reasoningSteps),
            scope: payload.data.scope,
            toolCalls: payload.data.toolCalls,
          }));
          continue;
        }

        if (payload.type === "answer-chunk") {
          updateAssistantTurn(turnId, (turn) => ({
            ...turn,
            answer: `${turn.answer}${turn.answer.length === 0 ? "" : " "}${payload.data}`,
          }));
          continue;
        }

        if (payload.type === "artifact-start") {
          updateAssistantTurn(turnId, (turn) => ({
            ...turn,
            artifact: {
              body: "",
              title: payload.data.title,
              type: payload.data.type,
              version: payload.data.version,
              versions: payload.data.versions,
            },
          }));
          continue;
        }

        if (payload.type === "artifact-chunk") {
          updateAssistantTurn(turnId, (turn) => (
            turn.artifact === undefined
              ? turn
              : {
                  ...turn,
                  artifact: { ...turn.artifact, body: `${turn.artifact.body}${payload.data}` },
                }
          ));
          continue;
        }

        if (payload.type === "follow-up-question") {
          setPendingQuestion(payload.data === null ? null : {
            helper: payload.data.helper,
            id: `${Date.now()}:question`,
            minSelections: 1,
            options: payload.data.options,
            question: payload.data.question,
            selectionMode: "single",
            submitLabel: "continue",
          });
          setPendingQuestionSelections([]);
          continue;
        }

        if (payload.type === "done") {
          updateAssistantTurn(turnId, (turn) => ({
            ...turn,
            isStreaming: false,
          }));
        }
      }
    }
  }

  async function appendAssistantTurn(question: string, inlineAnswer?: string, mentionsOverride?: AssistantMentionOption[]) {
    const finalQuestion = inlineAnswer === undefined ? question : `${question}\n\nInline answer: ${inlineAnswer}`;
    const mentions = mentionsOverride ?? assistantMentions;
    const turnId = `${Date.now()}:${assistantTurns.length}`;
    const loadingState = pickHarwickLoadingState(finalQuestion);

    setAssistantTurns((current) => [
      ...current,
        {
          answer: "",
          id: turnId,
          isStreaming: true,
          question: finalQuestion,
        reasoningSteps: [{
          detail: loadingState.detail,
          icon: Search,
          label: loadingState.label,
          status: "active",
          }],
          scope: activeWorkItem === null ? props.workspaceName : getWorkItemLeadName(activeWorkItem),
          toolCalls: [],
        },
      ]);

    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/harwick-assistant`, {
        body: JSON.stringify({
          activeLeadId: activeWorkItem === null ? null : getWorkItemLeadId(activeWorkItem),
          mentions: mentions.map((mention) => ({
            id: mention.id,
            label: mention.label,
            type: mention.type,
          })),
          message: finalQuestion,
          stream: true,
        }),
        headers: {
          accept: "text/event-stream",
          "content-type": "application/json",
        },
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(await readAssistantErrorMessage(response));
      }
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("text/event-stream")) {
        await streamAssistantTurn(turnId, response);
        return;
      }

      const payload: unknown = await response.json();
      if (!isHarwickAssistantResponse(payload)) {
        throw new Error("Harwick assistant returned an invalid response.");
      }
      updateAssistantTurn(turnId, (turn) => ({
        ...turn,
        answer: payload.answer,
        isStreaming: false,
        reasoningSteps: buildReasoningStepsFromResponse(payload),
        scope: payload.scope,
        toolCalls: payload.toolCalls,
        ...(payload.artifact === undefined ? {} : { artifact: payload.artifact }),
      }));
      setPendingQuestion(buildPendingQuestionFromResponse(payload));
      setPendingQuestionSelections([]);
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : "Harwick could not complete this request with the live runtime.";
      updateAssistantTurn(turnId, (turn) => ({
        ...turn,
        answer: message,
        isStreaming: false,
        reasoningSteps: [{
          detail: "Harwick missed that pass and needs another shot.",
          icon: AlertCircle,
          label: "Couldn't catch that",
          status: "complete",
        }],
        scope: activeWorkItem === null ? props.workspaceName : getWorkItemLeadName(activeWorkItem),
        toolCalls: [],
      }));
      setPendingQuestion(null);
      setPendingQuestionSelections([]);
    }
  }

  async function handleAssistantPrompt(question: string) {
    if (pendingQuestion !== null) {
      const answer = question.length > 0 ? question : pendingQuestionSelections.join(", ");
      if (answer.length === 0) return;
      await appendAssistantTurn(pendingQuestion.question, answer);
      setPendingQuestion(null);
      setPendingQuestionSelections([]);
      setPlanDecision(null);
      return;
    }

    await appendAssistantTurn(question);
    setPlanDecision(null);
  }

  async function handleDailyVoiceBriefRequest() {
    setVoiceActionPending("daily");
    setVoiceActionError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/voice/daily-brief`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(await readAssistantErrorMessage(response));
      }
      const payload: unknown = await response.json();
      const parsed = VoiceDailyBriefResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Daily brief response was invalid.");
      }
      appendVoiceBriefTurn({
        question: "Read my daily driving brief.",
        answer: parsed.data.spokenText,
      });
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : "Harwick could not load the daily driving brief.";
      setVoiceActionError(message);
    } finally {
      setVoiceActionPending(null);
    }
  }

  async function handleShowingVoiceBriefRequest() {
    if (voiceShowingLeadId === null) {
      setVoiceActionError("Pick a lead first, then request the showing brief.");
      return;
    }
    setVoiceActionPending("showing");
    setVoiceActionError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${props.workspaceId}/voice/showing-brief?leadId=${encodeURIComponent(voiceShowingLeadId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        throw new Error(await readAssistantErrorMessage(response));
      }
      const payload: unknown = await response.json();
      const parsed = VoiceShowingBriefResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Showing brief response was invalid.");
      }
      appendVoiceBriefTurn({
        question: "Brief me before my next showing.",
        answer: parsed.data.spokenText,
        scope: parsed.data.snapshot.leadName,
      });
    } catch (error) {
      const message = error instanceof Error && error.message.trim().length > 0
        ? error.message.trim()
        : "Harwick could not load the showing brief.";
      setVoiceActionError(message);
    } finally {
      setVoiceActionPending(null);
    }
  }

  function handleQuestionOptionSelect(value: string) {
    if (pendingQuestion === null) return;
    if (pendingQuestion.selectionMode === "single") {
      void appendAssistantTurn(pendingQuestion.question, value).then(() => {
        setPendingQuestion(null);
        setPendingQuestionSelections([]);
      });
      return;
    }
    setPendingQuestionSelections((current) => (
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    ));
  }

  function handlePendingQuestionSubmitSelections() {
    if (pendingQuestion === null) return;
    if (pendingQuestionSelections.length < pendingQuestion.minSelections) return;
    void appendAssistantTurn(pendingQuestion.question, pendingQuestionSelections.join(", ")).then(() => {
      setPendingQuestion(null);
      setPendingQuestionSelections([]);
    });
  }

  useEffect(() => {
    void refreshHomeData();
  }, []);

  useEffect(() => {
    if (dashboardWorkItems.length === 0) {
      setActiveWorkItemKey(null);
      return;
    }
    if (activeWorkItemKey === null || !dashboardWorkItems.some((entry) => getWorkItemKey(entry) === activeWorkItemKey)) {
      setActiveWorkItemKey(getWorkItemKey(dashboardWorkItems[0]!));
    }
  }, [activeWorkItemKey, dashboardWorkItems]);

  const placeholder = isOwnerHome
    ? "Ask about the brokerage, a lead, a teammate, or a decision Harwick is holding..."
    : "Ask Harwick for analysis, a reply, or the next move...";

  const showHero = !hasActiveThread;

  return (
    <AppShell
      activeItem="Assistant"
      memberName={props.operatorName}
      memberRole={props.operatorRole}
      tone="dashboardDark"
      title="Assistant"
      workspaceName={props.workspaceName}
    >
      <main className="harwick-home-dashboard relative flex min-h-full w-full flex-col">
        {/* Quiet header — always present, never morphs */}
        <header className="flex w-full items-center justify-between gap-4 px-6 pt-6 md:px-10 md:pt-8">
          <div className="flex items-center gap-3">
            <p className="harwick-home-eyebrow">{props.workspaceName}</p>
            <span className="size-1 rounded-full bg-[var(--graphite-text-faint)]" aria-hidden="true" />
            <p className="harwick-home-eyebrow">assistant</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="harwick-home-status-chip">
              {new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <span className="harwick-home-status-chip">
              <span className="size-1.5 rounded-full bg-[var(--sage)]" aria-hidden="true" />
              {liveQueueCount} queued
            </span>
            <span className="harwick-home-status-chip">
              <span className="size-1.5 rounded-full bg-[var(--graphite-text-subtle)]" aria-hidden="true" />
              {liveRoutingCount} routing
            </span>
            {hasActiveThread ? (
              <button
                className="harwick-home-status-chip cursor-pointer transition hover:text-white"
                onClick={() => {
                  setAssistantTurns([]);
                  setPendingQuestion(null);
                  setPendingQuestionSelections([]);
                  setPlanDecision(null);
                }}
                type="button"
              >
                <ArrowLeft aria-hidden="true" className="size-3.5" />
                new thread
              </button>
            ) : null}
          </div>
        </header>

        {/* Single canvas: hero when empty, message stream when active. Composer
         * is always docked at the same position. No layout morph. */}
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 pb-6 md:px-0">
          <div className="flex flex-1 flex-col justify-end gap-6 overflow-y-auto pb-4 pt-6">
            {showHero ? (
              <AssistantHero
                firstName={firstName}
                isOwnerHome={isOwnerHome}
                liveQueueCount={liveQueueCount}
                liveRoutingCount={liveRoutingCount}
                onSubmit={handleAssistantPrompt}
                starterCards={starterCards}
                toolActions={toolActions}
              />
            ) : (
              <>
                <PlanGate
                  decision={planDecision}
                  onApprove={() => setPlanDecision("approved")}
                  onReject={() => setPlanDecision("rejected")}
                  show={assistantTurns.some((turn) => turn.artifact !== undefined)}
                />
                <AssistantThread assistantTurns={assistantTurns} toolUsage={activeToolUsage} />
              </>
            )}
          </div>

          <div className="sticky bottom-0 pt-3">
            <AssistantComposer
              toolActions={toolActions}
              mentions={assistantMentionOptions}
              onOptionSelect={handleQuestionOptionSelect}
              onMentionToggle={handleAssistantMentionToggle}
              onRequestDailyBrief={() => {
                void handleDailyVoiceBriefRequest();
              }}
              onRequestShowingBrief={() => {
                void handleShowingVoiceBriefRequest();
              }}
              onSubmit={handleAssistantPrompt}
              onSubmitSelections={handlePendingQuestionSubmitSelections}
              pendingQuestion={pendingQuestion}
              pendingSelections={pendingQuestionSelections}
              placeholder={placeholder}
              selectedMentions={assistantMentions}
              voiceActionPending={voiceActionPending}
              voiceShowingDisabled={voiceShowingLeadId === null}
            />
            {voiceActionError === null ? null : (
              <p className="mt-2 text-center text-[11px] text-oxblood-soft">
                {voiceActionError}
              </p>
            )}
            <p className="mt-2 text-center text-[11px] text-[var(--graphite-text-faint)]">
              Use @lead, @person, or @harwick for context. External sends are approval-gated.
            </p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
