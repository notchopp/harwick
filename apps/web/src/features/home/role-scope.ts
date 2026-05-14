import type {
  HarwickHomeWorkItem,
  OwnerHomeQueueItem,
  RecentLeadItem,
  RoutingDeskItem,
  WorkspaceRole,
} from "@realty-ops/core";

import type { WorkItem } from "./home-page";

export type RoleTier = "owner" | "lead" | "agent" | "ops" | "viewer";

export function tierFor(role: WorkspaceRole): RoleTier {
  if (role === "owner" || role === "admin") return "owner";
  if (role === "team_lead" || role === "lead_manager") return "lead";
  if (role === "operator") return "ops";
  if (role === "viewer") return "viewer";
  return "agent";
}

export type RoleScope = {
  tier: RoleTier;
  role: WorkspaceRole;
  memberId: string;
  displayName: string;
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function workItemBelongsToMember(item: WorkItem, scope: RoleScope): boolean {
  // Tasks for harwick work items expose `loopDetail` etc. but not a memberId directly on Task.
  // We approximate via the underlying thread's assignedTo when present.
  if (item.kind === "reply") {
    const assignedTo = item.item.thread?.assignedTo ?? null;
    return normalize(assignedTo) === normalize(scope.displayName);
  }
  // Task: prefer thread.assignedTo match. Voice / FUB / ops failures may have no thread.
  const assignedTo = item.item.thread?.assignedTo ?? null;
  if (assignedTo !== null) {
    return normalize(assignedTo) === normalize(scope.displayName);
  }
  // Insight items with a target on the underlying harwickWorkItem payload — but we don't have the
  // raw item here; fall through to "unowned" classification.
  return false;
}

function isOpsWorkItem(item: WorkItem): boolean {
  if (item.kind !== "task") return false;
  const task = item.item;
  return task.type === "crm" || task.operationsFailureItemType !== undefined;
}

function isInsightOrApproval(item: WorkItem): boolean {
  return item.kind === "task" && item.item.type === "insight";
}

export function filterWorkItems(items: WorkItem[], scope: RoleScope): WorkItem[] {
  if (scope.tier === "owner" || scope.tier === "lead") {
    // Owners and leads see workspace + team-wide items.
    return items;
  }
  if (scope.tier === "ops") {
    // Ops focus: FUB conflicts, ops failures, harwick approvals. De-emphasize personal DMs.
    return items.filter((item) => isOpsWorkItem(item) || isInsightOrApproval(item));
  }
  // Agent / viewer: only items that belong to them.
  return items.filter((item) => workItemBelongsToMember(item, scope));
}

export function filterTeamWorkItems(items: WorkItem[], scope: RoleScope): WorkItem[] {
  // For team leads: items NOT assigned to them (so they can approve on team's behalf).
  if (scope.tier !== "lead" && scope.tier !== "owner") return [];
  return items.filter((item) => !workItemBelongsToMember(item, scope));
}

export function filterRecentLeads(leads: RecentLeadItem[], scope: RoleScope): RecentLeadItem[] {
  if (scope.tier === "owner" || scope.tier === "lead" || scope.tier === "ops") return leads;
  return leads.filter((lead) => normalize(lead.assignedDisplayName) === normalize(scope.displayName));
}

export function filterRouting(items: RoutingDeskItem[], scope: RoleScope): RoutingDeskItem[] {
  if (scope.tier === "owner" || scope.tier === "lead" || scope.tier === "ops") return items;
  return items.filter((item) => item.decision.assignedMemberId === scope.memberId);
}

export function filterOwnerQueue(items: OwnerHomeQueueItem[], scope: RoleScope): OwnerHomeQueueItem[] {
  if (scope.tier === "owner") return items;
  if (scope.tier === "lead") return items;
  if (scope.tier === "ops") return items.filter((item) => item.kind === "operations" || item.kind === "crm" || item.kind === "harwick");
  return items.filter((item) => item.leadId !== null);
}

export function filterHarwickWorkItems(items: HarwickHomeWorkItem[], scope: RoleScope): HarwickHomeWorkItem[] {
  if (scope.tier === "owner" || scope.tier === "lead" || scope.tier === "ops") return items;
  return items.filter((item) => item.targetMemberId === scope.memberId || (item.targetMemberId === null && item.targetRole === scope.role));
}

export function showRouting(scope: RoleScope): boolean {
  return scope.tier === "owner" || scope.tier === "lead";
}

export function showOpsHealth(scope: RoleScope): boolean {
  return scope.tier === "ops" || scope.tier === "owner";
}

export function showTeamPane(scope: RoleScope): boolean {
  return scope.tier === "owner" || scope.tier === "lead";
}

export function showMySchedule(scope: RoleScope): boolean {
  return scope.tier !== "ops";
}

export function actionsEnabled(scope: RoleScope): boolean {
  return scope.tier !== "viewer";
}
