import type {
  OpenHouseReminderLead,
  OpenHouseReminderListing,
  OpenHouseReminderRegistrationTask,
  OpenHouseReminderRepository,
} from "../../features/calendar/open-house-reminders";
import type { TablesInsert } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type ReminderTaskRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  listing_id: string | null;
  assigned_member_id: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  due_at: string | null;
};

type ReminderLeadRow = {
  id: string;
  workspace_id: string;
  full_name: string | null;
  phone: string | null;
  instagram_user_id: string | null;
  source_channel: OpenHouseReminderLead["sourceChannel"];
};

type ReminderListingRow = {
  id: string;
  workspace_id: string;
  address: string;
  mls_number: string | null;
};

function mapTask(row: ReminderTaskRow): OpenHouseReminderRegistrationTask {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    leadId: row.lead_id,
    listingId: row.listing_id,
    assignedMemberId: row.assigned_member_id,
    requestedStartAt: row.requested_start_at,
    requestedEndAt: row.requested_end_at,
    dueAt: row.due_at,
  };
}

function mapLead(row: ReminderLeadRow): OpenHouseReminderLead {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fullName: row.full_name,
    phone: row.phone,
    instagramUserId: row.instagram_user_id,
    sourceChannel: row.source_channel,
  };
}

function mapListing(row: ReminderListingRow): OpenHouseReminderListing {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    address: row.address,
    mlsNumber: row.mls_number,
  };
}

export function createSupabaseOpenHouseReminderRepository(
  supabase: RealtyOpsSupabaseClient,
): OpenHouseReminderRepository {
  return {
    async listUpcomingOpenHouseRegistrations(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id, workspace_id, lead_id, listing_id, assigned_member_id, requested_start_at, requested_end_at, due_at")
        .eq("task_type", "open_house_registration")
        .in("status", ["open", "in_progress"])
        .not("requested_start_at", "is", null)
        .gte("requested_start_at", params.windowStartIso)
        .lte("requested_start_at", params.windowEndIso)
        .order("requested_start_at", { ascending: true })
        .limit(params.limit)
        .returns<ReminderTaskRow[]>();

      if (error !== null) {
        throw error;
      }

      return (data ?? []).map(mapTask);
    },

    async findLead(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, workspace_id, full_name, phone, instagram_user_id, source_channel")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<ReminderLeadRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapLead(data);
    },

    async findListing(params) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("id, workspace_id, address, mls_number")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.listingId)
        .maybeSingle<ReminderListingRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : mapListing(data);
    },

    async upsertReminderEnrollment(params) {
      const insert: TablesInsert<"nurture_enrollments"> = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        status: "active",
        sequence_key: params.sequenceKey,
        next_action_at: params.nextActionAt,
        quiet_hours_timezone: "America/Chicago",
        last_step_index: 0,
      };
      const { data, error } = await supabase
        .from("nurture_enrollments")
        .upsert(insert, {
          onConflict: "workspace_id,lead_id,sequence_key",
        })
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      return data.id;
    },

    async findExistingReminderMessage(params) {
      const { data, error } = await supabase
        .from("nurture_messages")
        .select("id")
        .eq("workspace_id", params.workspaceId)
        .eq("enrollment_id", params.enrollmentId)
        .eq("step_index", params.stepIndex)
        .limit(1)
        .maybeSingle<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      return data;
    },

    async insertReminderMessage(params) {
      const insert: TablesInsert<"nurture_messages"> = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        enrollment_id: params.enrollmentId,
        channel: params.channel,
        status: params.status,
        step_index: params.stepIndex,
        body: params.body,
        block_reason: params.blockReason,
        scheduled_for: params.scheduledFor,
      };
      const { data, error } = await supabase
        .from("nurture_messages")
        .insert(insert)
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throw error;
      }

      return data.id;
    },

    async insertReviewTask(params) {
      const insert: TablesInsert<"lead_tasks"> = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        listing_id: params.listingId,
        task_type: "nurture_review",
        priority: "normal",
        title: params.title,
        description: params.description,
        due_at: params.dueAt,
        assigned_member_id: params.assignedMemberId,
      };
      const { error } = await supabase
        .from("lead_tasks")
        .insert(insert);

      if (error !== null) {
        throw error;
      }
    },
  };
}
