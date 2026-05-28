import { workspaceRoleHasCapability, type WorkspaceRole, type ConversationAutomationMode } from "@realty-ops/core";
import type { LeadsPageRepository, LeadTimelineEvent } from "../../features/leads/leads-data";
import type { LeadEventRow, SocialReplyReviewRow, WorkspaceMemberRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { ListingFactRow } from "./listings";
import type { RealtyOpsSupabaseClient } from "./server-client";

/**
 * Turn a chat actor + raw body into a short, human-readable timeline title.
 * Visitor turns get a leading quote so the source is immediately obvious;
 * Harwick/operator turns lead with the speaker.
 */
function titleForChatTurn(actor: string, body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  const snippet = trimmed.length <= 96 ? trimmed : `${trimmed.slice(0, 96).trimEnd()}…`;
  if (actor === "visitor") return `Visitor: "${snippet}"`;
  if (actor === "harwick" || actor === "assistant") return `Harwick: ${snippet}`;
  if (actor === "operator") return `Operator: ${snippet}`;
  return snippet;
}

function actorForChatTurn(rawActor: string): LeadTimelineEvent["actor"] {
  if (rawActor === "visitor") return "visitor";
  if (rawActor === "harwick" || rawActor === "assistant") return "harwick";
  if (rawActor === "operator") return "operator";
  return "system";
}

function titleForLeadEvent(eventType: string, sourceChannel: string): string {
  const channel = sourceChannel.replace(/_/g, " ");
  if (eventType === "reply_sent") return `Reply sent on ${channel}`;
  if (eventType === "call_completed") return `Call completed`;
  if (eventType === "message_received") return `Message received on ${channel}`;
  if (eventType === "comment_received") return `Comment on ${channel}`;
  return `${eventType.replace(/_/g, " ")} (${channel})`;
}

function actorForLeadEvent(eventType: string): LeadTimelineEvent["actor"] {
  if (eventType === "reply_sent") return "harwick";
  return "visitor";
}

export function createSupabaseLeadsPageRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadsPageRepository {
  return {
    async listLeads(workspaceId, limit, viewer) {
      let query = supabase
        .from("leads")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("last_message_at", { ascending: false })
        .limit(limit);

      if (!workspaceRoleHasCapability(viewer.role as WorkspaceRole, "leads.read_all")) {
        query = query.eq("assigned_agent_id", viewer.memberId);
      }

      const { data, error } = await query.returns<LeadRow[]>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async listWorkspaceMembers(workspaceId) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id,display_name,role")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .returns<Array<Pick<WorkspaceMemberRow, "id" | "display_name" | "role">>>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async listListingFacts(workspaceId, limit) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("address,status,price")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(limit)
        .returns<Array<Pick<ListingFactRow, "address" | "status" | "price">>>();
      if (error !== null) throw error;
      return data ?? [];
    },

    async findLatestLeadMessage(params) {
      // Try the public-listing-chat transcript first — for chat-origin
      // leads it's the freshest, richest source of the visitor's last
      // utterance. Falls back to lead_events for IG/FB/voice flows
      // where the chat table won't have anything. The two public-chat
      // tables aren't in the generated database.types.ts yet (added in
      // migrations 20260525*), so we cast at the boundary.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untyped = supabase as any;
      const sessionsQuery: { data: Array<{ id: string }> | null } = await untyped
        .from("public_listing_sessions")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("promoted_lead_id", params.leadId);
      const sessionIds: string[] = (sessionsQuery.data ?? []).map((row) => row.id);
      if (sessionIds.length > 0) {
        const turnsQuery: { data: { body: string | null } | null } = await untyped
          .from("public_listing_session_turns")
          .select("body")
          .in("session_id", sessionIds)
          .eq("actor", "visitor")
          .not("body", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const body = turnsQuery.data?.body ?? null;
        if (body !== null && body.trim().length > 0) {
          return body;
        }
      }
      const { data, error } = await supabase
        .from("lead_events")
        .select("text")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .not("text", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<LeadEventRow, "text">>();
      if (error !== null) throw error;
      return data?.text ?? null;
    },

    async loadLeadTimeline(params) {
      // Three sources merged into one ordered list:
      //   1. lead.created_at -> a synthesized "captured" event (always shown)
      //   2. public_listing_session_turns -> every chat turn (typed: visitor / harwick)
      //   3. lead_events -> reply_sent, call_completed, comment_received, etc.
      // Tables added in 20260525* migrations aren't in database.types.ts yet;
      // we cast at the boundary like findLatestLeadMessage does above.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const untyped = supabase as any;
      const events: LeadTimelineEvent[] = [];

      events.push({
        kind: "captured",
        actor: "system",
        title: "Lead captured",
        description: "Initial contact landed in the workspace.",
        occurredAt: params.createdAt,
      });

      const sessionsQuery: { data: Array<{ id: string }> | null } = await untyped
        .from("public_listing_sessions")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("promoted_lead_id", params.leadId);
      const sessionIds: string[] = (sessionsQuery.data ?? []).map((row) => row.id);

      if (sessionIds.length > 0) {
        const turnsQuery: {
          data: Array<{ actor: string; body: string | null; occurred_at: string }> | null;
        } = await untyped
          .from("public_listing_session_turns")
          .select("actor,body,occurred_at")
          .in("session_id", sessionIds)
          .not("body", "is", null)
          .order("occurred_at", { ascending: false })
          .limit(40);
        for (const row of turnsQuery.data ?? []) {
          if (row.body === null) continue;
          events.push({
            kind: "chat_turn",
            actor: actorForChatTurn(row.actor),
            title: titleForChatTurn(row.actor, row.body),
            description: row.body.trim().slice(0, 280),
            occurredAt: row.occurred_at,
          });
        }
      }

      const { data: leadEvents } = await supabase
        .from("lead_events")
        .select("event_type,source_channel,text,occurred_at")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("occurred_at", { ascending: false })
        .limit(20)
        .returns<Array<Pick<LeadEventRow, "event_type" | "source_channel" | "text" | "occurred_at">>>();
      for (const row of leadEvents ?? []) {
        events.push({
          kind: "lead_event",
          actor: actorForLeadEvent(row.event_type),
          title: titleForLeadEvent(row.event_type, row.source_channel),
          description: row.text === null ? "" : row.text.trim().slice(0, 280),
          occurredAt: row.occurred_at,
        });
      }

      events.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
      return events.slice(0, 25);
    },

    async findLatestSocialReviewForLead(params) {
      const { data, error } = await supabase
        .from("social_reply_reviews")
        .select("id,automation_mode,automation_reason")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<SocialReplyReviewRow, "id" | "automation_mode" | "automation_reason">>();
      if (error !== null) throw error;
      return data === null
        ? null
        : {
            id: data.id,
            automationMode: data.automation_mode as ConversationAutomationMode,
            automationReason: data.automation_reason,
          };
    },
  };
}
