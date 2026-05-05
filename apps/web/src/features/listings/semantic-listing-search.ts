import type { EmbeddingClient } from "@realty-ops/integrations";
import type { ListingFactsRepository, SemanticListingMatch } from "../../lib/supabase/listings";

export type SemanticListingSearchDependencies = {
  repository: ListingFactsRepository;
  embeddings: EmbeddingClient;
};

export type SemanticListingQuery = {
  workspaceId: string;
  query: string;
  limit?: number;
  minSimilarity?: number;
};

export async function searchListingsBySimilarity(
  deps: SemanticListingSearchDependencies,
  params: SemanticListingQuery,
): Promise<SemanticListingMatch[]> {
  const trimmed = params.query.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const embedding = await deps.embeddings.embed(trimmed);
  return deps.repository.semanticListingSearch({
    workspaceId: params.workspaceId,
    embedding,
    limit: params.limit ?? 5,
    minSimilarity: params.minSimilarity ?? 0.2,
  });
}
