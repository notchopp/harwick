import { z } from "zod";
import { EmailSchema, IsoDateTimeSchema, UuidSchema } from "./common.js";
import { WorkspaceRoleSchema } from "./workspace.js";

export const AuthenticatedUserSchema = z.object({
  id: UuidSchema,
  email: EmailSchema.nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
});

export const AuthWorkspaceMembershipSchema = z.object({
  workspaceId: UuidSchema,
  workspaceName: z.string().trim().min(1),
  memberId: UuidSchema,
  role: WorkspaceRoleSchema,
  displayName: z.string().trim().min(1),
});

export const AuthSessionSummarySchema = z.object({
  user: AuthenticatedUserSchema,
  memberships: z.array(AuthWorkspaceMembershipSchema),
});

export type AuthenticatedUser = z.infer<typeof AuthenticatedUserSchema>;
export type AuthWorkspaceMembership = z.infer<typeof AuthWorkspaceMembershipSchema>;
export type AuthSessionSummary = z.infer<typeof AuthSessionSummarySchema>;

