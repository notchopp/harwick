import type {
  PublicListingChatLeadCapture,
  PublicListingChatRepository,
} from "../../features/public-listings/public-listing-chat";
import type { Json } from "./database.types";
import type { TablesInsert } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

type WorkspaceRow = {
  id: string;
  name: string | null;
  slug: string;
};

type ListingRow = {
  id: string;
  address: string;
  workspace_id: string;
  mls_number: string | null;
  status: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  raw_facts: Json;
  verified_at: string | null;
};

type LeadRow = {
  id: string;
  assigned_agent_id: string | null;
};

function fallbackWorkspaceName(slug: string): string {
  const name = slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

  return name.length === 0 ? "Workspace" : name;
}

function rawRecord(rawFacts: Json): Record<string, unknown> {
  return typeof rawFacts === "object" && rawFacts !== null && !Array.isArray(rawFacts)
    ? rawFacts
    : {};
}

function leadStatus(values: PublicListingChatLeadCapture): string {
  if (values.intent === "showing" || values.leadIntent === "high") return "hot";
  return "engaged";
}

function buildChatLeadEventText(params: {
  listingAddress: string;
  values: PublicListingChatLeadCapture;
}): string {
  return [
    params.values.message,
    `Listing: ${params.listingAddress}.`,
    `Intent: ${params.values.intent}.`,
    params.values.timeline === null ? null : `Timeline: ${params.values.timeline}.`,
    params.values.budget === null ? null : `Budget: ${params.values.budget}.`,
    params.values.targetArea === null ? null : `Area: ${params.values.targetArea}.`,
    params.values.financingStatus === "unknown" ? null : `Financing: ${params.values.financingStatus}.`,
  ].filter((line): line is string => line !== null && line.trim().length > 0).join("\n");
}

export function createSupabasePublicListingChatRepository(
  supabase: RealtyOpsSupabaseClient,
): PublicListingChatRepository {
  return {
    async findWorkspaceBySlug(workspaceSlug) {
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, slug")
        .eq("slug", workspaceSlug)
        .maybeSingle<WorkspaceRow>();

      if (error !== null) {
        throw error;
      }

      return data === null
        ? null
        : {
            id: data.id,
            name: data.name ?? fallbackWorkspaceName(data.slug),
          };
    },

    async findListing(params) {
      const { data, error } = await supabase
        .from("listing_facts")
        .select("id, address, workspace_id, mls_number, status, price, beds, baths, raw_facts, verified_at")
        .eq("id", params.listingId)
        .eq("workspace_id", params.workspaceId)
        .maybeSingle<ListingRow>();

      if (error !== null) {
        throw error;
      }

      return data === null
        ? null
        : {
            id: data.id,
            address: data.address,
            workspaceId: data.workspace_id,
            mlsNumber: data.mls_number,
            status: data.status,
            price: data.price,
            beds: data.beds,
            baths: data.baths,
            rawFacts: rawRecord(data.raw_facts),
            verifiedAt: data.verified_at,
          };
    },

    async findExistingLead(params) {
      if (params.email !== null) {
        const { data: emailMatch, error: emailError } = await supabase
          .from("leads")
          .select("id, assigned_agent_id")
          .eq("workspace_id", params.workspaceId)
          .eq("email", params.email)
          .limit(1)
          .maybeSingle<LeadRow>();

        if (emailError !== null) {
          throw emailError;
        }

        if (emailMatch !== null) {
          return {
            id: emailMatch.id,
            assignedAgentId: emailMatch.assigned_agent_id,
          };
        }
      }

      const { data: phoneMatch, error: phoneError } = await supabase
        .from("leads")
        .select("id, assigned_agent_id")
        .eq("workspace_id", params.workspaceId)
        .eq("phone", params.phone)
        .limit(1)
        .maybeSingle<LeadRow>();

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

    async insertLead(params) {
      const { data, error } = await supabase
        .from("leads")
        .insert([{
          workspace_id: params.workspaceId,
          full_name: params.values.fullName,
          email: params.values.email,
          phone: params.values.phone,
          lead_type: params.values.leadType === "unknown" ? "buyer" : params.values.leadType,
          intent: params.values.leadIntent === "unknown" ? "medium" : params.values.leadIntent,
          source_channel: "manual",
          financing_status: params.values.financingStatus,
          timeline: params.values.timeline,
          budget_min: params.values.budget,
          budget_max: null,
          target_area: params.values.targetArea,
          qualification_summary: params.values.documentUpdate.length > 0 ? params.values.documentUpdate : null,
          status: leadStatus(params.values),
          score: params.values.score,
          source_provider_id: null,
          source_post_id: null,
          source_comment_id: null,
          instagram_user_id: null,
          instagram_username: null,
          assigned_agent_id: null,
          follow_up_boss_contact_id: null,
          last_message_at: params.createdAt,
          next_followup_at: null,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        }])
        .select("id, assigned_agent_id")
        .single<LeadRow>();

      if (error !== null) {
        throw error;
      }

      return {
        id: data.id,
        assignedAgentId: data.assigned_agent_id,
      };
    },

    async updateLead(params) {
      const { error } = await supabase
        .from("leads")
        .update({
          full_name: params.values.fullName,
          email: params.values.email,
          phone: params.values.phone,
          lead_type: params.values.leadType === "unknown" ? "buyer" : params.values.leadType,
          intent: params.values.leadIntent === "unknown" ? "medium" : params.values.leadIntent,
          financing_status: params.values.financingStatus,
          timeline: params.values.timeline,
          budget_min: params.values.budget,
          target_area: params.values.targetArea,
          qualification_summary: params.values.documentUpdate.length > 0 ? params.values.documentUpdate : null,
          status: leadStatus(params.values),
          score: params.values.score,
          last_message_at: params.updatedAt,
          updated_at: params.updatedAt,
        })
        .eq("id", params.leadId);

      if (error !== null) {
        throw error;
      }
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
        text: buildChatLeadEventText({
          listingAddress: params.listing.address,
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
        `Harwick-qualified public listing showing request for ${params.listing.address}.`,
        params.values.fullName === null ? null : `Lead: ${params.values.fullName}`,
        `Phone: ${params.values.phone}`,
        params.values.email === null ? null : `Email: ${params.values.email}`,
        params.values.timeline === null ? null : `Timeline: ${params.values.timeline}`,
        params.values.message,
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
          requested_start_at: null,
          requested_end_at: null,
          due_at: null,
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
