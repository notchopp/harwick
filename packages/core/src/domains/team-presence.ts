import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "./common.js";
import { WorkspaceRoleSchema } from "./workspace.js";

export const TeamPresenceStatusSchema = z.enum(["online", "in_call", "away"]);

export const TeamPresenceMemberSchema = z.object({
  id: UuidSchema,
  workspaceId: UuidSchema,
  activeLeadCount: z.number().int().min(0),
  avatarUrl: z.string().url().nullable(),
  initials: z.string().trim().min(1).max(4),
  lastSeen: z.string().trim().min(1),
  lastSeenAt: IsoDateTimeSchema.nullable(),
  name: z.string().trim().min(1).max(120),
  openWork: z.number().int().min(0),
  role: WorkspaceRoleSchema,
  roleLabel: z.string().trim().min(1).max(120),
  status: TeamPresenceStatusSchema,
});

export const TeamPresenceResponseSchema = z.object({
  workspaceId: UuidSchema,
  members: z.array(TeamPresenceMemberSchema),
});

export type TeamPresenceStatus = z.infer<typeof TeamPresenceStatusSchema>;
export type TeamPresenceMember = z.infer<typeof TeamPresenceMemberSchema>;
export type TeamPresenceResponse = z.infer<typeof TeamPresenceResponseSchema>;
