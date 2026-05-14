import { createOpenAIEmbeddingClient } from "@realty-ops/integrations";
import { z } from "zod";

import { getServerEnvironment } from "../../../lib/server-env";
import type { HarwickToolDefinition, HarwickToolDeps } from "../registry";

/**
 * Semantic-search tools — turn Harwick from "summarizer" into "pattern
 * recognizer". Embeddings infra already exists on listing_facts and
 * workspace_memory_documents; these tools expose it through the registry.
 */

async function embedText(text: string): Promise<number[] | null> {
  const env = getServerEnvironment();
  if (env.OPENAI_API_KEY === undefined) return null;
  try {
    const client = createOpenAIEmbeddingClient({ apiKey: env.OPENAI_API_KEY });
    return await client.embed(text);
  } catch {
    return null;
  }
}

export const findSimilarLeadsTool: HarwickToolDefinition = {
  name: "find_similar_leads",
  description: "Find leads in this workspace that resemble the given descriptor — same area, similar budget, similar timeline. Use to spot patterns: 'leads like this one have closed 4-of-7 times' / 'this profile usually drops after showing #2'. Returns up to 8 ranked matches.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  requiresCapability: "leads.read_all",
  approval: "internal_safe",
  inputSchema: z.object({
    descriptor: z.string().min(8).max(800).describe("Natural-language description of the lead profile. Examples: 'first-time buyer in 78704 with $450k-$550k budget asking about financing', 'relocation buyer from California targeting downtown Austin'."),
    excludeLeadId: z.string().uuid().nullable().default(null),
    limit: z.number().int().min(1).max(12).default(6),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const { data, error } = await deps.supabase
      .from("leads")
      .select("id, full_name, status, score, target_area, budget_min, budget_max, lead_type, timeline, source_channel, assigned_agent_id, last_message_at, qualification_summary, tags")
      .eq("workspace_id", deps.workspaceId)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(60);

    if (error !== null || data === null) {
      return { kind: "similar_leads", count: 0, matches: [], note: error?.message ?? "query_failed" };
    }

    const lowerDescriptor = input.descriptor.toLowerCase();
    const tokens: string[] = Array.from(new Set(
      lowerDescriptor.split(/[^a-z0-9]+/g).filter((t: string) => t.length > 3),
    ));

    const scored = data
      .filter((lead) => lead.id !== input.excludeLeadId)
      .map((lead) => {
        const tagText = Array.isArray(lead.tags) ? (lead.tags as unknown[]).filter((t): t is string => typeof t === "string").join(" ") : "";
        const text = [
          lead.full_name,
          lead.target_area,
          lead.lead_type,
          lead.timeline,
          lead.source_channel,
          lead.qualification_summary,
          tagText,
        ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ").toLowerCase();
        const matched = tokens.filter((token) => text.includes(token)).length;
        return { lead, overlap: matched };
      })
      .filter((row) => row.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, input.limit);

    return {
      kind: "similar_leads",
      count: scored.length,
      matches: scored.map((row) => ({
        leadId: row.lead.id,
        name: row.lead.full_name ?? "Unknown",
        status: row.lead.status,
        score: row.lead.score,
        targetArea: row.lead.target_area,
        leadType: row.lead.lead_type,
        timeline: row.lead.timeline,
        budget: row.lead.budget_min === null && row.lead.budget_max === null
          ? null
          : `$${row.lead.budget_min ?? "?"}-$${row.lead.budget_max ?? "?"}`,
        qualificationSummary: row.lead.qualification_summary,
        tags: Array.isArray(row.lead.tags) ? row.lead.tags : [],
        overlapScore: row.overlap,
      })),
    };
  },
};

export const searchListingsTool: HarwickToolDefinition = {
  name: "search_listings",
  description: "Find workspace listings semantically — natural language query against listing_facts embeddings. Use for 'show me 3-bed under $600k near Mueller' or 'listings that match a downsizing empty-nester'. Returns up to 8 listings ranked by similarity.",
  scopes: ["operator_chat", "lead_conversation", "channel_mention"],
  approval: "internal_safe",
  inputSchema: z.object({
    query: z.string().min(3).max(500),
    limit: z.number().int().min(1).max(12).default(6),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const embedding = await embedText(input.query);
    if (embedding === null) {
      return { kind: "listings", count: 0, listings: [], note: "Embeddings unavailable." };
    }

    const { data, error } = await deps.supabase.rpc(
      "match_listing_facts" as never,
      {
        workspace: deps.workspaceId,
        query_embedding: embedding,
        match_count: input.limit,
        min_similarity: 0.2,
      } as never,
    );

    if (error !== null) {
      // Fallback: text-match on address.
      const { data: listings } = await deps.supabase
        .from("listing_facts")
        .select("id, address, status, price, beds, baths, source")
        .eq("workspace_id", deps.workspaceId)
        .ilike("address", `%${input.query}%`)
        .limit(input.limit);
      return {
        kind: "listings",
        count: (listings ?? []).length,
        searchMode: "text_fallback",
        listings: listings ?? [],
        rpcNote: error.message,
      };
    }

    const rpcRows = Array.isArray(data) ? (data as unknown[]) : [];
    return {
      kind: "listings",
      count: rpcRows.length,
      searchMode: "vector",
      listings: rpcRows,
    };
  },
};

export const findCompsTool: HarwickToolDefinition = {
  name: "find_comps",
  description: "Find comparable listings to a target listing — similar size/price/bedrooms. Use for pricing conversations and valuation talk. Returns up to 6 comps ranked by closeness.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "internal_safe",
  inputSchema: z.object({
    listingId: z.string().uuid().describe("The reference listing_facts id."),
    limit: z.number().int().min(1).max(8).default(5),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const { data: anchor } = await deps.supabase
      .from("listing_facts")
      .select("id, address, status, price, beds, baths")
      .eq("workspace_id", deps.workspaceId)
      .eq("id", input.listingId)
      .maybeSingle();

    if (anchor === null) {
      return { kind: "comps", count: 0, comps: [], note: "Listing not found in this workspace." };
    }

    let query = deps.supabase
      .from("listing_facts")
      .select("id, address, status, price, beds, baths")
      .eq("workspace_id", deps.workspaceId)
      .neq("id", anchor.id)
      .limit(40);

    if (anchor.beds !== null) {
      query = query.gte("beds", Math.max(0, Number(anchor.beds) - 1)).lte("beds", Number(anchor.beds) + 1);
    }

    const { data: candidates, error } = await query;
    if (error !== null || candidates === null) {
      return { kind: "comps", count: 0, comps: [], note: error?.message ?? "query_failed" };
    }

    const ranked = candidates
      .map((listing) => {
        const priceDelta = anchor.price === null || listing.price === null
          ? 0
          : Math.abs((Number(listing.price) - Number(anchor.price)) / Math.max(1, Number(anchor.price)));
        const bathDelta = anchor.baths === null || listing.baths === null
          ? 0
          : Math.abs(Number(listing.baths) - Number(anchor.baths));
        return { listing, distance: priceDelta + bathDelta / 10 };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, input.limit);

    return {
      kind: "comps",
      anchor: {
        listingId: anchor.id,
        address: anchor.address,
        price: anchor.price,
        beds: anchor.beds,
        baths: anchor.baths,
      },
      count: ranked.length,
      comps: ranked.map((row) => ({
        listingId: row.listing.id,
        address: row.listing.address,
        status: row.listing.status,
        price: row.listing.price,
        beds: row.listing.beds,
        baths: row.listing.baths,
        deltaScore: row.distance,
      })),
    };
  },
};

export const SEMANTIC_SEARCH_TOOLS: HarwickToolDefinition[] = [
  findSimilarLeadsTool,
  searchListingsTool,
  findCompsTool,
];
