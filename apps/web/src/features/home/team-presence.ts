import {
  TeamPresenceResponseSchema,
  type TeamPresenceMember,
  type TeamPresenceResponse,
  type TeamPresenceStatus,
  type WorkspaceRole,
} from "@realty-ops/core";
import type { WorkspaceMemberRow } from "../../lib/supabase/database.types";

export type WorkspaceMemberPresenceRow = Pick<
  WorkspaceMemberRow,
  | "id"
  | "workspace_id"
  | "role"
  | "display_name"
  | "avatar_url"
  | "role_label"
  | "presence_status"
  | "presence_last_seen_at"
>;

export type TeamPresenceRepository = {
  listActiveMembers(workspaceId: string): Promise<WorkspaceMemberPresenceRow[]>;
  countActiveLeadsByMember(workspaceId: string): Promise<Map<string, number>>;
  countOpenWorkByMember(workspaceId: string): Promise<Map<string, number>>;
};

function initialsForName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 3)
    .toUpperCase() || "U";
}

function roleLabelFor(role: WorkspaceRole): string {
  if (role === "owner") return "owner";
  if (role === "admin") return "team ops";
  if (role === "lead_manager") return "lead manager";
  return "agent";
}

function statusFromLastSeen(row: WorkspaceMemberPresenceRow, now: Date): TeamPresenceStatus {
  if (row.presence_status !== null) {
    return row.presence_status;
  }

  if (row.presence_last_seen_at === null) {
    return "away";
  }

  const ageMs = now.getTime() - new Date(row.presence_last_seen_at).getTime();
  if (ageMs <= 5 * 60 * 1000) return "online";
  if (ageMs <= 20 * 60 * 1000) return "away";
  return "away";
}

function lastSeenCopy(row: WorkspaceMemberPresenceRow, now: Date): string {
  if (row.presence_status === "in_call") return "on a call";
  if (row.presence_last_seen_at === null) return "offline";

  const ageMinutes = Math.max(0, Math.floor((now.getTime() - new Date(row.presence_last_seen_at).getTime()) / 60_000));
  if (ageMinutes < 1) return "active now";
  if (ageMinutes < 60) return `away ${ageMinutes}m`;
  return `seen ${Math.floor(ageMinutes / 60)}h ago`;
}

export async function loadTeamPresence(params: {
  workspaceId: string;
  repository: TeamPresenceRepository;
  now?: () => Date;
}): Promise<TeamPresenceResponse> {
  const now = params.now?.() ?? new Date();
  const [members, activeLeadCounts, openWorkCounts] = await Promise.all([
    params.repository.listActiveMembers(params.workspaceId),
    params.repository.countActiveLeadsByMember(params.workspaceId),
    params.repository.countOpenWorkByMember(params.workspaceId),
  ]);

  const mappedMembers: TeamPresenceMember[] = members.map((member) => ({
    id: member.id,
    workspaceId: member.workspace_id,
    activeLeadCount: activeLeadCounts.get(member.id) ?? 0,
    avatarUrl: member.avatar_url,
    initials: initialsForName(member.display_name),
    lastSeen: lastSeenCopy(member, now),
    lastSeenAt: member.presence_last_seen_at,
    name: member.display_name,
    openWork: openWorkCounts.get(member.id) ?? 0,
    role: member.role,
    roleLabel: member.role_label ?? roleLabelFor(member.role),
    status: statusFromLastSeen(member, now),
  }));

  return TeamPresenceResponseSchema.parse({
    workspaceId: params.workspaceId,
    members: mappedMembers,
  });
}
