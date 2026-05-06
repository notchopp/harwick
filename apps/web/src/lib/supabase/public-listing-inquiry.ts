import type { PublicListingInquiryRequest } from "@realty-ops/core";
import type { PublicListingInquiryRepository } from "../../features/public-listings/public-listing-inquiry";
import type { TablesInsert } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type WorkspaceRow = {
  id: string;
};

type PublicListingRow = {
  id: string;
  address: string;
  workspace_id: string;
};

type PublicInquiryLeadRow = {
  id: string;
  assigned_agent_id: string | null;
};

function buildInquiryText(params: {
  listingAddress: string | null;
  values: PublicListingInquiryRequest;
}): string {
  const listingText = params.listingAddress === null ? "public listings" : params.listingAddress;
  const base = params.values.message ?? `Interested in ${listingText}.`;
  const requestedWindow = params.values.requestedStartAt === null
    || params.values.requestedStartAt === undefined
    ? null
    : `Preferred showing start: ${params.values.requestedStartAt}${params.values.requestedEndAt === null || params.values.requestedEndAt === undefined ? "" : ` to ${params.values.requestedEndAt}`}.`;

  return [
    base,
    `Intent: ${params.values.intent}.`,
    requestedWindow,
  ].filter((line): line is string => line !== null && line.trim().length > 0).join("\n");
}

function isHighIntentInquiry(intent: PublicListingInquiryRequest["intent"]): boolean {
  return intent === "showing" || intent === "open_house";
}

export function createSupabasePublicListingInquiryRepository(
  supabase: RealtyOpsSupabaseClient,
): PublicListingInquiryRepository {
  return {
    async findWorkspaceBySlug(workspaceSlug) {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id")
        .eq("slug", workspaceSlug)
        .maybeSingle<WorkspaceRow>();

      if (error !== null) {
        throw error;
      }

      return data === null ? null : { id: data.id };
    },

    async findListing(params) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("id, address, workspace_id")
        .eq("id", params.listingId)
        .eq("workspace_id", params.workspaceId)
        .maybeSingle<PublicListingRow>();

      if (error !== null) {
        throw error;
      }

      return data === null
        ? null
        : {
            id: data.id,
            address: data.address,
            workspaceId: data.workspace_id,
          };
    },

    async findExistingLead(params) {
      const { data: emailMatch, error: emailError } = await supabase
        .from("leads")
        .select("id, assigned_agent_id")
        .eq("workspace_id", params.workspaceId)
        .eq("email", params.email)
        .limit(1)
        .maybeSingle<PublicInquiryLeadRow>();

      if (emailError !== null) {
        throw emailError;
      }

      if (emailMatch !== null) {
        return {
          id: emailMatch.id,
          assignedAgentId: emailMatch.assigned_agent_id,
        };
      }

      const { data: phoneMatch, error: phoneError } = await supabase
        .from("leads")
        .select("id, assigned_agent_id")
        .eq("workspace_id", params.workspaceId)
        .eq("phone", params.phone)
        .limit(1)
        .maybeSingle<PublicInquiryLeadRow>();

      if (phoneError !== null) {
        throw phoneError;
      }

      return phoneMatch === null
        ? null
        : {
            id: phoneMatch.id,
            assignedAgentId: phoneMatch.assigned_agent_id,
          };
    },

    async updateLead(params) {
      const { error } = await supabase
        .from("leads")
        .update({
          full_name: params.values.fullName,
          email: params.values.email,
          phone: params.values.phone,
          timeline: params.values.timeline ?? null,
          budget_min: params.values.budget ?? null,
          status: isHighIntentInquiry(params.values.intent) ? "hot" : "engaged",
          updated_at: params.updatedAt,
        })
        .eq("id", params.leadId);

      if (error !== null) {
        throw error;
      }
    },

    async insertLead(params) {
      const { data, error } = await supabase
        .from("leads")
        .insert([{
          workspace_id: params.workspaceId,
          full_name: params.values.fullName,
          email: params.values.email,
          phone: params.values.phone,
          lead_type: "buyer",
          intent: isHighIntentInquiry(params.values.intent) ? "high" : "medium",
          source_channel: "manual",
          financing_status: "unknown",
          timeline: params.values.timeline ?? null,
          budget_min: params.values.budget ?? null,
          budget_max: null,
          status: isHighIntentInquiry(params.values.intent) ? "hot" : "new",
          score: isHighIntentInquiry(params.values.intent) ? 75 : 50,
          source_provider_id: null,
          source_post_id: null,
          source_comment_id: null,
          instagram_user_id: null,
          instagram_username: null,
          target_area: null,
          assigned_agent_id: null,
          follow_up_boss_contact_id: null,
          last_message_at: params.createdAt,
          next_followup_at: null,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        }])
        .select("id, assigned_agent_id")
        .single<PublicInquiryLeadRow>();

      if (error !== null) {
        throw error;
      }

      return {
        id: data.id,
        assignedAgentId: data.assigned_agent_id,
      };
    },

    async insertLeadEvent(params) {
      const insert: TablesInsert<"lead_events"> = {
        workspace_id: params.workspaceId,
        lead_id: params.leadId,
        provider: "manual",
        event_type: "message_received",
        source_channel: "manual",
        provider_event_id: params.providerEventId,
        provider_account_id: null,
        provider_user_id: null,
        source_post_id: null,
        source_comment_id: null,
        text: buildInquiryText({
          listingAddress: params.listing?.address ?? null,
          values: params.values,
        }),
        occurred_at: params.occurredAt,
      };

      const { error } = await supabase
        .from("lead_events")
        .upsert(insert, {
          onConflict: "workspace_id,provider,provider_event_id",
          ignoreDuplicates: true,
        });

      if (error !== null) {
        throw error;
      }
    },

    async insertShowingTask(params) {
      const title = `Showing request: ${params.listing.address}`;
      const description = [
        `Public listing showing request for ${params.listing.address}.`,
        `Lead: ${params.values.fullName}`,
        `Phone: ${params.values.phone}`,
        `Email: ${params.values.email}`,
        params.values.message ?? null,
      ].filter((line): line is string => line !== null && line.trim().length > 0).join("\n");

      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          listing_id: params.listing.id,
          task_type: "request_showing_approval",
          status: "open",
          priority: "high",
          title,
          description,
          requested_start_at: params.values.requestedStartAt ?? null,
          requested_end_at: params.values.requestedEndAt ?? null,
          due_at: params.values.requestedStartAt ?? null,
          assigned_member_id: params.assignedMemberId,
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

    async insertOpenHouseRegistrationTask(params) {
      const title = `Open house registration: ${params.listing.address}`;
      const description = [
        `Public listing open-house registration for ${params.listing.address}.`,
        `Lead: ${params.values.fullName}`,
        `Phone: ${params.values.phone}`,
        `Email: ${params.values.email}`,
        params.values.requestedStartAt === null || params.values.requestedStartAt === undefined
          ? null
          : `Requested arrival: ${params.values.requestedStartAt}`,
        params.values.message ?? null,
      ].filter((line): line is string => line !== null && line.trim().length > 0).join("\n");

      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          listing_id: params.listing.id,
          task_type: "open_house_registration",
          status: "open",
          priority: "normal",
          title,
          description,
          requested_start_at: params.values.requestedStartAt ?? null,
          requested_end_at: params.values.requestedEndAt ?? null,
          due_at: params.values.requestedStartAt ?? null,
          assigned_member_id: params.assignedMemberId,
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
  };
}
