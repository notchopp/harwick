import type { ListingMemory } from "@realty-ops/core";

/**
 * Smart-prompts derivation for the public listing chat surface.
 *
 * Two sources, combined and capped at 5:
 *
 *   1. Operator-authored `listing_memory` rows with visibility = 'public'.
 *      These are the highest-signal prompts because a real human at the
 *      brokerage chose to surface them. They show first, in displayOrder.
 *
 *   2. Heuristic prompts derived from the listing's structured facts.
 *      Used to fill any remaining slots so a listing is never bare. These
 *      are deliberately conservative — only fire when the underlying fact
 *      is actually present, never invent (e.g. don't suggest "ask about
 *      schools" unless we have a school field).
 *
 * Each prompt is `{ id, kind, label, sendsMessage }`. `label` is the chip
 * text the visitor sees. `sendsMessage` is the message body posted to the
 * chat endpoint when the visitor taps the chip — phrased as a question
 * the visitor would naturally ask, not a Harwick-internal cue.
 */

export type SmartPromptKind = ListingMemory["kind"] | "school" | "financing" | "amenity" | "showing";

export type SmartPrompt = {
  id: string;
  kind: SmartPromptKind;
  label: string;
  sendsMessage: string;
};

export type SmartPromptListingFacts = {
  listingId: string;
  price: number | null;
  beds: number | null;
  baths: number | null;
  rawFacts: Record<string, unknown>;
};

const MAX_PROMPTS = 5;

function readString(rawFacts: Record<string, unknown>, key: string): string | null {
  const value = rawFacts[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(rawFacts: Record<string, unknown>, key: string): boolean {
  return rawFacts[key] === true;
}

function readNumber(rawFacts: Record<string, unknown>, key: string): number | null {
  const value = rawFacts[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readStringArray(rawFacts: Record<string, unknown>, key: string): string[] {
  const value = rawFacts[key];
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function promptFromMemory(row: ListingMemory): SmartPrompt | null {
  if (row.prompt === null || row.prompt.length === 0) return null;
  // Visitor taps the chip → we send the prompt back AS the question. This
  // gives the model a natural inbound message and the operator full control
  // over the phrasing the visitor "asks".
  return {
    id: `memory:${row.id}`,
    kind: row.kind,
    label: row.prompt,
    sendsMessage: row.prompt,
  };
}

function schoolPrompt(rawFacts: Record<string, unknown>): SmartPrompt | null {
  const district = readString(rawFacts, "schoolDistrict") ?? readString(rawFacts, "school_district");
  const highSchool = readString(rawFacts, "highSchool") ?? readString(rawFacts, "high_school");
  if (district === null && highSchool === null) return null;
  return {
    id: "heuristic:school",
    kind: "school",
    label: "What about the schools nearby?",
    sendsMessage: "What schools does this home zone into and how are they rated?",
  };
}

function financingPrompt(facts: SmartPromptListingFacts): SmartPrompt | null {
  if (facts.price === null) return null;
  // Anything above $400k is a meaningful monthly-payment ask for the
  // average buyer; the threshold can move once we have per-workspace
  // medians but this keeps the heuristic honest right now.
  if (facts.price < 400_000) return null;
  return {
    id: "heuristic:financing",
    kind: "financing",
    label: "What would the monthly payment look like?",
    sendsMessage: "What would the real monthly payment be on this place with 10% down?",
  };
}

function incentivePrompt(rawFacts: Record<string, unknown>): SmartPrompt | null {
  const incentives = readStringArray(rawFacts, "incentives");
  if (incentives.length === 0) return null;
  return {
    id: "heuristic:incentive",
    kind: "incentive",
    label: "Are there any builder or seller incentives?",
    sendsMessage: "What incentives is the builder or seller currently offering on this home?",
  };
}

function poolPrompt(facts: SmartPromptListingFacts): SmartPrompt | null {
  if (!readBoolean(facts.rawFacts, "hasPool")) return null;
  return {
    id: "heuristic:pool",
    kind: "amenity",
    label: "What's the pool upkeep like?",
    sendsMessage: "Is the pool in good shape and what's typical monthly upkeep?",
  };
}

function sizePrompt(facts: SmartPromptListingFacts): SmartPrompt | null {
  const sqft = readNumber(facts.rawFacts, "squareFeet") ?? readNumber(facts.rawFacts, "square_feet");
  if (sqft === null || facts.beds === null) return null;
  return {
    id: "heuristic:size",
    kind: "context_note",
    label: `Is the ${facts.beds}-bed layout open or compartmental?`,
    sendsMessage: `Is the ${facts.beds}-bedroom layout open-plan or more compartmental?`,
  };
}

function showingPrompt(): SmartPrompt {
  // Always available as the closer. This is the conversion intent — the
  // god flow is "land → asks → guided to a showing", so we ensure the
  // showing path is one tap away regardless of which other prompts fired.
  return {
    id: "heuristic:showing",
    kind: "showing",
    label: "Can I see it this weekend?",
    sendsMessage: "Could I see this place this weekend? What times are open?",
  };
}

export function deriveSmartPrompts(params: {
  listing: SmartPromptListingFacts;
  memory: readonly ListingMemory[];
}): SmartPrompt[] {
  const prompts: SmartPrompt[] = [];

  for (const row of params.memory) {
    if (row.visibility !== "public") continue;
    const prompt = promptFromMemory(row);
    if (prompt !== null) prompts.push(prompt);
    if (prompts.length >= MAX_PROMPTS) return prompts;
  }

  const heuristics: Array<SmartPrompt | null> = [
    schoolPrompt(params.listing.rawFacts),
    incentivePrompt(params.listing.rawFacts),
    financingPrompt(params.listing),
    poolPrompt(params.listing),
    sizePrompt(params.listing),
  ];

  for (const candidate of heuristics) {
    if (candidate === null) continue;
    prompts.push(candidate);
    if (prompts.length >= MAX_PROMPTS) return prompts;
  }

  // Showing always closes the row if there's room.
  if (prompts.length < MAX_PROMPTS) {
    prompts.push(showingPrompt());
  }

  return prompts;
}
