/**
 * Runtime area-lookup via Brave Search — the chat-time fallback Harwick
 * uses to answer area-specific questions that aren't in the pre-enriched
 * cache (schools, walk score, nearby shopping, commute estimates,
 * neighborhood character).
 *
 * Why Brave Search and not Google/Tavily: Brave's free tier is 2000
 * queries/month with no credit card required, the API is straight HTTP,
 * and they explicitly allow attribution-free commercial use. Tavily is
 * also fine (1000/mo free) — same shape, swap the endpoint.
 *
 * Env var: BRAVE_SEARCH_API_KEY. When unset, the tool returns a
 * graceful empty result so Harwick can fall back to "let me have the
 * agent confirm that for you" instead of fabricating.
 */

const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export type AreaLookupResult = {
  query: string;
  available: boolean;
  reason?: "no_api_key" | "rate_limited" | "api_error" | "no_results";
  summary: string;
  citations: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
};

type BraveSearchResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
    }>;
  };
};

export async function lookupAreaInfo(params: {
  query: string;
  // Anchors the query to a place. Without this, Brave returns generic
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
      summary: "Area-lookup search is not configured (BRAVE_SEARCH_API_KEY missing). Tell the buyer the agent will confirm specifics.",
      citations: [],
    };
  }

  const compositeQuery = `${params.query} ${params.contextLocation}`.trim();
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set("q", compositeQuery);
  url.searchParams.set("count", "5");
  url.searchParams.set("safesearch", "moderate");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs ?? 6000);
  const doFetch = params.fetchImpl ?? fetch;

  try {
    const response = await doFetch(url.toString(), {
      headers: {
        "Accept": "application/json",
        "X-Subscription-Token": params.apiKey,
      },
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
      };
    }
    if (!response.ok) {
      return {
        query: params.query,
        available: false,
        reason: "api_error",
        summary: `Area-lookup failed (HTTP ${response.status}). Tell the buyer the agent will confirm specifics.`,
        citations: [],
      };
    }

    const data = await response.json() as BraveSearchResponse;
    const results = (data.web?.results ?? []).slice(0, 5).map((entry) => ({
      title: (entry.title ?? "").trim().slice(0, 240),
      url: (entry.url ?? "").trim(),
      snippet: (entry.description ?? "").trim().slice(0, 480),
    })).filter((entry) => entry.title.length > 0 && entry.url.length > 0);

    if (results.length === 0) {
      return {
        query: params.query,
        available: true,
        reason: "no_results",
        summary: `No web results for "${compositeQuery}". Acknowledge to the buyer and offer to have the agent confirm.`,
        citations: [],
      };
    }

    // Compose a short summary the model can quote from. Keep it dense —
    // model will paraphrase, this is just the grounding data.
    const summary = results
      .map((entry, index) => `[${index + 1}] ${entry.title}: ${entry.snippet}`)
      .join("\n\n");

    return {
      query: params.query,
      available: true,
      summary,
      citations: results,
    };
  } catch (error) {
    clearTimeout(timeout);
    return {
      query: params.query,
      available: false,
      reason: "api_error",
      summary: `Area-lookup error: ${error instanceof Error ? error.message : String(error)}. Tell the buyer the agent will confirm.`,
      citations: [],
    };
  }
}
