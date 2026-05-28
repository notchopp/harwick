import type {
  ListingAreaIntel,
  ListingMemory,
  PublicListingChatQualification,
} from "@realty-ops/core";
import { ListingAreaIntelSchema, PublicListingChatQualificationSchema } from "@realty-ops/core";

import type {
  PublicListingChatLeadCapture,
  PublicListingChatListing,
  PublicListingChatRepository,
  PublicListingChatSession,
  PublicListingChatSessionTurn,
  PublicListingChatVisitorContext,
} from "../../features/public-listings/public-listing-chat";
import type { Json } from "./database.types";
import type { TablesInsert } from "./database.types";
import { buildNextLeadDocument } from "./lead-document";
import type { RealtyOpsSupabaseClient } from "./server-client";

type ListingMemoryRow = {
  id: string;
  workspace_id: string;
  listing_id: string;
  kind: ListingMemory["kind"];
  visibility: ListingMemory["visibility"];
  prompt: string | null;
  content: string;
  source: ListingMemory["source"];
  display_order: number;
  created_by_member_id: string | null;
  created_at: string;
  updated_at: string;
};

type SessionRow = {
  id: string;
  session_token: string;
  qualification: Json;
  promoted_lead_id: string | null;
};

type SessionTurnRow = {
  actor: "visitor" | "harwick_ai";
  body: string;
  occurred_at: string;
};

type ShowingTaskRow = {
  id: string;
  listing_id: string | null;
  requested_start_at: string | null;
  requested_end_at: string | null;
  status: string;
  assigned_member_id: string | null;
};

function qualificationFromJson(value: Json): PublicListingChatQualification {
  const parsed = PublicListingChatQualificationSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

function throwSupabaseError(error: { message: string }): never {
  throw new Error(error.message);
}

// Three tables this repo writes to (listing_memory,
// public_listing_sessions, public_listing_session_turns) were added in
// migrations 20260525000100 + 20260525000200 and are not yet in the
// generated database.types.ts. Cast the supabase client at this boundary
// only — every downstream value is re-typed through ListingMemoryRow /
// SessionRow / SessionTurnRow so the loss of inference here doesn't
// propagate. Regenerating the types via `npm run db:types` against the
// deployed schema after these migrations land will remove the need for
// this shim entirely.
// Minimal builder shape covering only the methods we actually chain on
// these three new tables. Each terminal method (`maybeSingle`,
// `single`, `returns`) accepts a generic so downstream code keeps its
// declared row types — the loss of inference is contained to the
// "table is unknown" boundary, not the row payloads. Once
// `npm run db:types` regenerates database.types.ts after these
// migrations land in the deployed schema, this shim disappears and we
// switch back to the typed supabase client.
type UntypedBuilder = {
  select: (cols: string) => UntypedBuilder;
  insert: (row: unknown) => UntypedBuilder;
  update: (row: unknown) => UntypedBuilder;
  eq: (col: string, val: unknown) => UntypedBuilder;
  order: (col: string, opts?: { ascending: boolean }) => UntypedBuilder;
  limit: (count: number) => UntypedBuilder;
  maybeSingle: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
  single: <T>() => Promise<{ data: T; error: { message: string } | null }>;
  returns: <T>() => Promise<{ data: T | null; error: { message: string } | null }>;
  then: <T>(onFulfilled?: (value: { data: T | null; error: { message: string } | null }) => unknown) => Promise<unknown>;
};

function untyped(supabase: RealtyOpsSupabaseClient): { from: (table: string) => UntypedBuilder } {
  return supabase as unknown as { from: (table: string) => UntypedBuilder };
}

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

type LeadDocumentRow = {
  lead_document: string | null;
};

type LeadIdentityRow = {
  id: string;
  full_name: string | null;
  assigned_agent_id: string | null;
};

type WorkspaceMemberRow = {
  id: string;
  display_name: string;
  role: string;
  role_label: string | null;
  email: string | null;
  avatar_url: string | null;
};

type RoutingProfileRow = {
  member_id: string;
  role_label: string;
  areas: string[];
  property_types: string[];
  lead_types: string[];
  accepts_new_leads: boolean;
};

type VisitorSessionContextRow = {
  id: string;
  listing_id: string;
  qualification: Json;
  promoted_lead_id: string | null;
  last_active_at: string;
  created_at: string;
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

function areaIntelFromRawFacts(rawFacts: Record<string, unknown>): ListingAreaIntel | null {
  const candidate = rawFacts["areaIntel"] ?? rawFacts["area_intel"];
  const parsed = ListingAreaIntelSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function listingFromRow(row: ListingRow): PublicListingChatListing {
  const rawFacts = rawRecord(row.raw_facts);
  return {
    id: row.id,
    address: row.address,
    workspaceId: row.workspace_id,
    mlsNumber: row.mls_number,
    status: row.status,
    price: row.price,
    beds: row.beds,
    baths: row.baths,
    rawFacts,
    verifiedAt: row.verified_at,
    areaIntel: areaIntelFromRawFacts(rawFacts),
  };
}

function isActiveListingStatus(status: string | null): boolean {
  const normalized = (status ?? "").toLowerCase();
  return !(/sold|pending|contract|withdrawn|expired/.test(normalized));
}

function normalizePriceRange(criteria: {
  minPrice?: number | null;
  maxPrice?: number | null;
}): { minPrice: number | null; maxPrice: number | null } {
  const min = typeof criteria.minPrice === "number" && Number.isFinite(criteria.minPrice)
    ? criteria.minPrice
    : null;
  const max = typeof criteria.maxPrice === "number" && Number.isFinite(criteria.maxPrice)
    ? criteria.maxPrice
    : null;

  if (min !== null && max === null) {
    return {
      minPrice: Math.round(min * 0.75),
      maxPrice: Math.round(min * 1.35),
    };
  }

  if (min !== null && max !== null && Math.abs(min - max) <= Math.max(min, max) * 0.02) {
    const anchor = Math.max(min, max);
    return {
      minPrice: Math.round(anchor * 0.75),
      maxPrice: Math.round(anchor * 1.35),
    };
  }

  return { minPrice: min, maxPrice: max };
}

function leadStatus(values: PublicListingChatLeadCapture): string {
  if (values.intent === "showing" || values.leadIntent === "high") return "hot";
  return "engaged";
}

function leadDocumentFromPublicChat(params: {
  existing?: string | null;
  values: PublicListingChatLeadCapture;
  occurredAt: string;
}): string {
  return buildNextLeadDocument({
    existing: params.existing ?? null,
    update: params.values.documentUpdate,
    occurredAt: params.occurredAt,
  });
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
        throwSupabaseError(error);
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
        throwSupabaseError(error);
      }

      return data === null
        ? null
        : listingFromRow(data);
    },

    async findOtherListings(params) {
      const query = untyped(supabase)
        .from("listing_facts")
        .select("id, address, workspace_id, mls_number, status, price, beds, baths, raw_facts, verified_at")
        .eq("workspace_id", params.workspaceId);

      const priceRange = normalizePriceRange(params.criteria);
      const { data, error } = await query
        .order("updated_at", { ascending: false })
        .limit(Math.max(params.limit * 20, 100))
        .returns<ListingRow[]>();
      if (error !== null) throwSupabaseError(error);
      const candidates = (data ?? [])
        .filter((row) => row.id !== params.excludeListingId)
        .map<PublicListingChatListing>(listingFromRow);
      const matches = candidates.filter((listing) => {
        if (!isActiveListingStatus(listing.status)) return false;
        if (priceRange.maxPrice !== null && listing.price !== null && listing.price > priceRange.maxPrice) return false;
        if (priceRange.minPrice !== null && listing.price !== null && listing.price < priceRange.minPrice) return false;
        if (typeof params.criteria.minBeds === "number" && listing.beds !== null && listing.beds < params.criteria.minBeds) return false;
        if (typeof params.criteria.propertyType === "string" && params.criteria.propertyType.length > 0) {
          const listingPropertyType = listing.rawFacts["propertyType"];
          const listingType = typeof listingPropertyType === "string" ? listingPropertyType.toLowerCase() : "";
          if (!listingType.includes(params.criteria.propertyType.toLowerCase())) return false;
        }
        if (typeof params.criteria.areaContains === "string" && params.criteria.areaContains.length > 0) {
          const needle = params.criteria.areaContains.toLowerCase();
          const haystack = `${listing.address} ${typeof listing.rawFacts["neighborhood"] === "string" ? listing.rawFacts["neighborhood"] : ""} ${typeof listing.rawFacts["city"] === "string" ? listing.rawFacts["city"] : ""}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });
      return matches.slice(0, params.limit);
    },

    async findWorkspaceTeam(params) {
      const [{ data: members, error: membersError }, { data: profiles, error: profilesError }] = await Promise.all([
        supabase
          .from("workspace_members")
          .select("id, display_name, role, role_label, email, avatar_url")
          .eq("workspace_id", params.workspaceId)
          .eq("is_active", true)
          .returns<WorkspaceMemberRow[]>(),
        supabase
          .from("member_routing_profiles")
          .select("member_id, role_label, areas, property_types, lead_types, accepts_new_leads")
          .eq("workspace_id", params.workspaceId)
          .returns<RoutingProfileRow[]>(),
      ]);

      if (membersError !== null) throwSupabaseError(membersError);
      if (profilesError !== null) throwSupabaseError(profilesError);

      const profilesByMember = new Map<string, RoutingProfileRow[]>();
      for (const profile of profiles ?? []) {
        const existing = profilesByMember.get(profile.member_id) ?? [];
        existing.push(profile);
        profilesByMember.set(profile.member_id, existing);
      }

      return (members ?? []).map((member) => {
        const memberProfiles = profilesByMember.get(member.id) ?? [];
        const specialties = memberProfiles.flatMap((profile) => [
          profile.role_label,
          ...profile.areas,
          ...profile.property_types,
          ...profile.lead_types,
          profile.accepts_new_leads ? "accepting new leads" : "not accepting new leads",
        ]).filter((value) => value.trim().length > 0);

        return {
          memberId: member.id,
          displayName: member.display_name,
          role: member.role_label ?? member.role,
          email: member.email,
          phone: null,
          specialties: specialties.length === 0 ? null : Array.from(new Set(specialties)).join(" / "),
          avatarUrl: member.avatar_url,
        };
      });
    },

    async findVisitorContext(params) {
      if (params.sessionToken === null) {
        return {
          isReturning: false,
          lastSeenAt: null,
          priorQualification: {},
          priorListingsAskedAbout: [],
          recentTranscript: [],
          promotedLead: null,
        } satisfies PublicListingChatVisitorContext;
      }

      const { data: sessions, error } = await untyped(supabase)
        .from("public_listing_sessions")
        .select("id, listing_id, qualification, promoted_lead_id, last_active_at, created_at")
        .eq("workspace_id", params.workspaceId)
        .eq("session_token", params.sessionToken)
        .order("last_active_at", { ascending: false })
        .limit(8)
        .returns<VisitorSessionContextRow[]>();

      if (error !== null) throwSupabaseError(error);
      const latest = sessions?.[0] ?? null;
      if (latest === null) {
        return {
          isReturning: false,
          lastSeenAt: null,
          priorQualification: {},
          priorListingsAskedAbout: [],
          recentTranscript: [],
          promotedLead: null,
        } satisfies PublicListingChatVisitorContext;
      }

      // Group sessions by listing so we can compute first/last touch
      // timestamps for the cross-listing timeline rendered in the
      // buyer-portal drawer.
      const sessionsByListing = new Map<string, { firstAskedAt: string; lastAskedAt: string }>();
      for (const row of sessions ?? []) {
        const existing = sessionsByListing.get(row.listing_id);
        if (existing === undefined) {
          sessionsByListing.set(row.listing_id, {
            firstAskedAt: row.created_at,
            lastAskedAt: row.last_active_at,
          });
        } else {
          if (Date.parse(row.created_at) < Date.parse(existing.firstAskedAt)) existing.firstAskedAt = row.created_at;
          if (Date.parse(row.last_active_at) > Date.parse(existing.lastAskedAt)) existing.lastAskedAt = row.last_active_at;
        }
      }
      const listingIds = Array.from(sessionsByListing.keys()).slice(0, 6);
      const listingLookups = await Promise.all(listingIds.map(async (listingId) => {
        const { data } = await supabase
          .from("listing_facts")
          .select("id, address")
          .eq("workspace_id", params.workspaceId)
          .eq("id", listingId)
          .maybeSingle<{ id: string; address: string }>();
        if (data === null) return null;
        const ts = sessionsByListing.get(listingId) ?? null;
        return {
          id: data.id,
          address: data.address,
          firstAskedAt: ts?.firstAskedAt ?? null,
          lastAskedAt: ts?.lastAskedAt ?? null,
        };
      }));

      const { data: turns, error: turnsError } = await untyped(supabase)
        .from("public_listing_session_turns")
        .select("actor, body")
        .eq("session_id", latest.id)
        .order("occurred_at", { ascending: false })
        .limit(6)
        .returns<SessionTurnRow[]>();

      if (turnsError !== null) throwSupabaseError(turnsError);

      let promotedLead: { id: string; fullName: string | null; assignedAgentId: string | null } | null = null;
      if (latest.promoted_lead_id !== null) {
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id, full_name, assigned_agent_id")
          .eq("workspace_id", params.workspaceId)
          .eq("id", latest.promoted_lead_id)
          .maybeSingle<LeadIdentityRow>();
        if (leadError !== null) throwSupabaseError(leadError);
        promotedLead = lead === null ? null : {
          id: lead.id,
          fullName: lead.full_name,
          assignedAgentId: lead.assigned_agent_id,
        };
      }

      return {
        isReturning: true,
        lastSeenAt: latest.last_active_at,
        priorQualification: qualificationFromJson(latest.qualification),
        priorListingsAskedAbout: listingLookups
          .filter((row): row is { id: string; address: string; firstAskedAt: string | null; lastAskedAt: string | null } => row !== null),
        recentTranscript: (turns ?? []).slice().reverse().map((turn) => ({
          actor: turn.actor,
          body: turn.body,
          occurredAt: turn.occurred_at,
        })),
        promotedLead,
      } satisfies PublicListingChatVisitorContext;
    },

    async findListingMemory(params) {
      const { data, error } = await untyped(supabase)
        .from("listing_memory")
        .select("id, workspace_id, listing_id, kind, visibility, prompt, content, source, display_order, created_by_member_id, created_at, updated_at")
        .eq("workspace_id", params.workspaceId)
        .eq("listing_id", params.listingId)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true })
        .returns<ListingMemoryRow[]>();

      if (error !== null) {
        throwSupabaseError(error);
      }

      return (data ?? []).map<ListingMemory>((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        listingId: row.listing_id,
        kind: row.kind,
        visibility: row.visibility,
        prompt: row.prompt,
        content: row.content,
        source: row.source,
        displayOrder: row.display_order,
        createdByMemberId: row.created_by_member_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },

    async findSessionByToken(params) {
      const { data, error } = await untyped(supabase)
        .from("public_listing_sessions")
        .select("id, session_token, qualification, promoted_lead_id")
        .eq("session_token", params.sessionToken)
        .eq("workspace_id", params.workspaceId)
        .eq("listing_id", params.listingId)
        .maybeSingle<SessionRow>();

      if (error !== null) {
        throwSupabaseError(error);
      }

      return data === null
        ? null
        : {
            id: data.id,
            sessionToken: data.session_token,
            qualification: qualificationFromJson(data.qualification),
            promotedLeadId: data.promoted_lead_id,
          } satisfies PublicListingChatSession;
    },

    async createSession(params) {
      const { data, error } = await untyped(supabase)
        .from("public_listing_sessions")
        .insert({
          workspace_id: params.workspaceId,
          listing_id: params.listingId,
          session_token: params.sessionToken,
          qualification: {} as Json,
          ip_hash: params.ipHash,
          user_agent: params.userAgent,
          last_active_at: params.createdAt,
          created_at: params.createdAt,
        })
        .select("id, session_token, qualification, promoted_lead_id")
        .single<SessionRow>();

      if (error !== null) {
        throwSupabaseError(error);
      }

      return {
        id: data.id,
        sessionToken: data.session_token,
        qualification: qualificationFromJson(data.qualification),
        promotedLeadId: data.promoted_lead_id,
      };
    },

    async findRecentTurns(params) {
      const { data, error } = await untyped(supabase)
        .from("public_listing_session_turns")
        .select("actor, body, occurred_at")
        .eq("session_id", params.sessionId)
        .order("occurred_at", { ascending: true })
        .limit(params.limit)
        .returns<SessionTurnRow[]>();

      if (error !== null) {
        throwSupabaseError(error);
      }

      return (data ?? []).map<PublicListingChatSessionTurn>((row) => ({
        actor: row.actor,
        body: row.body,
        occurredAt: row.occurred_at,
      }));
    },

    async appendTurn(params) {
      const { error } = await untyped(supabase)
        .from("public_listing_session_turns")
        .insert({
          session_id: params.sessionId,
          actor: params.actor,
          body: params.body,
          state_patch: params.statePatch === null ? null : (params.statePatch as Json),
          next_action: params.nextAction,
          confidence: params.confidence ?? null,
          missing_fields: params.missingFields ?? [],
          safety_flags: params.safetyFlags ?? [],
          handoff_brief: params.handoffBrief ?? null,
          document_update: params.documentUpdate ?? null,
          tool_calls: params.toolCalls === undefined ? [] : (params.toolCalls as unknown as Json),
          occurred_at: params.occurredAt,
        });

      if (error !== null) {
        throwSupabaseError(error);
      }
    },

    async updateSessionQualification(params) {
      const { error } = await untyped(supabase)
        .from("public_listing_sessions")
        .update({
          qualification: params.qualification as unknown as Json,
          last_active_at: params.lastActiveAt,
        })
        .eq("id", params.sessionId);

      if (error !== null) {
        throwSupabaseError(error);
      }
    },

    async linkSessionLead(params) {
      const { error } = await untyped(supabase)
        .from("public_listing_sessions")
        .update({
          promoted_lead_id: params.leadId,
          promoted_at: params.promotedAt,
        })
        .eq("id", params.sessionId);

      if (error !== null) {
        throwSupabaseError(error);
      }
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
          throwSupabaseError(emailError);
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
        throwSupabaseError(phoneError);
      }

      return phoneMatch === null
        ? null
        : {
            id: phoneMatch.id,
            assignedAgentId: phoneMatch.assigned_agent_id,
          };
    },

    async insertLead(params) {
      const leadDocument = leadDocumentFromPublicChat({
        values: params.values,
        occurredAt: params.createdAt,
      });
      const { data, error } = await supabase
        .from("leads")
        .insert([{
          workspace_id: params.workspaceId,
          full_name: params.values.fullName,
          email: params.values.email,
          phone: params.values.phone,
          lead_type: params.values.leadType === "unknown" ? "buyer" : params.values.leadType,
          intent: params.values.leadIntent === "unknown" ? "medium" : params.values.leadIntent,
          source_channel: "public_listing_chat",
          financing_status: params.values.financingStatus,
          timeline: params.values.timeline,
          budget_min: params.values.budget,
          budget_max: null,
          target_area: params.values.targetArea,
          qualification_summary: params.values.documentUpdate.length > 0 ? params.values.documentUpdate : null,
          lead_document: leadDocument.length > 0 ? leadDocument : "",
          lead_document_updated_at: leadDocument.length > 0 ? params.createdAt : null,
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
        throwSupabaseError(error);
      }

      return {
        id: data.id,
        assignedAgentId: data.assigned_agent_id,
      };
    },

    async updateLead(params) {
      const { data: existingLead, error: existingLeadError } = await untyped(supabase)
        .from("leads")
        .select("lead_document")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<LeadDocumentRow>();

      if (existingLeadError !== null) {
        throwSupabaseError(existingLeadError);
      }

      const leadDocument = leadDocumentFromPublicChat({
        existing: existingLead?.lead_document ?? null,
        values: params.values,
        occurredAt: params.updatedAt,
      });
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
          lead_document: leadDocument,
          lead_document_updated_at: leadDocument.length > 0 ? params.updatedAt : null,
          status: leadStatus(params.values),
          score: params.values.score,
          last_message_at: params.updatedAt,
          updated_at: params.updatedAt,
        })
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId);

      if (error !== null) {
        throwSupabaseError(error);
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
        throwSupabaseError(error);
      }
    },

    async insertCMARequest(params) {
      const description = [
        `Harwick-qualified seller requested a CMA for ${params.sellerPropertyAddress}.`,
        params.sellerMotivation === null ? null : `Motivation: ${params.sellerMotivation}`,
        params.sellerTimeline === null ? null : `Timeline: ${params.sellerTimeline}`,
        params.sellerCondition === null ? null : `Condition: ${params.sellerCondition}`,
        params.sellerPriceExpectation === null ? null : `Price expectation: ${params.sellerPriceExpectation}`,
      ].filter((line): line is string => line !== null && line.trim().length > 0).join("\n");

      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          listing_id: null,
          task_type: "call_back",
          status: "open",
          priority: "high",
          title: `CMA request: ${params.sellerPropertyAddress}`,
          description,
          requested_start_at: null,
          requested_end_at: null,
          due_at: null,
          assigned_member_id: null,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        })
        .select("id")
        .single<{ id: string }>();

      if (error !== null) throwSupabaseError(error);
      return data.id;
    },

    async insertCallbackTask(params) {
      const priority = params.urgency === "now" ? "high" : "normal";
      const dueAt = params.urgency === "this_week"
        ? new Date(Date.parse(params.createdAt) + 7 * 24 * 60 * 60 * 1000).toISOString()
        : params.createdAt;

      const { data, error } = await supabase
        .from("lead_tasks")
        .insert({
          workspace_id: params.workspaceId,
          lead_id: params.leadId,
          listing_id: params.listingId,
          task_type: "call_back",
          status: "open",
          priority,
          title: params.urgency === "now" ? "Call public listing lead now" : "Call public listing lead",
          description: params.reason,
          requested_start_at: null,
          requested_end_at: null,
          due_at: dueAt,
          assigned_member_id: params.assignedMemberId,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        })
        .select("id")
        .single<{ id: string }>();

      if (error !== null) throwSupabaseError(error);
      return data.id;
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
          requested_start_at: params.requestedStartAt ?? null,
          requested_end_at: params.requestedEndAt ?? null,
          due_at: null,
          assigned_member_id: params.assignedMemberId,
          created_at: params.createdAt,
          updated_at: params.createdAt,
        })
        .select("id")
        .single<{ id: string }>();

      if (error !== null) {
        throwSupabaseError(error);
      }

      return data.id;
    },

    async findShowingsForVisitor(params) {
      const { data, error } = await supabase
        .from("lead_tasks")
        .select("id, listing_id, requested_start_at, requested_end_at, status, assigned_member_id")
        .eq("workspace_id", params.workspaceId)
        .eq("lead_id", params.leadId)
        .eq("task_type", "request_showing_approval")
        .order("created_at", { ascending: false })
        .limit(10)
        .returns<ShowingTaskRow[]>();

      if (error !== null) throwSupabaseError(error);
      const rows = data ?? [];
      if (rows.length === 0) return [];

      // Two side lookups: listing addresses + agent member identities.
      // Done in parallel to keep the GET endpoint snappy. The listing
      // join can't be embedded as a Postgres rel because listing_facts
      // doesn't have a FK to lead_tasks here.
      const listingIds = Array.from(new Set(rows
        .map((r) => r.listing_id)
        .filter((id): id is string => id !== null)));
      const memberIds = Array.from(new Set(rows
        .map((r) => r.assigned_member_id)
        .filter((id): id is string => id !== null)));

      const [listingsRes, membersRes] = await Promise.all([
        listingIds.length === 0
          ? Promise.resolve({ data: [] as Array<{ id: string; address: string }>, error: null })
          : supabase
              .from("listing_facts")
              .select("id, address")
              .eq("workspace_id", params.workspaceId)
              .in("id", listingIds)
              .returns<Array<{ id: string; address: string }>>(),
        memberIds.length === 0
          ? Promise.resolve({ data: [] as WorkspaceMemberRow[], error: null })
          : supabase
              .from("workspace_members")
              .select("id, display_name, role, role_label, email, avatar_url")
              .eq("workspace_id", params.workspaceId)
              .in("id", memberIds)
              .returns<WorkspaceMemberRow[]>(),
      ]);

      if (listingsRes.error !== null) throwSupabaseError(listingsRes.error);
      if (membersRes.error !== null) throwSupabaseError(membersRes.error);

      const listingMap = new Map((listingsRes.data ?? []).map((row) => [row.id, row.address]));
      const memberMap = new Map((membersRes.data ?? []).map((row) => [row.id, row]));

      const VISITOR_STATUS = (status: string): "pending" | "approved" | "declined" | "completed" | "cancelled" => {
        const s = status.toLowerCase();
        if (s === "open" || s === "pending" || s === "awaiting_approval") return "pending";
        if (s === "approved" || s === "confirmed" || s === "scheduled") return "approved";
        if (s === "declined" || s === "rejected") return "declined";
        if (s === "completed" || s === "done") return "completed";
        if (s === "cancelled" || s === "canceled") return "cancelled";
        return "pending";
      };

      return rows
        .filter((row) => row.listing_id !== null)
        .map((row) => {
          const address = listingMap.get(row.listing_id as string) ?? "";
          const member = row.assigned_member_id === null ? null : memberMap.get(row.assigned_member_id) ?? null;
          return {
            taskId: row.id,
            listingId: row.listing_id as string,
            listingAddress: address,
            requestedStartAt: row.requested_start_at,
            requestedEndAt: row.requested_end_at,
            status: VISITOR_STATUS(row.status),
            assignedAgent: member === null ? null : {
              memberId: member.id,
              displayName: member.display_name,
              role: member.role_label ?? member.role,
              email: member.email,
              phone: null,
              specialties: null,
              avatarUrl: member.avatar_url,
            },
          };
        });
    },

    async findAgentByMemberId(params) {
      const { data, error } = await supabase
        .from("workspace_members")
        .select("id, display_name, role, role_label, email, avatar_url")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.memberId)
        .maybeSingle<WorkspaceMemberRow>();

      if (error !== null) throwSupabaseError(error);
      if (data === null) return null;
      return {
        memberId: data.id,
        displayName: data.display_name,
        role: data.role_label ?? data.role,
        email: data.email,
        phone: null,
        specialties: null,
        avatarUrl: data.avatar_url,
      };
    },
  };
}
