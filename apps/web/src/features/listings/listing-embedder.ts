import type { EmbeddingClient } from "@realty-ops/integrations";
import { buildListingEmbeddingText } from "@realty-ops/integrations";
import type { ListingFactRow, ListingFactsRepository } from "../../lib/supabase/listings";

export type ListingEmbedderDependencies = {
  repository: ListingFactsRepository;
  embeddings: EmbeddingClient;
};

export async function embedListingFact(
  deps: ListingEmbedderDependencies,
  params: { workspaceId: string; row: Pick<ListingFactRow, "id" | "address" | "status" | "price" | "beds" | "baths" | "raw_facts"> },
): Promise<{ embedded: boolean; reason?: string }> {
  const text = buildListingEmbeddingText({
    address: params.row.address,
    status: params.row.status,
    price: params.row.price,
    beds: params.row.beds,
    baths: params.row.baths,
    rawFacts: params.row.raw_facts,
  });

  if (text.trim().length === 0) {
    return { embedded: false, reason: "no_embedding_text" };
  }

  const embedding = await deps.embeddings.embed(text);
  await deps.repository.saveListingEmbedding({
    workspaceId: params.workspaceId,
    listingId: params.row.id,
    embedding,
    embeddingText: text,
  });

  return { embedded: true };
}

export async function embedPendingListings(
  deps: ListingEmbedderDependencies,
  params: { workspaceId: string; batchSize?: number },
): Promise<{ embedded: number; skipped: number }> {
  const rows = await deps.repository.findListingsMissingEmbedding({
    workspaceId: params.workspaceId,
    limit: params.batchSize ?? 25,
  });

  let embedded = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = await embedListingFact(deps, { workspaceId: params.workspaceId, row });
    if (result.embedded) {
      embedded += 1;
    } else {
      skipped += 1;
    }
  }

  return { embedded, skipped };
}
