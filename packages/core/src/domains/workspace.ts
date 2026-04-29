import { z } from "zod";
import { IsoDateTimeSchema, NonEmptyStringSchema, UuidSchema } from "./common.js";

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "lead_manager", "agent"]);

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
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export type WorkspaceRole = z.infer<typeof WorkspaceRoleSchema>;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceMember = z.infer<typeof WorkspaceMemberSchema>;

