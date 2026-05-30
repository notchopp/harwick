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
    searchApiKey: undefined,
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
    model: openai(process.env["OPENAI_PUBLIC_LISTING_CHAT_MODEL"] ?? "gpt-4.1"),
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
  // Em-dash (U+2014) and en-dash (U+2013) banned outright. Use commas/periods.
  expect(/[—–]/.test(text), `reply contained em/en dash (use comma/period instead): "${text}"`).toBe(false);
  // Hyphen-as-pause (" - " with surrounding spaces) banned. Compound hyphenated words ("first-time", "off-leash") stay fine because no surrounding spaces.
  expect(/ - /.test(text), `reply used hyphen-as-pause (use comma/period instead): "${text}"`).toBe(false);
}

describe.skipIf(!HAS_KEY)("public listing chat — LIVE OpenAI integration", () => {
  it("captures name via note_qualification when the visitor introduces themselves", async () => {
    const { text, toolNames, state } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is 1234 Ocean View Dr still available?" },
        { role: "assistant", content: "Pending right now. What drew you to it?" },
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
        { role: "assistant", content: "Pending right now. What brought you to this one?" },
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

  it("does NOT queue a callback for a nameless visitor — asks for first name first (replay of session 2 anti-pattern)", async () => {
    const { text, toolNames, state } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is this still available?" },
        { role: "assistant", content: "Yep, still active. What drew you to it?" },
        { role: "user", content: "im a single guy with money to splurge, first time buyer" },
        { role: "assistant", content: "Got it. Are you working with a lender yet, or want an intro?" },
        { role: "user", content: "do you guys have lenders? yes please connect me" },
        { role: "assistant", content: "Yeah. Quick one, what should I call you?" },
      ],
      visitorMessage: "4848456393",
    });
    // The gate should refuse to queue a callback because we have phone but no name yet.
    // The model's recovery should be to ask for the name, not queue an anonymous callback.
    expect(state.capturedLead, "should not have captured a lead — name is missing").toBeNull();
    // The reply should not claim a callback was queued.
    expect(text.toLowerCase()).not.toMatch(/queued|on the way|reach out within|i'?ve set/);
    // The reply should ask for a name OR re-ask the name question.
    expect(text.toLowerCase()).toMatch(/(what.*call you|your name|first name|who.*calling)/);
    assertNoMarkdown(text);
  }, 45_000);

  it("captures full LPMAMA profile + queues a real callback when name + phone + concrete reason are present", async () => {
    const { text, toolNames, state } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is 1234 Ocean View Dr still available?" },
        { role: "assistant", content: "Pending right now. What brought you to it?" },
        { role: "user", content: "I'm Clinton, single guy first home, cash buyer, $200k down. Want a lender intro to talk numbers." },
        { role: "assistant", content: "Smart. Priya has a lender she trusts for cash + financed buyers. Best number to reach you?" },
      ],
      visitorMessage: "4848456393, this week is good",
    });
    // With name + phone + a concrete reason in context, the gate should pass.
    expect(toolNames, `expected request_agent_callback — got [${toolNames.join(", ")}]`).toContain("request_agent_callback");
    expect(state.capturedLead, "should have captured a lead").not.toBeNull();
    // The reply should name who is calling (Priya), not say "trusted lender network".
    expect(text.toLowerCase()).not.toMatch(/trusted lender network|i'?ll confirm/);
    // The reply should reference a specific person (Priya) or "lender from our team".
    expect(text.toLowerCase()).toMatch(/priya|lender/);
    assertNoMarkdown(text);
  }, 45_000);

  it("looks up area info instead of asking for phone (replay of Clinton noise-policy moment)", async () => {
    const { text, toolNames } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "hey i'm clinton and is this still available?" },
        { role: "assistant", content: "Still active. What brought you to it?" },
        { role: "user", content: "i'm a streamer looking for a streaming house, group of 6" },
        { role: "assistant", content: "Got it. Media room would be the move for streams. What else matters to you for the setup?" },
        { role: "user", content: "yeah how's the neighborhood we are pretty loud and wild lol" },
      ],
      visitorMessage: "what's the noise policy here? we stream pretty late",
    });
    // Model MUST call lookup_area_info — this is a factual area question.
    // Without Brave key the tool returns available:false, but the model
    // should still try the lookup before falling back.
    expect(toolNames, `expected lookup_area_info — got [${toolNames.join(", ")}]`).toContain("lookup_area_info");
    // Model MUST NOT ask for phone for this — it's an info question, not a callback.
    expect(text.toLowerCase()).not.toMatch(/phone number|best number|what'?s your number/);
    assertNoMarkdown(text);
  }, 45_000);

  it("PROACTIVELY surfaces middle school cards when the buyer mentions 3 kids in middle school", async () => {
    const { text, toolNames } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "Is this still available?" },
        { role: "assistant", content: "Pending right now. What brought you to it?" },
      ],
      visitorMessage: "we have 3 kids all in middle school looking for a forever home in coral gables",
    });
    // STRICT contract (was tolerant before, missed the prod bug at session
    // 8e1ce153 where model surfaced other listings instead of schools). The
    // life-context reveal MUST route to area facts, NOT alternative listings.
    expect(toolNames, `expected lookup_area_info — got [${toolNames.join(", ")}]`).toContain("lookup_area_info");
    // Hard rule: search_workspace_listings is the wrong tool for a life-context
    // reveal. If this fires, the doctrine drifted again.
    expect(toolNames.includes("search_workspace_listings"), `model surfaced other listings instead of area facts — tools=[${toolNames.join(", ")}]`).toBe(false);
    assertNoMarkdown(text);
  }, 60_000);

  it("PRODUCTION REPLAY — '3 middle schoolers looking to get a house big enough' must route to schools, not listings (session 8e1ce153 regression)", async () => {
    // This is the literal buyer message from the production session that
    // exposed the bug: model heard "looking to get a house big enough" and
    // fired search_workspace_listings + surface_listing x3, ignoring the
    // school signal. Fix: doctrine rewrite + tool-description tightening.
    const { text, toolNames } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "hey" },
        { role: "assistant", content: "Hey! What's on your mind about the listing or the area?" },
      ],
      visitorMessage: "i got 3 middle schoolers looking to get a house big enough",
    });
    // Must route to area facts for the school signal.
    expect(toolNames, `expected lookup_area_info — got [${toolNames.join(", ")}]`).toContain("lookup_area_info");
    // Must NOT escalate to alternative listings — household composition is
    // not an explicit "show me others" intent.
    expect(toolNames.includes("search_workspace_listings"), `regression: model fired search_workspace_listings on a life-context reveal — tools=[${toolNames.join(", ")}]`).toBe(false);
    expect(toolNames.includes("surface_listing"), `regression: model surfaced other listings — tools=[${toolNames.join(", ")}]`).toBe(false);
    assertNoMarkdown(text);
  }, 60_000);

  it("PROACTIVELY surfaces fiber/ISP info when the buyer mentions streaming", async () => {
    const { text, toolNames } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "what's this house good for?" },
        { role: "assistant", content: "Media room's a strong feature. Who are you picturing using it?" },
      ],
      visitorMessage: "i'm a twitch streamer, looking for a place i can set up a full streaming rig and not lag",
    });
    // Streaming context → broadband/fiber availability is exactly the
    // home-fit-relevant lookup the proactive doctrine encourages.
    expect(toolNames, `expected proactive lookup_area_info for fiber/ISP — got [${toolNames.join(", ")}]`).toContain("lookup_area_info");
    // Either surface_area_facts (preferred — cards) or a cited prose answer is acceptable;
    // assert at minimum the model didn't just answer "yeah this house is great for streaming."
    expect(text.toLowerCase()).toMatch(/(fiber|gbps|broadband|isp|internet|provider|att|comcast|xfinity|spectrum)/);
    assertNoMarkdown(text);
  }, 60_000);

  it("STAYS IN LANE — redirects off-topic medical/legal pushes back to housing", async () => {
    const { text, toolNames } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "hey is this still available?" },
        { role: "assistant", content: "Pending right now. What drew you to it?" },
      ],
      visitorMessage: "honestly i'm going through a divorce and need advice on dividing assets, what should i do?",
    });
    // Off-topic ask — model must redirect, not opine on divorce/legal/financial.
    // Should NOT call lookup_area_info for "divorce", should NOT surface a divorce-info card.
    expect(toolNames.filter((n) => n === "surface_area_facts")).toHaveLength(0);
    // Reply should redirect to housing, not give divorce advice.
    expect(text.toLowerCase()).toMatch(/(housing|home|specialist|attorney|lawyer|agent|i can help with|what i can|what this|neighborhood|listing|move)/);
    expect(text.toLowerCase()).not.toMatch(/(file for divorce|community property|alimony|child support|prenup|you should hire)/);
    assertNoMarkdown(text);
  }, 45_000);

  it("does not default to 'showing or features' on every close — varies the close type", async () => {
    // Replay early-conversation pattern where the old prompt closed every reply
    // with "want a showing or features?". With the new VARY THE CLOSE rule the
    // first two replies should close with different categories.
    const t1 = await runLiveTurn({
      visitorMessage: "is this still available?",
    });
    const t2 = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "is this still available?" },
        { role: "assistant", content: t1.text },
      ],
      visitorMessage: "what would you say this house is good for?",
    });
    // Neither close should be the "want a showing or [features|details]?" binary.
    // (Allow EITHER reply to mention showing in *prose*; reject only when the
    // closing question is the showing/features binary.)
    const looksLikeShowingBinary = (s: string) =>
      /(showing.{0,30}features|features.{0,30}showing|showing.{0,30}details|details.{0,30}showing)\s*\??\s*$/i.test(s.trim());
    expect(looksLikeShowingBinary(t1.text), `T1 closed with showing-binary: "${t1.text}"`).toBe(false);
    expect(looksLikeShowingBinary(t2.text), `T2 closed with showing-binary: "${t2.text}"`).toBe(false);
    assertNoMarkdown(t1.text);
    assertNoMarkdown(t2.text);
  }, 60_000);

  it("TURN 1 HARD GATE — first reply asks for the buyer's name when unknown", async () => {
    // The rule: when the visitor's name is unknown, the very first reply MUST
    // end with a name ask. The prior soft phrasing ("casually once", "do not
    // badger") let the model skip this consistently in prod. This test asserts
    // the new hard gate fires on turn 1.
    const { text } = await runLiveTurn({
      visitorMessage: "is this still available?",
    });
    expect(
      /(what.*call you|your name|first name|who.*talking|who am i.*to)/i.test(text),
      `turn 1 reply did NOT ask for name: "${text}"`,
    ).toBe(true);
    assertNoMarkdown(text);
  }, 30_000);

  it("TURN 2 HARD GATE — asks for name AGAIN when buyer ignored the turn 1 ask", async () => {
    // The rule: if the visitor ignored the turn 1 name ask, the turn 2 reply
    // MUST ask again, phrased differently. Two asks in turns 1-2, not one.
    const { text } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "is this still available?" },
        { role: "assistant", content: "Pending right now. What brought you to this one? And what should I call you?" },
      ],
      visitorMessage: "saw it on zillow, looks pretty",
    });
    expect(
      /(what.*call you|your name|first name|who.*talking|name|call ya|what'?s your|i'?m harwick.*you)/i.test(text),
      `turn 2 reply did NOT re-ask for name after buyer ignored turn 1 ask: "${text}"`,
    ).toBe(true);
    assertNoMarkdown(text);
  }, 30_000);

  it("USES the buyer's name once known — weaves it in within 2-3 turns of capture", async () => {
    // The rule: every 2-3 turns minimum once name is known. Reply to a pivot
    // moment 2 turns after name was given should reference the name to
    // build relationship.
    const { text } = await runLiveTurn({
      priorMessages: [
        { role: "user", content: "is this still available?" },
        { role: "assistant", content: "Pending right now. What brought you to this one? And what should I call you?" },
        { role: "user", content: "I'm Martha, looking for something for our family" },
        { role: "assistant", content: "Hey Martha, pending right now, but a family-friendly setup. What's pulling you to this one specifically?" },
      ],
      visitorMessage: "media room and the yard mostly. we entertain a lot",
    });
    expect(
      /martha/i.test(text),
      `reply did not use buyer's name (Martha) on a natural pivot turn: "${text}"`,
    ).toBe(true);
    assertNoMarkdown(text);
  }, 30_000);

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
