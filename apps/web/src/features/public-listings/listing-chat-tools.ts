/**
 * Public-listing-chat tool registry. Mirrors the operator-side
 * `harwick-chat/tools.ts` deps-injection pattern. Tools come back as a
 * plain `Record<string, Tool>` that `streamText` consumes; the AI SDK
 * UIMessage protocol surfaces each tool call to the client as a
 * `tool-<name>` part the chat UI can render.
 *
 * Two tool flavors:
 *   - Silent (`note_qualification`, `search_workspace_listings`,
 *     `get_listing_location`, `lookup_area_info`): the model gathers
 *     info. The UI shows nothing.
 *   - Surface (`surface_listing`, `surface_team_member`,
 *     `propose_showing_window`, `request_agent_callback`,
 *     `request_cma`, `capture_lead`): the model emits a card the
 *     visitor sees inline, OR creates a real workspace record.
 *
 * Each side-effect tool calls back into the repository so the route's
 * `onFinish` block can persist qualification updates + lead promotion
 * AFTER the stream completes. No regex deriver — the model is the
 * source of truth for what was learned this turn.
 */

import { tool } from "ai";
import { z } from "zod";

import type {
  PublicListingChatFunnel,
  PublicListingChatQualification,
  PublicListingPortalAgent,
  PublicListingPortalTeamMember,
} from "@realty-ops/core";

import { lookupAreaInfo } from "./area-lookup";
import type { ListingChatGateJudge } from "./listing-chat-gate-judge";
import type {
  PublicListingChatLeadCapture,
  PublicListingChatListing,
  PublicListingChatRepository,
} from "./public-listing-chat";

/* ─────────  Card payload types — also rendered by the client UI  ───────── */

export type ListingCardPayload = {
  kind: "listing_card";
  listingId: string;
  address: string;
  price: number | null;
  previousPrice: number | null;
  priceCutAmount: number | null;
  beds: number | null;
  baths: number | null;
  status: string | null;
  photoUrl: string | null;
  neighborhood: string | null;
  reason: string;
};

export type TeamMemberCardPayload = {
  kind: "team_member_card";
  memberId: string;
  displayName: string;
  role: string;
  specialties: string | null;
  reason: string;
};

export type ShowingProposalCardPayload = {
  kind: "showing_proposal_card";
  taskId: string;
  leadId: string;
  assignedMemberName: string | null;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  status: "pending_approval";
};

export type CallbackCardPayload = {
  kind: "callback_card";
  taskId: string;
  leadId: string;
  assignedMemberName: string | null;
  urgency: "now" | "today" | "this_week";
  reason: string;
};

export type CMACardPayload = {
  kind: "cma_card";
  taskId: string;
  leadId: string;
  sellerPropertyAddress: string;
};

export type LeadCaptureCardPayload = {
  kind: "lead_capture_card";
  leadId: string;
  status: "created" | "updated";
  intent: "question" | "showing";
  nextStep: string;
};

export type AreaFactsCardPayload = {
  kind: "area_facts_card";
  // Human label above the cards row — "Nearby middle schools",
  // "Top fiber providers", "Off-leash parks", etc. Model writes this.
  title: string;
  // 1 short clause the model puts above the cards as context.
  // E.g. "since you mentioned 3 kids middle school". Keeps the
  // proactive surface feeling reasoned, not algorithmic.
  reason: string | null;
  items: Array<{
    name: string;
    subtitle: string | null;
    summary: string;
    imageUrl: string | null;
    sourceUrl: string;
    score: string | null;
  }>;
};

/* ─────────  Shared deps + collector  ───────── */

/**
 * Mutable per-turn collector. The route's onFinish reads this AFTER
 * the stream completes to know what to persist (qualification delta,
 * captured lead). Tools mutate it inside their execute callbacks.
 * Not exported back to the model — purely server-side bookkeeping.
 */
export type ListingChatTurnState = {
  qualificationDelta: Partial<PublicListingChatQualification>;
  capturedLead: { leadId: string; intent: "question" | "showing"; status: "created" | "updated" } | null;
};

export type ListingChatToolDeps = {
  repository: PublicListingChatRepository;
  workspaceId: string;
  workspaceName: string;
  listing: PublicListingChatListing;
  priorQualification: PublicListingChatQualification;
  team: readonly PublicListingPortalTeamMember[];
  assignedAgent: PublicListingPortalAgent | null;
  searchApiKey: string | undefined;
  occurredAt: string;
  latestVisitorText?: string | undefined;
  // Optional small-model gate judge — when supplied, replaces the cheap
  // length-floor check on `propose_showing_window` / `request_agent_callback` /
  // `capture_lead` payloads with a semantic actionability check. Times out
  // and fails open (length floor still applies).
  gateJudge?: ListingChatGateJudge | undefined;
  // Mutated by tool executes; read by onFinish to know what to persist.
  state: ListingChatTurnState;
};

/* ─────────  Helpers  ───────── */

const FUNNEL_VALUES = ["buyer", "seller", "investor", "renter", "browser", "unknown"] as const;
const INTENT_VALUES = ["high", "medium", "low", "spam", "unknown"] as const;
const FINANCING_VALUES = ["preapproved", "cash", "needs_lender", "unknown"] as const;
const PREAPPROVAL_VALUES = ["preapproved", "pending", "none", "unknown"] as const;
const URGENCY_VALUES = ["now", "today", "this_week"] as const;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 7) return false;
  if (/^1?555/.test(digits) || /^1?\d{3}555/.test(digits)) return false;
  const lower = value.toLowerCase().trim();
  return lower !== "unknown" && lower !== "n/a" && lower !== "na" && lower !== "none" && !lower.includes("unknown");
}

function readPhotoUrl(listing: PublicListingChatListing): string | null {
  const raw = listing.rawFacts;
  if (typeof raw["photoUrl"] === "string" && raw["photoUrl"].length > 0) return raw["photoUrl"];
  if (Array.isArray(raw["mediaUrls"]) && raw["mediaUrls"].length > 0 && typeof raw["mediaUrls"][0] === "string") return raw["mediaUrls"][0];
  return null;
}

function readNeighborhood(listing: PublicListingChatListing): string | null {
  const raw = listing.rawFacts;
  return typeof raw["neighborhood"] === "string" && raw["neighborhood"].length > 0 ? raw["neighborhood"] : null;
}

function readNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hasUsableName(value: unknown): value is string {
  return typeof value === "string" && value.trim().length >= 2;
}

function hasUsableBudget(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Cheap fast-fail floor. The LLM judge handles semantic actionability;
 * this just rejects obviously-empty / single-word payloads in microseconds
 * so we don't burn a small-model call on garbage.
 */
function failsLengthFloor(value: string, minLength: number): boolean {
  return value.trim().length < minLength;
}

function readCentralDateParts(iso: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day") };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function centralIsoWithOffset(date: Date, hour: number, minute: number): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T${pad2(hour)}:${pad2(minute)}:00-05:00`;
}

function addDaysUtcDate(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function parseWeekdayTimeWindow(text: string | undefined, occurredAt: string): { startAt: string; endAt: string } | null {
  if (text === undefined) return null;
  const lower = text.toLowerCase();
  const weekdayIndex = WEEKDAYS.findIndex((day) => lower.includes(day));
  if (weekdayIndex < 0) return null;
  const timeMatch = lower.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)?\b/);
  if (timeMatch === null) return null;
  let hour = Number(timeMatch[1]);
  const minute = timeMatch[2] === undefined ? 0 : Number(timeMatch[2]);
  const meridiem = timeMatch[3];
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (meridiem === undefined && hour >= 1 && hour <= 7) hour += 12;

  const central = readCentralDateParts(occurredAt);
  const today = new Date(Date.UTC(central.year, central.month - 1, central.day));
  const todayDow = today.getUTCDay();
  let daysUntil = weekdayIndex - todayDow;
  if (daysUntil <= 0) daysUntil += 7;
  const targetDate = addDaysUtcDate(today, daysUntil);
  const endHour = hour + 1;
  return {
    startAt: centralIsoWithOffset(targetDate, hour, minute),
    endAt: centralIsoWithOffset(targetDate, endHour, minute),
  };
}

function buildLeadCapture(input: {
  funnelType: PublicListingChatFunnel;
  intent: "question" | "showing";
  intentTier: "high" | "medium" | "low" | "spam" | "unknown";
  fullName: string | null;
  email: string | null;
  phone: string;
  qualification: PublicListingChatQualification;
  conversationSummary: string;
}): PublicListingChatLeadCapture {
  return {
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    message: input.conversationSummary,
    intent: input.intent,
    leadType: input.funnelType === "seller" || input.funnelType === "investor" || input.funnelType === "renter"
      ? input.funnelType
      : input.funnelType === "buyer" ? "buyer" : "unknown",
    leadIntent: input.intentTier,
    timeline: input.qualification.timeline ?? null,
    budget: typeof input.qualification.budget === "string" ? parseBudgetToNumber(input.qualification.budget) : null,
    targetArea: input.qualification.targetArea ?? null,
    propertyType: input.qualification.propertyType ?? null,
    financingStatus: input.qualification.financingStatus ?? "unknown",
    score: input.intent === "showing" ? 75 : input.intentTier === "high" ? 70 : 50,
    documentUpdate: input.conversationSummary,
  };
}

function parseBudgetToNumber(value: string): number | null {
  const normalized = value.toLowerCase().replace(/,/g, "");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (match === null) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) return null;
  const multiplier = normalized.includes("m") ? 1_000_000 : normalized.includes("k") ? 1_000 : 1;
  return Math.round(parsed * multiplier);
}

function summarizeListingForTool(listing: PublicListingChatListing) {
  return {
    id: listing.id,
    address: listing.address,
    price: listing.price,
    previousPrice: readNumber(listing.rawFacts, "previousPrice"),
    priceCutAmount: readNumber(listing.rawFacts, "priceCutAmount"),
    beds: listing.beds,
    baths: listing.baths,
    status: listing.status,
    neighborhood: typeof listing.rawFacts["neighborhood"] === "string" ? listing.rawFacts["neighborhood"] : null,
  };
}

/* ─────────  Tool factory  ───────── */

export function buildListingChatTools(deps: ListingChatToolDeps) {
  return {
    /**
     * Self-update state patch. Model calls this after EVERY visitor turn
     * with real info. Pass only fields that changed. Pure mutation of
     * `deps.state.qualificationDelta` — no DB write here; the route's
     * onFinish merges into session.qualification once.
     */
    note_qualification: tool({
      description: "Record what the visitor literally told you this turn. Pass only fields they actually shared (do NOT pre-fill from listing context). Call this on EVERY meaningful visitor turn. Array fields (lifeContext, preferredShowingTimes, vibeNotes) are APPENDED across turns — pass only the NEW notes from this turn.",
      inputSchema: z.object({
        funnelType: z.enum(FUNNEL_VALUES).nullable().describe("Buyer / seller / investor / renter / browser. Set once you can tell."),
        name: z.string().min(1).max(160).nullable().describe("First name only is fine — capture immediately if volunteered."),
        phone: z.string().min(7).max(40).nullable().describe("Visitor's phone. Real number only — never placeholder."),
        email: z.string().email().max(160).nullable(),
        targetArea: z.string().min(1).max(160).nullable().describe("Neighborhood / city the buyer wants. ONLY if they said it."),
        budget: z.string().min(1).max(40).nullable().describe("Buyer's stated budget like '800k' or '1.2M'. NEVER the listing price."),
        timeline: z.string().min(1).max(160).nullable().describe("Buyer's stated timeline like 'before fall' or '6 months'."),
        propertyType: z.string().min(1).max(80).nullable(),
        financingStatus: z.enum(FINANCING_VALUES).nullable(),
        preApprovalStatus: z.enum(PREAPPROVAL_VALUES).nullable(),
        hasBuyerRep: z.boolean().nullable(),
        intentTier: z.enum(INTENT_VALUES).nullable().describe("How serious. Showing-request or named time = high. Curiosity = medium. Just-browsing = low."),
        lifeContext: z.array(z.string().min(3).max(240)).max(4).nullable().describe("APPEND-ONLY. Atomic life-event notes the buyer shared this turn (kids, marriage, job move, family timing, school stage, health). Each entry is one short sentence. Examples: '3 kids entering middle school', 'getting married June 2026', 'company relocating to Austin Sept 1', 'expecting first baby in spring'. Pass null if nothing life-related this turn."),
        preferredShowingTimes: z.array(z.string().min(3).max(120)).max(3).nullable().describe("APPEND-ONLY. Speculative show-time hints the buyer dropped even pre-booking. Examples: 'Saturday mornings', 'evenings after 6', 'weekdays only'. Pass null if no time preference mentioned."),
        vibeNotes: z.array(z.string().min(3).max(200)).max(2).nullable().describe("APPEND-ONLY. Short emotional / style observations about the buyer. Examples: 'urgent — lease ends Aug 1', 'analytical, asks lots of payment questions', 'cautious, comparing many options', 'excited, decisive'. Pass null if nothing notable."),
        learned: z.string().min(1).max(280).describe("One-line note about what was just learned this turn. Auto-appended to knownFacts for the drawer."),
      }),
      execute: async (input) => {
        const delta = deps.state.qualificationDelta;
        if (input.funnelType !== null) delta.funnelType = input.funnelType;
        if (input.name !== null) delta.name = input.name;
        if (input.phone !== null && isValidPhone(input.phone)) delta.phone = input.phone;
        if (input.email !== null) delta.email = input.email;
        if (input.targetArea !== null) delta.targetArea = input.targetArea;
        if (input.budget !== null) delta.budget = input.budget;
        if (input.timeline !== null) delta.timeline = input.timeline;
        if (input.propertyType !== null) delta.propertyType = input.propertyType;
        if (input.financingStatus !== null) delta.financingStatus = input.financingStatus;
        if (input.preApprovalStatus !== null) delta.preApprovalStatus = input.preApprovalStatus;
        if (input.hasBuyerRep !== null) delta.hasBuyerRep = input.hasBuyerRep;
        if (input.intentTier !== null) delta.intent = input.intentTier;
        if (input.funnelType === "buyer" || input.funnelType === "seller" || input.funnelType === "investor" || input.funnelType === "renter") {
          delta.leadType = input.funnelType;
        }
        // Append-only fields. Stash on the delta; route's onFinish does
        // the actual concat+dedupe against the existing session row.
        if (input.lifeContext !== null && input.lifeContext.length > 0) {
          delta.lifeContext = [...(delta.lifeContext ?? []), ...input.lifeContext];
        }
        if (input.preferredShowingTimes !== null && input.preferredShowingTimes.length > 0) {
          delta.preferredShowingTimes = [...(delta.preferredShowingTimes ?? []), ...input.preferredShowingTimes];
        }
        if (input.vibeNotes !== null && input.vibeNotes.length > 0) {
          delta.vibeNotes = [...(delta.vibeNotes ?? []), ...input.vibeNotes];
        }
        // Always append the `learned` one-liner to knownFacts — this is
        // what makes the drawer feel rich without burdening the model
        // with a separate explicit "remember this" call.
        delta.knownFacts = [...(delta.knownFacts ?? []), input.learned];
        return { recorded: true, learned: input.learned };
      },
    }),

    /**
     * Updates the visitor's one-line synthesized headline rendered as
     * the drawer hero. Overwrites — call when something material about
     * the visitor's situation changes (new intent tier, big budget
     * jump, name learned, urgency shift). Format: "First name · what
     * they want · constraint" — e.g. "Clinton · serious Coral Gables
     * buyer under $2.5M, before fall" or "Martha · just browsing, kids
     * in school 2 years out".
     */
    set_visitor_headline: tool({
      description: "Set the visitor's one-line memory-document headline rendered as the hero in their profile drawer. Call when something MATERIAL about who-they-are changes (name learned, intent shifted, big new constraint). Overwrites prior headline. Format: 'First name · what they want · constraint'. Keep under 140 chars. Use plain prose — no markdown.",
      inputSchema: z.object({
        headline: z.string().trim().min(8).max(240).describe("Single sentence. Example: 'Clinton · serious Coral Gables buyer under $2.5M, fall move, 3 kids middle-school'. No markdown."),
      }),
      execute: async ({ headline }) => {
        deps.state.qualificationDelta.headline = headline;
        return { recorded: true };
      },
    }),

    /**
     * Silent inventory search. Returns rows the model can then choose to
     * `surface_listing` for cards. Discovery-first guard inline: refuses
     * with a clear next-action if criteria are too sparse (unless the
     * current listing is unavailable, in which case sparse search is OK).
     */
    search_workspace_listings: tool({
      description: "Find other active listings in this workspace. Use when buyer asks for alternatives, or when THIS listing is sold/pending and they want to see what else exists. After this returns, call `surface_listing` for each one worth showing (max 3) — DO NOT paraphrase the list in prose.",
      inputSchema: z.object({
        minPrice: z.number().int().min(0).nullable(),
        maxPrice: z.number().int().min(0).nullable(),
        minBeds: z.number().int().min(0).max(20).nullable(),
        areaContains: z.string().min(1).max(80).nullable().describe("Neighborhood / city / area substring filter."),
        propertyType: z.string().min(1).max(40).nullable(),
        limit: z.number().int().min(1).max(6).default(4),
      }),
      execute: async (input) => {
        // Discovery-first gate. Honor the model's intent if it's
        // searching from sparse criteria specifically because THIS
        // listing is unavailable (sold/pending/etc).
        const liveQual = { ...deps.priorQualification, ...deps.state.qualificationDelta };
        const isUnavailable = (deps.listing.status ?? "").toLowerCase().match(/sold|pending|contract|withdrawn|expired/) !== null;
        const explicitCriteria = [input.minPrice, input.maxPrice, input.minBeds, input.areaContains, input.propertyType].filter((v) => v !== null).length;
        const carriedCriteria = [liveQual.budget, liveQual.targetArea, liveQual.propertyType].filter((v) => v !== null && v !== undefined).length;
        if (explicitCriteria === 0 && carriedCriteria < 2 && !isUnavailable) {
          return {
            error: "discovery_required",
            message: "Ask one discovery question first to get ≥2 criteria (area + budget / beds + timeline). Then search.",
          };
        }
        const criteria = {
          minPrice: input.minPrice,
          maxPrice: input.maxPrice,
          minBeds: input.minBeds,
          areaContains: input.areaContains,
          propertyType: input.propertyType,
        };
        const rows = await deps.repository.findOtherListings({
          workspaceId: deps.workspaceId,
          excludeListingId: deps.listing.id,
          criteria,
          limit: input.limit,
        });
        if (rows.length === 0 && explicitCriteria > 0) {
          const fallbackRows = await deps.repository.findOtherListings({
            workspaceId: deps.workspaceId,
            excludeListingId: deps.listing.id,
            criteria: {
              minPrice: null,
              maxPrice: null,
              minBeds: null,
              areaContains: null,
              propertyType: null,
            },
            limit: input.limit,
          });
          return {
            count: 0,
            listings: [],
            broadened: true,
            broadenedCount: fallbackRows.length,
            broadenedListings: fallbackRows.map(summarizeListingForTool),
            message: fallbackRows.length === 0
              ? "No active listings exist in this workspace after dropping all filters."
              : "No listings matched those filters, but active inventory exists after dropping filters. Surface these broader options before saying inventory is empty.",
          };
        }
        return {
          count: rows.length,
          listings: rows.map(summarizeListingForTool),
          broadened: false,
        };
      },
    }),

    /**
     * Card-drop. Renders an inline `<ListingCard>` in the chat — the
     * visitor sees the address, price, beds/baths, photo, and can tap
     * through. Model calls this AFTER `search_workspace_listings`.
     */
    surface_listing: tool({
      description: "Drop a listing card inline in the chat. Use AFTER `search_workspace_listings` for each result worth showing (max 3 per turn). Don't also list the same address in your reply text — the card carries that.",
      inputSchema: z.object({
        listingId: z.string().uuid(),
        reason: z.string().min(1).max(160).describe("Short phrase about why this matches (e.g. 'similar beds in your range')."),
      }),
      execute: async ({ listingId, reason }): Promise<ListingCardPayload> => {
        const listing = await deps.repository.findListing({
          workspaceId: deps.workspaceId,
          listingId,
        });
        if (listing === null) {
          return {
            kind: "listing_card",
            listingId,
            address: "Listing unavailable",
            price: null,
            previousPrice: null,
            priceCutAmount: null,
            beds: null,
            baths: null,
            status: "missing",
            photoUrl: null,
            neighborhood: null,
            reason,
          };
        }
        return {
          kind: "listing_card",
          listingId: listing.id,
          address: listing.address,
          price: listing.price,
          previousPrice: readNumber(listing.rawFacts, "previousPrice"),
          priceCutAmount: readNumber(listing.rawFacts, "priceCutAmount"),
          beds: listing.beds,
          baths: listing.baths,
          status: listing.status,
          photoUrl: readPhotoUrl(listing),
          neighborhood: readNeighborhood(listing),
          reason,
        };
      },
    }),

    /**
     * Card-drop. Renders an inline team-member card. Use when introducing
     * an agent (e.g. when proposing a showing or routing a callback).
     */
    surface_team_member: tool({
      description: "Drop a team-member card inline in the chat. Use when introducing the agent the buyer would be working with.",
      inputSchema: z.object({
        memberId: z.string().uuid(),
        reason: z.string().min(1).max(160),
      }),
      execute: async ({ memberId, reason }): Promise<TeamMemberCardPayload> => {
        const member = deps.team.find((m) => m.memberId === memberId);
        if (member === undefined) {
          return {
            kind: "team_member_card",
            memberId,
            displayName: "Team member unavailable",
            role: "agent",
            specialties: null,
            reason,
          };
        }
        return {
          kind: "team_member_card",
          memberId: member.memberId,
          displayName: member.displayName,
          role: member.role,
          specialties: member.specialties,
          reason,
        };
      },
    }),

    /**
     * Returns authoritative city/state/zip for the listing in view.
     * Model is FORBIDDEN from inventing location from the neighborhood
     * field — call this when the buyer asks "where is this actually?".
     */
    get_listing_location: tool({
      description: "Returns the authoritative city/state/zip for THIS listing. Call this when the buyer asks where the listing is — never guess from the neighborhood field.",
      inputSchema: z.object({}),
      execute: async () => {
        const raw = deps.listing.rawFacts;
        const city = typeof raw["city"] === "string" ? raw["city"] : null;
        const state = typeof raw["state"] === "string" ? raw["state"] : null;
        const zip = typeof raw["postalCode"] === "string" ? raw["postalCode"] : typeof raw["zip"] === "string" ? raw["zip"] : null;
        const neighborhood = typeof raw["neighborhood"] === "string" ? raw["neighborhood"] : null;
        return {
          address: deps.listing.address,
          city,
          state,
          zip,
          neighborhood,
          knownPrecise: city !== null && state !== null,
        };
      },
    }),

    /**
     * Brave Search wrapper for area facts not pre-enriched on the
     * listing (specific schools by name, restaurants within X miles,
     * walkability of a sub-area).
     */
    lookup_area_info: tool({
      description: "Look up specific area info (schools, fiber/ISPs, parks, restaurants, walkability, HOA rules, demographics). CRITICAL: if the lookup returns 2+ named items (schools, providers, parks, etc), you MUST immediately call `surface_area_facts` next with the top 2-3 items as cards — NEVER list 2+ named items in prose. If only 1 item or pure prose answer, cite the source inline.",
      inputSchema: z.object({
        query: z.string().min(3).max(160),
      }),
      execute: async ({ query }) => {
        const raw = deps.listing.rawFacts;
        const contextLocation = [
          typeof raw["neighborhood"] === "string" ? raw["neighborhood"] : null,
          typeof raw["city"] === "string" ? raw["city"] : null,
          typeof raw["state"] === "string" ? raw["state"] : null,
        ].filter((v): v is string => v !== null).join(", ");
        return lookupAreaInfo({
          query,
          contextLocation,
          apiKey: deps.searchApiKey,
        });
      },
    }),

    /**
     * Drop 2-3 tappable cards summarizing area facts (schools, fiber
     * providers, parks, restaurants, gyms, etc). Companion to
     * `lookup_area_info` — when the lookup returns multiple items
     * (e.g. 3 nearby schools) OR when the visitor revealed life
     * context where a card row would help them more than prose
     * (e.g. "3 kids middle school" -> middle school cards;
     * "I'm a streamer" -> fiber ISP cards), use this instead of
     * writing the names in a paragraph. PROACTIVE surfacing is
     * encouraged when relevance is clear — see system prompt's
     * PROACTIVE SURFACING DOCTRINE.
     */
    surface_area_facts: tool({
      description: "Drop a row of 2-3 tappable cards summarizing area facts (schools, fiber, parks, restaurants, gyms, etc). Use AFTER lookup_area_info or PROACTIVELY when the buyer revealed life context that maps to a card row. Each card opens its sourceUrl in a new tab on tap. After calling this, your reply text MUST NOT list the same items in prose — short hook + question only.",
      inputSchema: z.object({
        title: z.string().min(3).max(80).describe("Human label above the row. Examples: 'Nearby middle schools', 'Top fiber providers in Sunterra', 'Off-leash parks within 10 min'."),
        reason: z.string().min(1).max(180).nullable().describe("ONE short clause explaining why this surfaced. Example: 'since you mentioned 3 kids middle school'. Null when surfaced in direct response to a question."),
        items: z.array(z.object({
          name: z.string().min(1).max(120),
          subtitle: z.string().min(1).max(100).nullable().describe("One short clause under the name. E.g. 'K-5, Fort Bend ISD' or 'fiber · 1 Gbps' or '4.5★ on Google'."),
          summary: z.string().min(1).max(280).describe("One sentence of substance. Cite source if applicable."),
          imageUrl: z.string().url().nullable(),
          sourceUrl: z.string().url(),
          score: z.string().min(1).max(20).nullable().describe("Rating/score chip — 'GreatSchools 9/10', '4.6★', 'A-', 'Gold tier', etc."),
        })).min(2).max(3),
      }),
      execute: async (input): Promise<AreaFactsCardPayload> => {
        return {
          kind: "area_facts_card",
          title: input.title,
          reason: input.reason,
          items: input.items,
        };
      },
    }),

    /**
     * Showing-window proposal — creates an APPROVAL TASK for the agent.
     * Model NEVER confirms a specific time — the response copy must
     * frame as "pinging [agent] to confirm".
     */
    propose_showing_window: tool({
      description: "Propose a specific showing time. Creates an APPROVAL TASK for the agent — NEVER confirms the time. Requires real phone, real name, and stated budget first; if any are missing this tool returns an error and you must ask for the missing qualifier instead of saying a showing was proposed.",
      inputSchema: z.object({
        requestedStartAt: z.string().datetime({ offset: true }).nullable().describe("ISO time the buyer wants — null if no specific window given."),
        requestedEndAt: z.string().datetime({ offset: true }).nullable(),
        preferredAgentMemberId: z.string().uuid().nullable(),
        contactPhone: z.string().min(7).max(40),
        contactName: z.string().min(1).max(160).nullable(),
        contactEmail: z.string().email().max(160).nullable(),
        notes: z.string().min(1).max(400).describe("Anything the agent needs to know — buyer context, special asks."),
      }),
      execute: async (input): Promise<ShowingProposalCardPayload | { error: string }> => {
        if (!isValidPhone(input.contactPhone)) {
          return { error: "Real phone number required before creating showing approval." };
        }
        const liveQual = { ...deps.priorQualification, ...deps.state.qualificationDelta };
        const contactName = input.contactName ?? (hasUsableName(liveQual.name) ? liveQual.name : null);
        if (!hasUsableName(contactName)) {
          return { error: "Name required before creating showing approval. Ask what to call them, then continue qualification." };
        }
        if (!hasUsableBudget(liveQual.budget)) {
          return { error: "Budget required before creating showing approval. Ask what price range they want to stay under before creating the task." };
        }
        if (failsLengthFloor(input.notes, 15)) {
          return { error: "Showing notes too thin — give the agent a concrete sentence of context (who's coming, what they care about, any constraint)." };
        }
        if (deps.gateJudge !== undefined) {
          const judgment = await deps.gateJudge({
            kind: "showing_notes",
            value: input.notes,
            qualificationContext: {
              name: contactName,
              budget: liveQual.budget,
              timeline: liveQual.timeline ?? null,
              hasBuyerRep: liveQual.hasBuyerRep ?? null,
              financingStatus: liveQual.financingStatus ?? null,
            },
          });
          if (!judgment.ok) {
            return { error: judgment.coaching };
          }
        }
        const parsedWindow = parseWeekdayTimeWindow(deps.latestVisitorText, deps.occurredAt);
        const requestedStartAt = parsedWindow?.startAt ?? input.requestedStartAt;
        const requestedEndAt = parsedWindow?.endAt ?? input.requestedEndAt;
        const values = buildLeadCapture({
          funnelType: liveQual.funnelType ?? "buyer",
          intent: "showing",
          intentTier: "high",
          fullName: contactName,
          email: input.contactEmail ?? liveQual.email ?? null,
          phone: input.contactPhone,
          qualification: liveQual,
          conversationSummary: input.notes,
        });
        const existing = await deps.repository.findExistingLead({
          workspaceId: deps.workspaceId,
          email: values.email,
          phone: values.phone,
        });
        const lead = existing === null
          ? await deps.repository.insertLead({
              workspaceId: deps.workspaceId,
              values,
              createdAt: deps.occurredAt,
            })
          : existing;
        if (existing !== null) {
          await deps.repository.updateLead({
            workspaceId: deps.workspaceId,
            leadId: existing.id,
            values,
            updatedAt: deps.occurredAt,
          });
        }
        const taskId = await deps.repository.insertShowingTask({
          workspaceId: deps.workspaceId,
          leadId: lead.id,
          listing: deps.listing,
          assignedMemberId: input.preferredAgentMemberId ?? deps.assignedAgent?.memberId ?? lead.assignedAgentId,
          values,
          requestedStartAt,
          requestedEndAt,
          createdAt: deps.occurredAt,
        });
        deps.state.capturedLead = { leadId: lead.id, intent: "showing", status: existing === null ? "created" : "updated" };
        const assignedMember = input.preferredAgentMemberId === null
          ? deps.assignedAgent
          : deps.team.find((m) => m.memberId === input.preferredAgentMemberId) ?? deps.assignedAgent;
        return {
          kind: "showing_proposal_card",
          taskId,
          leadId: lead.id,
          assignedMemberName: assignedMember?.displayName ?? null,
          requestedStartAt,
          requestedEndAt,
          status: "pending_approval",
        };
      },
    }),

    request_agent_callback: tool({
      description: "Queue a callback request for a named agent. Use when buyer wants a human call without a specific showing time. Requires real phone, real first name, and a specific reason naming who or what (NOT 'trusted lender network' — name the lender or agent role). If any is missing this tool returns an error and you must ask for the missing item before saying anyone was queued.",
      inputSchema: z.object({
        contactPhone: z.string().min(7).max(40),
        contactName: z.string().min(1).max(160).nullable(),
        reason: z.string().min(1).max(280).describe("What the agent should know before calling — concrete topic (e.g. 'first-time buyer wants lender intro for $625k cash + financed mix on Parkland Crossing'). Avoid vague phrases."),
        urgency: z.enum(URGENCY_VALUES),
        preferredAgentMemberId: z.string().uuid().nullable(),
      }),
      execute: async (input): Promise<CallbackCardPayload | { error: string }> => {
        if (!isValidPhone(input.contactPhone)) {
          return { error: "Real phone number required before queuing callback." };
        }
        const liveQual = { ...deps.priorQualification, ...deps.state.qualificationDelta };
        const contactName = input.contactName ?? (hasUsableName(liveQual.name) ? liveQual.name : null);
        if (!hasUsableName(contactName)) {
          return { error: "First name required before queuing callback. Ask what to call them, then queue the callback." };
        }
        if (failsLengthFloor(input.reason, 10)) {
          return { error: "Reason is too thin — write a concrete sentence the receiving agent can act on (who's calling, what they want, any known constraint)." };
        }
        if (deps.gateJudge !== undefined) {
          const judgment = await deps.gateJudge({
            kind: "callback_reason",
            value: input.reason,
            qualificationContext: {
              name: contactName,
              budget: liveQual.budget ?? null,
              timeline: liveQual.timeline ?? null,
              financingStatus: liveQual.financingStatus ?? null,
              urgency: input.urgency,
            },
          });
          if (!judgment.ok) {
            return { error: judgment.coaching };
          }
        }
        const values = buildLeadCapture({
          funnelType: liveQual.funnelType ?? "buyer",
          intent: "question",
          intentTier: input.urgency === "now" ? "high" : input.urgency === "today" ? "medium" : "low",
          fullName: contactName,
          email: liveQual.email ?? null,
          phone: input.contactPhone,
          qualification: liveQual,
          conversationSummary: input.reason,
        });
        const existing = await deps.repository.findExistingLead({
          workspaceId: deps.workspaceId,
          email: values.email,
          phone: values.phone,
        });
        const lead = existing === null
          ? await deps.repository.insertLead({ workspaceId: deps.workspaceId, values, createdAt: deps.occurredAt })
          : existing;
        if (existing !== null) {
          await deps.repository.updateLead({ workspaceId: deps.workspaceId, leadId: existing.id, values, updatedAt: deps.occurredAt });
        }
        const assignedMember = input.preferredAgentMemberId === null
          ? deps.assignedAgent
          : deps.team.find((m) => m.memberId === input.preferredAgentMemberId) ?? deps.assignedAgent;
        const taskId = await deps.repository.insertCallbackTask({
          workspaceId: deps.workspaceId,
          leadId: lead.id,
          listingId: deps.listing.id,
          assignedMemberId: assignedMember?.memberId ?? lead.assignedAgentId,
          reason: input.reason,
          urgency: input.urgency,
          createdAt: deps.occurredAt,
        });
        deps.state.capturedLead = { leadId: lead.id, intent: "question", status: existing === null ? "created" : "updated" };
        return {
          kind: "callback_card",
          taskId,
          leadId: lead.id,
          assignedMemberName: assignedMember?.displayName ?? null,
          urgency: input.urgency,
          reason: input.reason,
        };
      },
    }),

    request_cma: tool({
      description: "Seller funnel — queue a CMA prep task. Use only when seller shared their address + at least 2 of {motivation, timeline, condition, price expectation}.",
      inputSchema: z.object({
        sellerPropertyAddress: z.string().min(4).max(280),
        sellerMotivation: z.string().min(1).max(280).nullable(),
        sellerTimeline: z.string().min(1).max(160).nullable(),
        sellerCondition: z.string().min(1).max(400).nullable(),
        sellerPriceExpectation: z.string().min(1).max(160).nullable(),
        contactPhone: z.string().min(7).max(40),
        contactName: z.string().min(1).max(160).nullable(),
        contactEmail: z.string().email().max(160).nullable(),
      }),
      execute: async (input): Promise<CMACardPayload | { error: string }> => {
        if (!isValidPhone(input.contactPhone)) {
          return { error: "Real phone number required before queuing CMA." };
        }
        const liveQual = { ...deps.priorQualification, ...deps.state.qualificationDelta };
        const values = buildLeadCapture({
          funnelType: "seller",
          intent: "question",
          intentTier: "high",
          fullName: input.contactName ?? liveQual.name ?? null,
          email: input.contactEmail ?? liveQual.email ?? null,
          phone: input.contactPhone,
          qualification: liveQual,
          conversationSummary: `CMA request for ${input.sellerPropertyAddress}`,
        });
        const existing = await deps.repository.findExistingLead({
          workspaceId: deps.workspaceId,
          email: values.email,
          phone: values.phone,
        });
        const lead = existing === null
          ? await deps.repository.insertLead({ workspaceId: deps.workspaceId, values, createdAt: deps.occurredAt })
          : existing;
        if (existing !== null) {
          await deps.repository.updateLead({ workspaceId: deps.workspaceId, leadId: existing.id, values, updatedAt: deps.occurredAt });
        }
        const taskId = await deps.repository.insertCMARequest({
          workspaceId: deps.workspaceId,
          leadId: lead.id,
          sellerPropertyAddress: input.sellerPropertyAddress,
          sellerMotivation: input.sellerMotivation,
          sellerTimeline: input.sellerTimeline,
          sellerCondition: input.sellerCondition,
          sellerPriceExpectation: input.sellerPriceExpectation,
          createdAt: deps.occurredAt,
        });
        deps.state.capturedLead = { leadId: lead.id, intent: "question", status: existing === null ? "created" : "updated" };
        deps.state.qualificationDelta.sellerPropertyAddress = input.sellerPropertyAddress;
        if (input.sellerMotivation !== null) deps.state.qualificationDelta.sellerMotivation = input.sellerMotivation;
        if (input.sellerTimeline !== null) deps.state.qualificationDelta.sellerTimeline = input.sellerTimeline;
        if (input.sellerCondition !== null) deps.state.qualificationDelta.sellerCondition = input.sellerCondition;
        if (input.sellerPriceExpectation !== null) deps.state.qualificationDelta.sellerPriceExpectation = input.sellerPriceExpectation;
        deps.state.qualificationDelta.funnelType = "seller";
        return {
          kind: "cma_card",
          taskId,
          leadId: lead.id,
          sellerPropertyAddress: input.sellerPropertyAddress,
        };
      },
    }),

    capture_lead: tool({
      description: "Promote the visitor to a workspace lead. Phone REQUIRED, plus a clear high-intent signal (showing booked, callback requested, real qualification volunteered). Don't use for browsers / curious visitors.",
      inputSchema: z.object({
        fullName: z.string().min(1).max(160).nullable(),
        phone: z.string().min(7).max(40),
        email: z.string().email().max(160).nullable(),
        funnelType: z.enum(FUNNEL_VALUES),
        intent: z.enum(["question", "showing"]),
        intentTier: z.enum(["high", "medium", "low", "spam", "unknown"]),
        timeline: z.string().min(1).max(160).nullable(),
        budget: z.string().min(1).max(40).nullable(),
        targetArea: z.string().min(1).max(160).nullable(),
        financingStatus: z.enum(FINANCING_VALUES),
        conversationSummary: z.string().min(1).max(800),
      }),
      execute: async (input): Promise<LeadCaptureCardPayload | { error: string }> => {
        if (!isValidPhone(input.phone)) {
          return { error: "Real phone number required to capture lead." };
        }
        const liveQual = { ...deps.priorQualification, ...deps.state.qualificationDelta };
        const resolvedName = input.fullName ?? (hasUsableName(liveQual.name) ? liveQual.name : null);
        if (!hasUsableName(resolvedName)) {
          return { error: "First name required before capturing lead. Ask what to call them, then capture." };
        }
        if (failsLengthFloor(input.conversationSummary, 20)) {
          return { error: "Conversation summary is too thin — the receiving agent needs a sentence or two of context (who they are, what they want, any constraint)." };
        }
        if (deps.gateJudge !== undefined) {
          const judgment = await deps.gateJudge({
            kind: "lead_capture_summary",
            value: input.conversationSummary,
            qualificationContext: {
              name: resolvedName,
              funnelType: input.funnelType,
              intent: input.intent,
              budget: input.budget ?? liveQual.budget ?? null,
              timeline: input.timeline ?? liveQual.timeline ?? null,
              targetArea: input.targetArea ?? liveQual.targetArea ?? null,
            },
          });
          if (!judgment.ok) {
            return { error: judgment.coaching };
          }
        }
        const values = buildLeadCapture({
          funnelType: input.funnelType,
          intent: input.intent,
          intentTier: input.intentTier,
          fullName: resolvedName,
          email: input.email,
          phone: input.phone,
          qualification: { ...liveQual, timeline: input.timeline ?? liveQual.timeline, budget: input.budget ?? liveQual.budget, targetArea: input.targetArea ?? liveQual.targetArea, financingStatus: input.financingStatus },
          conversationSummary: input.conversationSummary,
        });
        const existing = await deps.repository.findExistingLead({
          workspaceId: deps.workspaceId,
          email: values.email,
          phone: values.phone,
        });
        const lead = existing === null
          ? await deps.repository.insertLead({ workspaceId: deps.workspaceId, values, createdAt: deps.occurredAt })
          : existing;
        if (existing !== null) {
          await deps.repository.updateLead({ workspaceId: deps.workspaceId, leadId: existing.id, values, updatedAt: deps.occurredAt });
        }
        deps.state.capturedLead = { leadId: lead.id, intent: input.intent, status: existing === null ? "created" : "updated" };
        return {
          kind: "lead_capture_card",
          leadId: lead.id,
          status: existing === null ? "created" : "updated",
          intent: input.intent,
          nextStep: input.intent === "showing" ? "Agent confirms showing window" : "Agent reaches out within the hour",
        };
      },
    }),
  };
}
