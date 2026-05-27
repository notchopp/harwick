/**
 * LIVE OpenAI integration test for the public listing chat.
 *
 * Skipped when OPENAI_API_KEY is absent (CI without the secret, or local
 * dev without .env.local sourced). When run, exercises the actual model
 * via streamText + the real tool registry — verifies:
 *
 *   1. `note_qualification` fires on a substantive visitor turn (name capture).
 *   2. `search_workspace_listings` fires when the buyer asks for alternatives.
 *   3. `surface_listing` fires after a successful search (cards drop).
 *   4. The text reply contains NO markdown sequences (** _ ![]() [](url) ...).
 *   5. Each reply is short (≤ 4 sentences as a soft ceiling).
 *
 * Uses an in-memory fake repository so the test doesn't touch Supabase.
 * Costs ~1-3¢ per run on gpt-4o.
 *
 *   To run locally:
 *     export OPENAI_API_KEY=sk-...
 *     npx vitest run apps/web/src/features/public-listings/listing-chat-live.test.ts
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { describe, expect, it } from "vitest";

import { buildListingChatSystemPrompt } from "./listing-chat-system-prompt";
import { buildListingChatTools, type ListingChatTurnState } from "./listing-chat-tools";
import type {
  PublicListingChatListing,
  PublicListingChatRepository,
} from "./public-listing-chat";

const HAS_KEY = typeof process.env["OPENAI_API_KEY"] === "string" && process.env["OPENAI_API_KEY"].length > 0;

const workspaceId = "00000000-0000-0000-0000-000000000001";
const focusListingId = "00000000-0000-0000-0000-000000000010";
const otherListingId = "00000000-0000-0000-0000-000000000011";
const agentMemberId = "00000000-0000-0000-0000-000000000020";

function makeListing(id: string, overrides: Partial<PublicListingChatListing> = {}): PublicListingChatListing {
  return {
    id,
    workspaceId,
    address: "1234 Ocean View Dr",
    mlsNumber: "HAR-LIVE-1",
    status: "Pending",
    price: 2_450_000,
    beds: 4,
    baths: 3.5,
    rawFacts: {
      neighborhood: "Coral Gables",
      city: "Coral Gables",
      state: "FL",
      postalCode: "33134",
      propertyType: "single family",
    },
    verifiedAt: "2026-05-20T12:00:00.000Z",
    areaIntel: null,
    ...overrides,
  };
}

const alternativeListing = makeListing(otherListingId, {
  address: "78 Banyan Row",
  status: "Active",
  price: 1_150_000,
  beds: 3,
  baths: 3,
  rawFacts: { neighborhood: "South Miami", propertyType: "townhome" },
});

function makeRepository(): PublicListingChatRepository {
  const noop = async () => {};
  return {
    findWorkspaceBySlug: async () => ({ id: workspaceId, name: "Prestige Realty" }),
    findListing: async ({ listingId }) =>
      listingId === focusListingId ? makeListing(focusListingId) :
      listingId === otherListingId ? alternativeListing : null,
    findOtherListings: async ({ excludeListingId }) =>
      excludeListingId === focusListingId ? [alternativeListing] : [],
    findWorkspaceTeam: async () => [{
      memberId: agentMemberId,
      displayName: "Priya Shah",
      role: "buyer agent",
      email: "priya@example.com",
      phone: null,
      specialties: "Coral Gables / South Miami buyers",
      avatarUrl: null,
    }],
    findVisitorContext: async () => ({
      isReturning: false,
      lastSeenAt: null,
      priorQualification: {},
      priorListingsAskedAbout: [],
      recentTranscript: [],
      promotedLead: null,
    }),
    insertCMARequest: async () => "cma-id",
    insertCallbackTask: async () => "callback-id",
    findListingMemory: async () => [],
    findSessionByToken: async () => null,
    createSession: async ({ sessionToken }) => ({ id: "session-id", sessionToken, qualification: {}, promotedLeadId: null }),
    findRecentTurns: async () => [],
    appendTurn: noop,
    updateSessionQualification: noop,
    linkSessionLead: noop,
    findExistingLead: async () => null,
    insertLead: async () => ({ id: "lead-id", assignedAgentId: null }),
    updateLead: noop,
    insertLeadEvent: noop,
    insertShowingTask: async () => "showing-task-id",
    findShowingsForVisitor: async () => [],
    findAgentByMemberId: async () => null,
  };
}

async function runLiveTurn(params: {
  visitorMessage: string;
  priorMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  state?: ListingChatTurnState;
}) {
  const openai = createOpenAI({ apiKey: process.env["OPENAI_API_KEY"] ?? "" });
  const repository = makeRepository();
  const listing = makeListing(focusListingId);
  const state: ListingChatTurnState = params.state ?? {
    qualificationDelta: {},
    capturedLead: null,
  };
  const tools = buildListingChatTools({
    repository,
    workspaceId,
    workspaceName: "Prestige Realty",
    listing,
    priorQualification: {},
    team: [{
      memberId: agentMemberId,
      displayName: "Priya Shah",
      role: "buyer agent",
      specialties: "Coral Gables / South Miami buyers",
      avatarUrl: null,
    }],
    assignedAgent: null,
    braveSearchApiKey: undefined,
    occurredAt: new Date().toISOString(),
    state,
  });
  const systemPrompt = buildListingChatSystemPrompt({
    workspaceName: "Prestige Realty",
    listing,
    memory: [],
    team: [{
      memberId: agentMemberId,
      displayName: "Priya Shah",
      role: "buyer agent",
      specialties: "Coral Gables / South Miami buyers",
      avatarUrl: null,
    }],
    visitorQualification: {},
    visitorAgent: null,
    visitorShowings: [],
    isReturningVisitor: false,
    currentDate: new Date().toISOString().slice(0, 10),
  });

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    ...(params.priorMessages ?? []),
    { role: "user", content: params.visitorMessage },
  ];

  const result = await generateText({
    model: openai("gpt-4o"),
    system: systemPrompt,
    messages,
    tools,
    stopWhen: stepCountIs(6),
  });

  const toolNames = result.steps.flatMap((step) =>
    step.toolCalls.map((call) => call.toolName),
  );

  return {
    text: result.text,
    toolNames,
    state,
  };
}

const MARKDOWN_PATTERNS = [
  { name: "bold (**...**)", pattern: /\*\*[^*]+\*\*/ },
  { name: "image link (![...](...))", pattern: /!\[[^\]]*\]\([^)]*\)/ },
  { name: "url link ([...](...))", pattern: /\[[^\]]+\]\([^)]+\)/ },
  { name: "leading bullet (- or *)", pattern: /^\s*[-*]\s+\w/m },
  { name: "numbered list (1. )", pattern: /^\s*\d+\.\s+\w/m },
  { name: "markdown header (#)", pattern: /^\s*#+\s+/m },
];

function assertNoMarkdown(text: string): void {
  for (const { name, pattern } of MARKDOWN_PATTERNS) {
    expect(pattern.test(text), `reply contained ${name}: "${text}"`).toBe(false);
  }
}

describe.skipIf(!HAS_KEY)("public listing chat — LIVE OpenAI integration", () => {
  it("captures name via note_qualification when the visitor introduces themselves", async () => {
    const { text, toolNames, state } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is 1234 Ocean View Dr still available?" },
        { role: "assistant", content: "Pending right now — what drew you to it?" },
      ],
      visitorMessage: "I'm Clinton, looking for a 4-bed in Coral Gables under 2.5M, before fall.",
    });
    expect(toolNames, `expected note_qualification — got [${toolNames.join(", ")}]`).toContain("note_qualification");
    expect(state.qualificationDelta.name?.toLowerCase()).toBe("clinton");
    expect(state.qualificationDelta.targetArea?.toLowerCase()).toContain("coral gables");
    assertNoMarkdown(text);
    expect(text.split(/[.!?]/).filter((s) => s.trim().length > 0).length).toBeLessThanOrEqual(4);
  }, 30_000);

  it("searches inventory and surfaces a card when the current listing is unavailable", async () => {
    const { text, toolNames } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is this still available?" },
        { role: "assistant", content: "It's pending right now. Want me to pull what's active nearby?" },
      ],
      visitorMessage: "yes please, anything similar",
    });
    expect(toolNames, `expected search_workspace_listings — got [${toolNames.join(", ")}]`).toContain("search_workspace_listings");
    expect(toolNames, `expected surface_listing after search — got [${toolNames.join(", ")}]`).toContain("surface_listing");
    assertNoMarkdown(text);
    // Card + Text contract: reply MUST NOT include the surfaced listing's
    // address or price (the card carries that).
    expect(text.toLowerCase()).not.toContain("banyan");
    expect(text).not.toMatch(/\$1,?150,?000/);
  }, 45_000);

  it("captures life context AND sets a hero headline on a substantive turn", async () => {
    const { text, toolNames, state } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is this still available?" },
        { role: "assistant", content: "Pending right now — what brought you to this one?" },
      ],
      visitorMessage: "I'm Martha. My husband and I have 3 kids entering middle school, and we're getting married this June actually — second marriage. We need something in Coral Gables before fall, around 2.5M.",
    });
    expect(toolNames, `expected note_qualification — got [${toolNames.join(", ")}]`).toContain("note_qualification");
    expect(toolNames, `expected set_visitor_headline — got [${toolNames.join(", ")}]`).toContain("set_visitor_headline");
    // lifeContext should capture at least one of the family / wedding / school signals.
    const life = state.qualificationDelta.lifeContext ?? [];
    expect(life.length, "lifeContext should be populated").toBeGreaterThan(0);
    const joinedLife = life.join(" | ").toLowerCase();
    expect(
      joinedLife.includes("kid") || joinedLife.includes("middle school") || joinedLife.includes("marri") || joinedLife.includes("wed"),
      `lifeContext should mention kids/school/marriage — got: ${joinedLife}`,
    ).toBe(true);
    // Headline should mention Martha and reflect Coral Gables + the constraints somewhere.
    expect(state.qualificationDelta.headline?.toLowerCase()).toMatch(/martha/);
    expect(state.qualificationDelta.headline?.toLowerCase()).toMatch(/coral gables/);
    assertNoMarkdown(text);
  }, 45_000);

  it("does not loop the discovery gate — asks instead of re-searching", async () => {
    // Start with a sparse "show me listings" request; model should hit the
    // discovery_required gate and ask one question, not call search again.
    const { text, toolNames } = await runLiveTurn({
      visitorMessage: "what listings do you have",
    });
    const searchCount = toolNames.filter((name) => name === "search_workspace_listings").length;
    // Two consecutive zero-result calls are allowed but more than that = bug.
    expect(searchCount, `model looped search ${searchCount} times — should ask instead`).toBeLessThanOrEqual(2);
    expect(text.length).toBeGreaterThan(0);
    expect(text).toMatch(/\?/);
    assertNoMarkdown(text);
  }, 30_000);
});
