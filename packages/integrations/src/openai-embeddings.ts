import { z } from "zod";

const EmbeddingResponseSchema = z.object({
  data: z.array(z.object({
    embedding: z.array(z.number()),
    index: z.number().int().nonnegative(),
  })).min(1),
});

export type EmbeddingClient = {
  embed(input: string): Promise<number[]>;
};

export type OpenAIEmbeddingClientOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_MODEL = "text-embedding-3-small";

export function createOpenAIEmbeddingClient(options: OpenAIEmbeddingClientOptions): EmbeddingClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_MODEL;

  return {
    async embed(input) {
      const trimmed = input.trim();
      if (trimmed.length === 0) {
        throw new Error("Cannot embed empty text.");
      }

      const response = await fetchImpl("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: trimmed,
          model,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`OpenAI embedding request failed: ${response.status} ${response.statusText} ${detail}`);
      }

      const parsed = EmbeddingResponseSchema.parse(await response.json());
      return parsed.data[0]!.embedding;
    },
  };
}

export function buildListingEmbeddingText(listing: {
  address: string;
  status?: string | null;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  rawFacts?: Record<string, unknown> | null;
}): string {
  const parts: string[] = [listing.address];

  if (listing.status !== null && listing.status !== undefined && listing.status.length > 0) {
    parts.push(`status: ${listing.status}`);
  }
  if (listing.price !== null && listing.price !== undefined) {
    parts.push(`price: $${listing.price.toLocaleString("en-US")}`);
  }
  if (listing.beds !== null && listing.beds !== undefined) {
    parts.push(`${listing.beds} bed`);
  }
  if (listing.baths !== null && listing.baths !== undefined) {
    parts.push(`${listing.baths} bath`);
  }

  const raw = listing.rawFacts ?? {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      parts.push(`${key}: ${value.trim()}`);
    } else if (typeof value === "number" || typeof value === "boolean") {
      parts.push(`${key}: ${String(value)}`);
    }
  }

  return parts.join(". ");
}
