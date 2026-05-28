/**
 * Runtime area-lookup via Tavily Search — the chat-time tool Harwick uses
 * to answer area-specific questions that aren't in the pre-enriched cache
 * (schools, walk score, HOA rules, noise ordinances, commute estimates,
 * neighborhood character, flood / insurance, broadband providers, etc).
 *
 * Why Tavily and not Brave/Google: Tavily is purpose-built for LLM agents.
 * Same shape as Brave's API, free tier is 1000 queries/month (no card),
 * and it returns pre-cleaned snippets plus a synthesized one-sentence
 * `answer` field — less prompt-side cleanup than raw web results. Paid
 * tier starts at $50/mo for 50k queries when usage grows.
 *
 * Env var: TAVILY_API_KEY. When unset (or any transient error / rate-limit)
 * the tool returns a graceful empty result so Harwick can fall back to
 * "let me have the agent confirm that for you" instead of fabricating.
 */

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export type AreaLookupResult = {
  query: string;
  available: boolean;
  reason?: "no_api_key" | "rate_limited" | "api_error" | "no_results";
  summary: string;
  citations: Array<{
    title: string;
    url: string;
    snippet: string;
    // Image URL when Tavily found one for this result. Used by
    // `surface_area_facts` to render image-led cards in the chat.
    imageUrl: string | null;
  }>;
  // Standalone image URLs Tavily surfaced for the query (separate from
  // per-result imagery). Falls back to citation imageUrls if empty.
  images: string[];
};

type TavilySearchResponse = {
  query?: string;
  // Tavily synthesizes a one-sentence answer when `include_answer` is set
  // — concrete, citation-ready prose the model can quote directly.
  answer?: string;
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
  }>;
  // Tavily returns up to 5 images when `include_images: true`.
  // Useful for amenity / park / restaurant / school cards.
  images?: string[];
};

export async function lookupAreaInfo(params: {
  query: string;
  // Anchors the query to a place. Without this, Tavily returns generic
  // results; with it, results are specific to the listing's geography.
  contextLocation: string;
  apiKey: string | undefined;
  // Allows the caller to bound timeouts in tests / production.
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<AreaLookupResult> {
  if (params.apiKey === undefined || params.apiKey.length === 0) {
    return {
      query: params.query,
      available: false,
      reason: "no_api_key",
      summary: "Area-lookup search is not configured (TAVILY_API_KEY missing). Tell the buyer the agent will confirm specifics.",
      citations: [],
      images: [],
    };
  }

  const compositeQuery = `${params.query} ${params.contextLocation}`.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 6000);
  const doFetch = params.fetchImpl ?? fetch;

  try {
    const response = await doFetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: params.apiKey,
        query: compositeQuery,
        // "basic" is fine for area facts (~1s); "advanced" is heavier and
        // takes ~3s but does deeper crawling — overkill for this tool.
        search_depth: "basic",
        max_results: 5,
        // Asks Tavily to synthesize a one-sentence answer from the
        // results, ready for the model to quote. This is the AI-agent
        // affordance that Brave lacks.
        include_answer: true,
        include_raw_content: false,
        // Up to 5 image URLs Harwick can drop into card UIs.
        include_images: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.status === 429) {
      return {
        query: params.query,
        available: false,
        reason: "rate_limited",
        summary: "Area-lookup is temporarily rate-limited. Tell the buyer the agent will confirm specifics.",
        citations: [],
        images: [],
      };
    }
    if (!response.ok) {
      return {
        query: params.query,
        available: false,
        reason: "api_error",
        summary: `Area-lookup failed (HTTP ${response.status}). Tell the buyer the agent will confirm specifics.`,
        citations: [],
        images: [],
      };
    }

    const data = await response.json() as TavilySearchResponse;
    const images = (data.images ?? []).filter((url): url is string => typeof url === "string" && url.length > 0).slice(0, 5);
    const results = (data.results ?? []).slice(0, 5).map((entry, index) => ({
      title: (entry.title ?? "").trim().slice(0, 240),
      url: (entry.url ?? "").trim(),
      snippet: (entry.content ?? "").trim().slice(0, 480),
      // Pair each result with an image when we have enough — the model
      // can use this for `surface_area_facts` to render image-led cards.
      imageUrl: images[index] ?? null,
    })).filter((entry) => entry.title.length > 0 && entry.url.length > 0);

    if (results.length === 0) {
      return {
        query: params.query,
        available: true,
        reason: "no_results",
        summary: `No web results for "${compositeQuery}". Acknowledge to the buyer and offer to have the agent confirm.`,
        citations: [],
        images: [],
      };
    }

    // Prefer Tavily's synthesized answer when available — it's already
    // pre-cleaned for LLM consumption. Fall back to a dense numbered
    // bullet list of result snippets when no answer was returned (rare
    // for area-style queries).
    const summary = typeof data.answer === "string" && data.answer.trim().length > 0
      ? `${data.answer.trim()}\n\nCitations:\n${results
          .map((entry, index) => `[${index + 1}] ${entry.title}: ${entry.snippet}`)
          .join("\n\n")}`
      : results
          .map((entry, index) => `[${index + 1}] ${entry.title}: ${entry.snippet}`)
          .join("\n\n");

    return {
      query: params.query,
      available: true,
      summary,
      citations: results,
      images,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      query: params.query,
      available: false,
      reason: "api_error",
      summary: `Area-lookup error: ${error instanceof Error ? error.message : String(error)}. Tell the buyer the agent will confirm.`,
      citations: [],
      images: [],
    };
  }
}
