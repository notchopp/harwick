import {
  ConversationsInboxResponseSchema,
  OwnerHomeQueueResponseSchema,
  RoutingDeskResponseSchema,
  type ConversationInboxThread,
  type ConversationsInboxResponse,
  type FollowUpBossConflictQueueResponse,
  type HarwickHomeWorkItem,
  type OperationsFailureQueueResponse,
  type OperationsQueueSummary,
  type OwnerHomeQueueItem,
  type OwnerHomeQueuePriority,
  type RoutingDeskItem,
  type RoutingDeskResponse,
  type WorkspaceReadinessSummary,
} from "@realty-ops/core";
import type { ConversationsInboxRepository } from "../conversations/conversations-data";
import { loadConversationsInbox } from "../conversations/conversations-data";
import type { RoutingDeskRepository } from "./routing-desk";
import { loadRoutingDesk } from "./routing-desk";

function conversationHref(thread: ConversationInboxThread): string {
  const params = new URLSearchParams({ leadId: thread.leadId });
  if (thread.reviewId !== null) {
    params.set("reviewId", thread.reviewId);
  }
  return `/conversations?${params.toString()}`;
}

function leadHref(leadId: string): string {
  return `/leads?leadId=${leadId}`;
}

function priorityWeight(priority: OwnerHomeQueuePriority): number {
  if (priority === "urgent") return 0;
  if (priority === "high") return 1;
  return 2;
}

function ownerQueueKindWeight(kind: OwnerHomeQueueItem["kind"]): number {
  if (kind === "operations") return 0;
  if (kind === "harwick") return 1;
  if (kind === "routing") return 2;
  if (kind === "inbox") return 3;
  return 4;
}

function scorePriority(score: number): OwnerHomeQueuePriority {
  if (score >= 85) return "urgent";
  if (score >= 65) return "high";
  return "normal";
}

function normalizeOwnerPriority(priority: HarwickHomeWorkItem["priority"]): OwnerHomeQueuePriority {
  if (priority === "urgent") return "urgent";
  if (priority === "high") return "high";
  return "normal";
}

function ownerInboxPriority(thread: ConversationInboxThread): OwnerHomeQueuePriority {
  if (thread.automationMode === "human_takeover" || thread.stageTone === "review") {
    return "urgent";
  }
  if (thread.automationMode === "paused_by_rule" || thread.assignedTo.toLowerCase() === "owner review") {
    return "high";
  }
  return scorePriority(thread.score);
}

function isOwnerInboxThread(thread: ConversationInboxThread): boolean {
  return thread.assignedTo.toLowerCase() === "owner review"
    || thread.stageTone === "review"
    || thread.automationMode === "human_takeover"
    || thread.automationMode === "paused_by_rule";
}

function sortOwnerInboxThreads(threads: ConversationInboxThread[]): ConversationInboxThread[] {
  return [...threads].sort((left, right) => {
    const priorityDelta = priorityWeight(ownerInboxPriority(left)) - priorityWeight(ownerInboxPriority(right));
    if (priorityDelta !== 0) return priorityDelta;
    return right.score - left.score;
  });
}

function sortOwnerRoutingItems(items: RoutingDeskItem[]): RoutingDeskItem[] {
  return [...items].sort((left, right) => {
    const leftWeight = left.decision.status === "unrouted" ? 0 : left.decision.status === "hold_for_qualification" ? 1 : 2;
    const rightWeight = right.decision.status === "unrouted" ? 0 : right.decision.status === "hold_for_qualification" ? 1 : 2;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return left.decision.matchScore - right.decision.matchScore;
  });
}

function routingQueueItems(items: RoutingDeskItem[]): OwnerHomeQueueItem[] {
  return sortOwnerRoutingItems(items)
    .filter((item) => item.decision.status !== "assigned")
    .map((item) => ({
      id: `routing:${item.leadId}`,
      workspaceId: item.workspaceId,
      leadId: item.leadId,
      kind: "routing",
      priority: item.decision.status === "unrouted" ? "urgent" : "high",
      title: `${item.leadName} needs routing`,
      summary: item.summary,
      reason: item.decision.reasons[0] ?? item.decision.taskLabel,
      actionLabel: "review routing",
      href: leadHref(item.leadId),
      createdAt: new Date().toISOString(),
      dueAt: null,
    }));
}

function inboxQueueItems(threads: ConversationInboxThread[]): OwnerHomeQueueItem[] {
  return sortOwnerInboxThreads(threads).map((thread) => ({
    id: `inbox:${thread.leadId}`,
    workspaceId: thread.workspaceId,
    leadId: thread.leadId,
    kind: "inbox",
    priority: ownerInboxPriority(thread),
    title: `${thread.name} needs owner review`,
    summary: thread.preview,
    reason: thread.automationReason ?? `${thread.assignedTo} · ${thread.stageLabel}`,
    actionLabel: "open inbox",
    href: conversationHref(thread),
    createdAt: new Date().toISOString(),
    dueAt: null,
  }));
}

function harwickQueueItems(items: HarwickHomeWorkItem[]): OwnerHomeQueueItem[] {
  return items.map((item) => ({
    id: `harwick:${item.id}`,
    workspaceId: item.workspaceId,
    leadId: item.leadId,
    kind: "harwick",
    priority: normalizeOwnerPriority(item.priority),
    title: item.title,
    summary: item.summary,
    reason: item.reason,
    actionLabel: item.recommendedAction.toLowerCase(),
    href: item.leadId === null ? "/activity" : leadHref(item.leadId),
    createdAt: item.createdAt,
    dueAt: item.dueAt,
  }));
}

function operationsSummaryQueueItems(params: {
  workspaceId: string;
  operations: OperationsQueueSummary | null;
  readiness: WorkspaceReadinessSummary | null;
}): OwnerHomeQueueItem[] {
  const items: OwnerHomeQueueItem[] = [];
  if (params.readiness !== null && params.readiness.status !== "ready") {
    const blocked = params.readiness.items
      .filter((item) => item.status !== "ready")
      .map((item) => item.label)
      .slice(0, 3);
    items.push({
      id: "readiness:workspace",
      workspaceId: params.workspaceId,
      leadId: null,
      kind: "operations",
      priority: params.readiness.status === "degraded" ? "urgent" : "high",
      title: "Workspace readiness needs attention",
      summary: blocked.length === 0 ? "Harwick found setup issues." : blocked.join(", "),
      reason: "Owner visibility should lead setup and degraded-system fixes.",
      actionLabel: "open settings",
      href: "/settings",
      createdAt: new Date().toISOString(),
      dueAt: null,
    });
  }

  if (params.operations !== null) {
    const flags: string[] = [];
    if (params.operations.failedJobs > 0) flags.push(`${params.operations.failedJobs} failed job${params.operations.failedJobs === 1 ? "" : "s"}`);
    if (params.operations.stuckJobs > 0) flags.push(`${params.operations.stuckJobs} stuck job${params.operations.stuckJobs === 1 ? "" : "s"}`);
    if (params.operations.failedCrmSyncs > 0) flags.push(`${params.operations.failedCrmSyncs} failed CRM sync${params.operations.failedCrmSyncs === 1 ? "" : "s"}`);
    if (params.operations.providerErrors24h > 0) flags.push(`${params.operations.providerErrors24h} provider error${params.operations.providerErrors24h === 1 ? "" : "s"}`);
    if (flags.length > 0 || params.operations.urgentTasks > 0) {
      items.push({
        id: "operations:summary",
        workspaceId: params.workspaceId,
        leadId: null,
        kind: "operations",
        priority: params.operations.failedJobs > 0 || params.operations.stuckJobs > 0 || params.operations.providerErrors24h > 0
          ? "urgent"
          : "high",
        title: "Brokerage operations need review",
        summary: flags.length === 0 ? `${params.operations.urgentTasks} urgent task${params.operations.urgentTasks === 1 ? "" : "s"} waiting.` : flags.join(", "),
        reason: "Owner view should surface worker, CRM, and provider risk before it compounds.",
        actionLabel: "review operations",
        href: "/activity",
        createdAt: new Date().toISOString(),
        dueAt: null,
      });
    }
  }

  return items;
}

function conflictQueueItems(items: FollowUpBossConflictQueueResponse | null): OwnerHomeQueueItem[] {
  return (items?.items ?? []).map((item): OwnerHomeQueueItem => ({
    id: `crm:${item.id}`,
    workspaceId: item.workspaceId,
    leadId: item.leadId,
    kind: "crm",
    priority: item.status === "failed" ? "urgent" : "high",
    title: `FUB ${item.eventType}`,
    summary: item.detail ?? `Follow Up Boss contact ${item.followUpBossContactId} needs owner review.`,
    reason: "CRM ownership and sync conflicts can break attribution and handoff history.",
    actionLabel: "review sync",
    href: leadHref(item.leadId),
    createdAt: item.occurredAt,
    dueAt: null,
  }));
}

function failureQueueItems(items: OperationsFailureQueueResponse | null): OwnerHomeQueueItem[] {
  return (items?.items ?? []).map((item): OwnerHomeQueueItem => ({
    id: `ops:${item.id}`,
    workspaceId: item.workspaceId ?? "",
    leadId: null,
    kind: "operations",
    priority: item.retryable ? "urgent" : "high",
    title: item.title,
    summary: item.detail ?? `${item.provider ?? "Provider"} needs review.`,
    reason: item.operation ?? `Status: ${item.status}`,
    actionLabel: item.retryable ? "review operations" : "inspect issue",
    href: "/activity",
    createdAt: item.occurredAt,
    dueAt: null,
  })).filter((item) => item.workspaceId.length > 0);
}

export function buildOwnerQueueItems(params: {
  workspaceId: string;
  conversations: ConversationsInboxResponse;
  routingDesk: RoutingDeskResponse;
  harwickWorkItems: HarwickHomeWorkItem[];
  fubConflicts: FollowUpBossConflictQueueResponse | null;
  operationsFailures: OperationsFailureQueueResponse | null;
  operations: OperationsQueueSummary | null;
  readiness: WorkspaceReadinessSummary | null;
  limit?: number;
}): OwnerHomeQueueItem[] {
  const ownerInbox = filterOwnerInboxThreads(params.conversations.threads);
  const items = [
    ...operationsSummaryQueueItems({
      workspaceId: params.workspaceId,
      operations: params.operations,
      readiness: params.readiness,
    }),
    ...harwickQueueItems(params.harwickWorkItems),
    ...routingQueueItems(params.routingDesk.items),
    ...inboxQueueItems(ownerInbox),
    ...conflictQueueItems(params.fubConflicts),
    ...failureQueueItems(params.operationsFailures),
  ];

  const deduped = items.filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
  return deduped
    .sort((left, right) => {
      const priorityDelta = priorityWeight(left.priority) - priorityWeight(right.priority);
      if (priorityDelta !== 0) return priorityDelta;
      const kindDelta = ownerQueueKindWeight(left.kind) - ownerQueueKindWeight(right.kind);
      if (kindDelta !== 0) return kindDelta;
      const leftTime = Date.parse(left.dueAt ?? left.createdAt);
      const rightTime = Date.parse(right.dueAt ?? right.createdAt);
      return Number.isNaN(rightTime - leftTime) ? 0 : rightTime - leftTime;
    })
    .slice(0, params.limit ?? 8);
}

export function filterOwnerInboxThreads(threads: ConversationInboxThread[]): ConversationInboxThread[] {
  return sortOwnerInboxThreads(threads.filter(isOwnerInboxThread));
}

export function prioritizeOwnerRoutingItems(items: RoutingDeskItem[]): RoutingDeskItem[] {
  return sortOwnerRoutingItems(items);
}

export async function loadOwnerInbox(params: {
  workspaceId: string;
  repository: ConversationsInboxRepository;
  limit?: number;
}): Promise<ConversationsInboxResponse> {
  const conversations = await loadConversationsInbox(params);
  return ConversationsInboxResponseSchema.parse({
    workspaceId: params.workspaceId,
    threads: filterOwnerInboxThreads(conversations.threads).slice(0, params.limit ?? 6),
  });
}

export async function loadOwnerRouting(params: {
  workspaceId: string;
  repository: RoutingDeskRepository;
  limit?: number;
}): Promise<RoutingDeskResponse> {
  const routing = await loadRoutingDesk(params);
  return RoutingDeskResponseSchema.parse({
    workspaceId: params.workspaceId,
    agents: routing.agents,
    items: prioritizeOwnerRoutingItems(routing.items).slice(0, params.limit ?? 6),
  });
}

export function loadOwnerQueue(params: {
  workspaceId: string;
  conversations: ConversationsInboxResponse;
  routingDesk: RoutingDeskResponse;
  harwickWorkItems: HarwickHomeWorkItem[];
  fubConflicts: FollowUpBossConflictQueueResponse | null;
  operationsFailures: OperationsFailureQueueResponse | null;
  operations: OperationsQueueSummary | null;
  readiness: WorkspaceReadinessSummary | null;
  limit?: number;
}) {
  return OwnerHomeQueueResponseSchema.parse({
    workspaceId: params.workspaceId,
    items: buildOwnerQueueItems(params),
  });
}
