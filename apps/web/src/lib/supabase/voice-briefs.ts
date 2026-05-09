import type { VoiceBriefsRepository } from "../../features/voice/voice-briefs";
import type { LeadEventRow, LeadTaskRow } from "./database.types";
import type { LeadRow } from "./leads";
import type { RealtyOpsSupabaseClient } from "./server-client";
import type { VoiceLeadHandoffRow } from "./voice-handoffs";

type ConversationMessageSnippetRow = {
  id: string;
  body: string;
  created_at: string;
};

type LeadSnapshotRow = Pick<
  LeadRow,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "status"
  | "target_area"
  | "timeline"
  | "budget_min"
  | "budget_max"
  | "last_message_at"
>;

type LeadActivityRow = Pick<
  LeadRow,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "status"
  | "score"
  | "last_message_at"
>;

type ListingContextRow = {
  id: string;
  address: string;
  price: number | null;
};

async function countQuery(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  const { count, error } = await query;
  if (error !== null) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Supabase count query failed.");
  }
  return count ?? 0;
}

function displayNameForLead(row: {
  full_name: string | null;
  email: string | null;
  phone: string | null;
  id: string;
}): string {
  if (row.full_name !== null && row.full_name.trim().length > 0) {
    return row.full_name.trim();
  }
  if (row.email !== null && row.email.trim().length > 0) {
    return row.email.trim();
  }
  if (row.phone !== null && row.phone.trim().length > 0) {
    return row.phone.trim();
  }
  return `Lead ${row.id.slice(0, 8)}`;
}

export function createSupabaseVoiceBriefsRepository(
  supabase: RealtyOpsSupabaseClient,
): VoiceBriefsRepository {
  return {
    countActiveConversationsSince(params) {
      return countQuery(
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", params.workspaceId)
          .gte("last_message_at", params.sinceIso)
          .neq("status", "archived"),
      );
    },

    countUnassignedPriorityLeads(workspaceId) {
      return countQuery(
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .is("assigned_agent_id", null)
          .gte("score", 70)
          .not("status", "in", "(archived,closed_lost,closed_won)"),
      );
    },

    countNurtureLeads(workspaceId) {
      return countQuery(
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("status", "nurture"),
      );
    },

    async listRecentLeadActivity(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id,full_name,email,phone,status,score,last_message_at")
        .eq("workspace_id", params.workspaceId)
        .not("last_message_at", "is", null)
        .neq("status", "archived")
        .order("last_message_at", { ascending: false })
        .limit(params.limit)
        .returns<LeadActivityRow[]>();
      if (error !== null) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        leadId: row.id,
        leadName: displayNameForLead(row),
        status: row.status,
        score: row.score,
        lastMessageAt: row.last_message_at,
      }));
    },

    async listPendingVoiceHandoffs(params) {
      const { data, error } = await supabase
        .from("voice_lead_handoffs")
        .select("id,lead_id,caller_name,summary,urgency")
        .eq("workspace_id", params.workspaceId)
        .eq("review_status", "pending")
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<Array<Pick<VoiceLeadHandoffRow, "id" | "lead_id" | "caller_name" | "summary" | "urgency">>>();
      if (error !== null) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        callerName: row.caller_name,
        summary: row.summary,
        urgency: row.urgency,
      }));
    },

    async listOpenShowingTasks(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id,lead_id,title,status,requested_start_at,requested_end_at")
        .eq("workspace_id", params.workspaceId)
        .in("task_type", ["request_showing_approval", "showing_approval"])
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(params.limit)
        .returns<Array<Pick<LeadTaskRow, "id" | "lead_id" | "title" | "status" | "requested_start_at" | "requested_end_at">>>();
      if (error !== null) {
        throw error;
      }
      return (data ?? []).map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        title: row.title,
        status: row.status,
        requestedStartAt: row.requested_start_at,
        requestedEndAt: row.requested_end_at,
      }));
    },

    async findLeadSnapshot(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id,full_name,email,phone,status,target_area,timeline,budget_min,budget_max,last_message_at")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<LeadSnapshotRow>();
      if (error !== null) {
        throw error;
      }
      if (data === null) {
        return null;
      }
      return {
        id: data.id,
        name: displayNameForLead(data),
        status: data.status,
        targetArea: data.target_area,
        timeline: data.timeline,
        budgetMin: data.budget_min,
        budgetMax: data.budget_max,
        lastMessageAt: data.last_message_at,
      };
    },

    async findLatestConversationSnippet(params) {
      const { data, error } = await supabase
        .from("conversation_messages")
        .select("id,body,created_at")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle<ConversationMessageSnippetRow>();
      if (error !== null) {
        throw error;
      }
      if (data === null || data.body.trim().length === 0) {
        return null;
      }
      return {
        body: data.body.trim().slice(0, 500),
        occurredAt: data.created_at,
      };
    },

    async findLatestLeadEventSnippet(params) {
      const { data, error } = await supabase
        .from("lead_events")
        .select("text,occurred_at")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .not("text", "is", null)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle<Pick<LeadEventRow, "text" | "occurred_at">>();
      if (error !== null) {
        throw error;
      }
      const text = data?.text?.trim();
      if (text === undefined || text.length === 0) {
        return null;
      }
      return {
        body: text.slice(0, 500),
        occurredAt: data!.occurred_at,
      };
    },

    async findShowingContext(params) {
      const taskQuery = supabase
        .from("lead_tasks")
        .select("id,lead_id,title,status,requested_start_at,requested_end_at,listing_id")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .in("task_type", ["request_showing_approval", "showing_approval"])
        .order("created_at", { ascending: false })
        .limit(1);

      const taskResult = params.taskId === undefined
        ? await taskQuery.maybeSingle<Pick<LeadTaskRow, "id" | "lead_id" | "title" | "status" | "requested_start_at" | "requested_end_at" | "listing_id">>()
        : await supabase
          .from("lead_tasks")
          .select("id,lead_id,title,status,requested_start_at,requested_end_at,listing_id")
          .eq("workspace_id", params.workspaceId)
          .eq("lead_id", params.leadId)
          .eq("id", params.taskId)
          .in("task_type", ["request_showing_approval", "showing_approval"])
          .maybeSingle<Pick<LeadTaskRow, "id" | "lead_id" | "title" | "status" | "requested_start_at" | "requested_end_at" | "listing_id">>();

      if (taskResult.error !== null) {
        throw taskResult.error;
      }
      const task = taskResult.data;
      if (task === null) {
        return { task: null, listing: null };
      }

      let listing: ListingContextRow | null = null;
      if (task.listing_id !== null) {
        const { data, error } = await supabase
          .from("listing_facts")
          .select("id,address,price")
          .eq("workspace_id", params.workspaceId)
          .eq("id", task.listing_id)
          .maybeSingle<ListingContextRow>();
        if (error !== null) {
          throw error;
        }
        listing = data ?? null;
      }

      return {
        task: {
          id: task.id,
          leadId: task.lead_id,
          title: task.title,
          status: task.status,
          requestedStartAt: task.requested_start_at,
          requestedEndAt: task.requested_end_at,
        },
        listing: listing === null ? null : {
          id: listing.id,
          address: listing.address,
          price: listing.price,
        },
      };
    },

    async createDebriefConversationMessage(params) {
      const { data, error } = await supabase
        .from("conversation_messages")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          sender_type: "operator",
          sender_id: null,
          source_channel: "manual",
          status: "sent",
          body: params.body,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        })
        .select("id")
        .single<{ id: string }>();
      if (error !== null) {
        throw error;
      }
      return data.id;
    },

    async createFollowUpTask(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          task_type: "post_showing_debrief",
          status: "open",
          title: params.title,
          description: params.description,
          priority: params.priority,
          due_at: params.dueAt,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        })
        .select("id")
        .single<{ id: string }>();
      if (error !== null) {
        throw error;
      }
      return data.id;
    },

    async updateLeadStatus(params) {
      const { error } = await supabase
        .from("leads")
        .update({
          status: params.status,
          next_followup_at: params.nextFollowUpAt,
          updated_at: params.updatedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId);
      if (error !== null) {
        throw error;
      }
    },
  };
}
