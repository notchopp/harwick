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
  "queue.social_reply_action",
  "queue.voice_handoff_action",
  "queue.showing_task_action",
  "queue.nurture_message_action",
  "operations.failure_action",
  "operations.fub_conflict_action",
  "harwick_work_item.action",
  "harwick_ai.policy_shadow",
  "routing_profile.updated",
  "workspace.settings_changed",
  "training.surface_feedback",
]);
export type AuditLogAction = z.infer<typeof AuditLogActionSchema>;

export const AuditLogResourceTypeSchema = z.enum([
  "lead",
  "conversation",
  "integration",
  "member",
  "reply",
  "voice_handoff",
  "showing_task",
  "nurture_message",
  "crm_sync",
  "crm_backsync_event",
  "workflow_job",
  "harwick_work_item",
  "harwick_ai_turn",
  "routing_profile",
  "workspace",
  "routing_decision",
  "proactive_card",
  "workspace_memory",
  "synthesis_field",
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
