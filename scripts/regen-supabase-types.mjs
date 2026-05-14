// Regenerate apps/web/src/lib/supabase/database.types.ts from the live Supabase
// project schema via the Management API.
//
// Usage: node scripts/regen-supabase-types.mjs
//
// Requires SUPABASE_ACCESS_TOKEN (PAT) and SUPABASE_PROJECT_REF in .env.local.
//
// KNOWN DIVERGENCES (resolve before running regen, or the typecheck will fail):
//
// 1) supabase/migrations/20260502000300_agent_routing_settings.sql is broken —
//    references public.members which does not exist (should be workspace_members).
//    The agent_routing_settings table is missing from the live DB; codebase
//    (apps/web/src/lib/supabase/agent-routing-settings.ts +
//    apps/web/src/features/conversations/lead-routing.ts) still imports its
//    types. Fix the migration + apply it, or delete the consumers.
//
// 2) pgvector embedding columns (workspace_memory_embeddings, listing_embeddings,
//    agent_outcome_embeddings, agent_step_embeddings, agent_trajectory_embeddings)
//    appear as `string` in the regen output (Supabase typegen quirk), but the
//    codebase passes `number[]`. Pick a side: either cast at the boundary in
//    each consumer, or add an adapter that converts number[] <-> pgvector text.
//
// 3) agent_outcomes.outcome_label is regenerated as `string` (rejects null),
//    but consumer code may assign null. Audit the consumers.
//
// Until those are fixed, the hand-maintained database.types.ts stays
// authoritative. Add new tables there by following the same pattern as
// harwick_chat_threads / harwick_channels (added 2026-05-14).

import { writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readLocalEnv, requireEnvValue } from "./supabase-management.mjs";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envValues = await readLocalEnv(rootDirectory);
const accessToken = requireEnvValue(envValues, "SUPABASE_ACCESS_TOKEN");
const projectRef = requireEnvValue(envValues, "SUPABASE_PROJECT_REF");

const url = `https://api.supabase.com/v1/projects/${projectRef}/types/typescript?included_schemas=public`;
const response = await fetch(url, {
  headers: {
    authorization: `Bearer ${accessToken}`,
    accept: "application/json",
  },
});

if (!response.ok) {
  const detail = await response.text();
  throw new Error(`typegen failed with ${response.status}: ${detail}`);
}

const payload = await response.json();
const generated = typeof payload?.types === "string" ? payload.types : null;
if (generated === null || generated.length === 0) {
  throw new Error(`typegen response missing 'types' field. Got: ${JSON.stringify(payload).slice(0, 200)}`);
}

const targetPath = path.join(rootDirectory, "apps", "web", "src", "lib", "supabase", "database.types.ts");

// The Management API output uses the generic name "Database". Our codebase
// imports `RealtyOpsDatabase` from this file. Add an alias export at the end so
// existing imports keep working without touching every consumer.
const existing = await readFile(targetPath, "utf8");
const previousHeader = existing.split("\n").slice(0, 8).join("\n");

// Codebase consumers import a few convenience aliases on top of the generated
// `Database` type. Keep them in lockstep with the live tables so existing
// imports keep working. New aliases can be added here as needed.
const aliasFooter = `
// Convenience aliases for codebase consumers. Backed by generated Tables<>.
export type RealtyOpsDatabase = Database;
export type WorkspaceMemberRow = Tables<"workspace_members">;
export type WorkspaceRow = Tables<"workspaces">;
export type LeadRow = Tables<"leads">;
export type LeadEventRow = Tables<"lead_events">;
export type LeadTaskRow = Tables<"lead_tasks">;
export type SocialReplyReviewRow = Tables<"social_reply_reviews">;
export type ConversationAutomationStateRow = Tables<"conversation_automation_states">;
export type ConversationMessageRow = Tables<"conversation_messages">;
export type ConversationRow = Tables<"conversations">;
export type ConversationActivityLogRow = Tables<"conversation_activity_log">;
export type AgentTrajectoryRow = Tables<"agent_trajectories">;
export type AgentStepRow = Tables<"agent_steps">;
export type AgentOutcomeRow = Tables<"agent_outcomes">;
export type IntegrationAccountRow = Tables<"integration_accounts">;
export type CrmSyncLogRow = Tables<"crm_sync_logs">;
export type CrmBacksyncEventRow = Tables<"crm_backsync_events">;
export type FollowUpBossWebhookSubscriptionRow = Tables<"follow_up_boss_webhook_subscriptions">;
export type HarwickAiTurnInsertRow = TablesInsert<"harwick_ai_turns">;
export type HarwickAiToolCallInsertRow = TablesInsert<"harwick_ai_tool_calls">;
export type HarwickAiAutomationPolicyRow = Tables<"harwick_ai_automation_policies">;
export type HarwickWorkItemRow = Tables<"harwick_work_items">;
export type HarwickWorkItemInsertRow = TablesInsert<"harwick_work_items">;
export type HarwickRoutingDecisionRow = Tables<"harwick_routing_decisions">;
export type HarwickRoutingDecisionInsertRow = TablesInsert<"harwick_routing_decisions">;
export type HarwickLoopRow = Tables<"harwick_loops">;
export type HarwickLoopInsertRow = TablesInsert<"harwick_loops">;
export type HarwickLoopUpdateRow = TablesUpdate<"harwick_loops">;
export type HarwickLoopRunRow = Tables<"harwick_loop_runs">;
export type HarwickLoopRunInsertRow = TablesInsert<"harwick_loop_runs">;
export type HarwickLoopRunUpdateRow = TablesUpdate<"harwick_loop_runs">;
export type WorkspaceMemberCalendarConnectionRow = Tables<"workspace_member_calendar_connections">;
export type WorkspaceMemberCalendarConnectionInsertRow = TablesInsert<"workspace_member_calendar_connections">;
export type WorkspaceMemberCalendarConnectionUpdateRow = TablesUpdate<"workspace_member_calendar_connections">;
export type MemberRoutingProfileRow = Tables<"member_routing_profiles">;
export type MemberRoutingProfileInsertRow = TablesInsert<"member_routing_profiles">;
export type MemberRoutingProfileUpdateRow = TablesUpdate<"member_routing_profiles">;
export type NurtureMessageRow = Tables<"nurture_messages">;
export type ProviderErrorLogRow = Tables<"provider_error_logs">;
export type BillingWebhookEventRow = Tables<"billing_webhook_events">;
export type BillingWebhookEventInsertRow = TablesInsert<"billing_webhook_events">;
export type BillingWebhookEventUpdateRow = TablesUpdate<"billing_webhook_events">;
export type WorkspaceSubscriptionRow = Tables<"workspace_subscriptions">;
export type WorkspaceUsageEventInsertRow = TablesInsert<"workspace_usage_events">;
export type WorkspaceUsageSummaryRow = Tables<"workspace_usage_summaries">;
export type WorkspaceMemoryDocumentRow = Tables<"workspace_memory_documents">;
export type WorkspaceMemoryDocumentInsertRow = TablesInsert<"workspace_memory_documents">;
export type WorkspaceMemoryDocumentUpdateRow = TablesUpdate<"workspace_memory_documents">;
export type WorkerHeartbeatRow = Tables<"worker_heartbeats">;
export type HarwickChatThreadRow = Tables<"harwick_chat_threads">;
export type HarwickChannelRow = Tables<"harwick_channels">;
export type HarwickChannelMemberRow = Tables<"harwick_channel_members">;
export type HarwickChannelMessageRow = Tables<"harwick_channel_messages">;
`;
const content = `// AUTOGENERATED by scripts/regen-supabase-types.mjs from the live Supabase project.\n// Do not hand-edit. To refresh, run \`node scripts/regen-supabase-types.mjs\`.\n\n${generated.trimEnd()}\n${aliasFooter}`;

await writeFile(targetPath, content, "utf8");

console.log(`Wrote ${content.length.toLocaleString()} chars to apps/web/src/lib/supabase/database.types.ts`);
console.log(`(Replaced previous file. First lines were:\n${previousHeader.split("\n").slice(0, 3).join("\n")}\n)`);
