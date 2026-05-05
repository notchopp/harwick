import { z } from "zod";

export const AuditLogActorTypeSchema = z.enum(["user", "ai", "system"]);
export type AuditLogActorType = z.infer<typeof AuditLogActorTypeSchema>;

export const AuditLogActionSchema = z.enum([
  "lead.assigned",
  "lead.reassigned",
  "lead.status_changed",
  "lead.qualification_updated",
  "conversation.takeover",
  "conversation.resume_ai",
  "conversation.automation_mode_changed",
  "integration.connected",
  "integration.disconnected",
  "member.added",
  "member.removed",
  "member.role_changed",
  "reply.sent",
  "reply.ai_approved",
  "reply.ai_blocked",
  "harwick_ai.policy_shadow",
  "routing_profile.updated",
  "workspace.settings_changed",
]);
export type AuditLogAction = z.infer<typeof AuditLogActionSchema>;

export const AuditLogResourceTypeSchema = z.enum([
  "lead",
  "conversation",
  "integration",
  "member",
  "reply",
  "harwick_ai_turn",
  "routing_profile",
  "workspace",
]);
export type AuditLogResourceType = z.infer<typeof AuditLogResourceTypeSchema>;

export const AuditLogEntrySchema = z.object({
  workspaceId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  actorType: AuditLogActorTypeSchema,
  action: AuditLogActionSchema,
  resourceType: AuditLogResourceTypeSchema,
  resourceId: z.string().uuid().nullable(),
  metadata: z.record(z.unknown()).default({}),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

export type AuditLogWriter = (entry: AuditLogEntry) => Promise<void>;
