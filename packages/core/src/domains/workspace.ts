import { z } from "zod";
import { IsoDateTimeSchema, NonEmptyStringSchema, UuidSchema } from "./common.js";

export const WorkspaceRoleSchema = z.enum([
  "owner",
  "admin",
  "team_lead",
  "lead_manager",
  "operator",
  "agent",
  "viewer",
]);

export const WorkspaceCapabilitySchema = z.enum([
  "workspace.read",
  "workspace.manage",
  "members.manage",
  "integrations.manage",
  "operations.read",
  "operations.manage",
  "leads.read_all",
  "leads.read_assigned",
  "leads.manage_all",
  "leads.manage_assigned",
  "conversations.read_all",
  "conversations.read_assigned",
  "conversations.takeover_assigned",
  "conversations.takeover_all",
  "listings.read",
  "listings.manage",
  "routing.manage",
  "billing.manage",
]);

const roleCapabilities = {
  owner: [
    "workspace.read",
    "workspace.manage",
    "members.manage",
    "integrations.manage",
    "operations.read",
    "operations.manage",
    "leads.read_all",
    "leads.manage_all",
    "conversations.read_all",
    "conversations.takeover_all",
    "listings.read",
    "listings.manage",
    "routing.manage",
    "billing.manage",
  ],
  admin: [
    "workspace.read",
    "workspace.manage",
    "members.manage",
    "integrations.manage",
    "operations.read",
    "operations.manage",
    "leads.read_all",
    "leads.manage_all",
    "conversations.read_all",
    "conversations.takeover_all",
    "listings.read",
    "listings.manage",
    "routing.manage",
  ],
  team_lead: [
    "workspace.read",
    "integrations.manage",
    "operations.read",
    "operations.manage",
    "leads.read_all",
    "leads.manage_all",
    "conversations.read_all",
    "conversations.takeover_all",
    "listings.read",
    "listings.manage",
    "routing.manage",
  ],
  lead_manager: [
    "workspace.read",
    "operations.read",
    "operations.manage",
    "leads.read_all",
    "leads.manage_all",
    "conversations.read_all",
    "conversations.takeover_all",
    "listings.read",
    "listings.manage",
    "routing.manage",
  ],
  operator: [
    "workspace.read",
    "operations.read",
    "leads.read_all",
    "leads.manage_all",
    "conversations.read_all",
    "conversations.takeover_all",
    "listings.read",
  ],
  agent: [
    "workspace.read",
    "leads.read_assigned",
    "leads.manage_assigned",
    "conversations.read_assigned",
    "conversations.takeover_assigned",
    "listings.read",
    "listings.manage",
  ],
  viewer: [
    "workspace.read",
    "operations.read",
    "leads.read_all",
    "conversations.read_all",
    "listings.read",
  ],
} as const satisfies Record<z.infer<typeof WorkspaceRoleSchema>, readonly z.infer<typeof WorkspaceCapabilitySchema>[]>;

export const WorkspaceSchema = z.object({
  id: UuidSchema,
  name: NonEmptyStringSchema.max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const WorkspaceMemberSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  userId: UuidSchema,
  role: WorkspaceRoleSchema,
  displayName: NonEmptyStringSchema.max(120),
  email: z.string().email().nullable(),
  avatarUrl: z.string().url().nullable(),
  roleLabel: z.string().trim().min(1).max(120).nullable(),
  presenceStatus: z.enum(["online", "in_call", "away"]).nullable(),
  presenceLastSeenAt: IsoDateTimeSchema.nullable(),
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type WorkspaceCapability = z.infer<typeof WorkspaceCapabilitySchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

export function getWorkspaceRoleCapabilities(role: WorkspaceRole): readonly WorkspaceCapability[] {
  return roleCapabilities[role];
}

export function workspaceRoleHasCapability(role: WorkspaceRole, capability: WorkspaceCapability): boolean {
  return (roleCapabilities[role] as readonly WorkspaceCapability[]).includes(capability);
}

export function isWorkspaceAdminRole(role: WorkspaceRole): boolean {
  return workspaceRoleHasCapability(role, "workspace.manage");
}

export function canManageWorkspaceMembers(role: WorkspaceRole): boolean {
  return workspaceRoleHasCapability(role, "members.manage");
}

export function canManageWorkspaceRouting(role: WorkspaceRole): boolean {
  return workspaceRoleHasCapability(role, "routing.manage");
}
