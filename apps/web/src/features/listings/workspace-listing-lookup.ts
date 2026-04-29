import {
  RepliersCredentialSchema,
  type Logger,
  type ServerEnvironment,
} from "@realty-ops/core";
import { createRepliersListingClient, type ListingProviderClient } from "@realty-ops/integrations";
import { decryptCredential } from "../../lib/credentials";
import type {
  ListingFactsRepository,
  ListingLookupRepository,
} from "../../lib/supabase/listings";
import type { ConnectedRepliersCredentialRecord } from "../../lib/supabase/integration-accounts";
import { createListingLookupRepository } from "./listing-lookup";

export type RepliersCredentialLookupRepository = {
  findConnectedCredential(params: {
    workspaceId: string;
  }): Promise<ConnectedRepliersCredentialRecord | null>;
};

type RepliersProviderFactoryOptions = {
  apiKey: string;
  boardId?: number;
};

function createEnvFallbackProvider(params: {
  environment: ServerEnvironment;
  createProvider: (options: RepliersProviderFactoryOptions) => ListingProviderClient;
}): ListingProviderClient | undefined {
  const { environment } = params;
  if (environment.LISTING_PROVIDER !== "repliers" || environment.REPLIERS_API_KEY === undefined) {
    return undefined;
  }

  return params.createProvider({
    apiKey: environment.REPLIERS_API_KEY,
    ...(environment.REPLIERS_BOARD_ID === undefined ? {} : { boardId: environment.REPLIERS_BOARD_ID }),
  });
}

export function createWorkspaceScopedListingLookupRepository(params: {
  repository: ListingFactsRepository;
  credentialRepository: RepliersCredentialLookupRepository;
  credentialSecret?: string;
  environment: ServerEnvironment;
  logger: Logger;
  createProvider?: (options: RepliersProviderFactoryOptions) => ListingProviderClient;
}): ListingLookupRepository {
  const createProvider = params.createProvider ?? createRepliersListingClient;
  const fallbackProvider = createEnvFallbackProvider({
    environment: params.environment,
    createProvider,
  });

  return {
    async lookupListing(input) {
      let provider = fallbackProvider;
      const connectedCredential = params.credentialSecret === undefined
        ? null
        : await params.credentialRepository.findConnectedCredential({
            workspaceId: input.workspaceId,
          });

      if (connectedCredential !== null && params.credentialSecret !== undefined) {
        const credential = RepliersCredentialSchema.parse(decryptCredential(
          connectedCredential.encryptedCredentialRef,
          params.credentialSecret,
        ));
        provider = createProvider({
          apiKey: credential.apiKey,
          ...(credential.boardId === null || credential.boardId === undefined ? {} : { boardId: credential.boardId }),
        });
      }

      return createListingLookupRepository({
        repository: params.repository,
        logger: params.logger,
        ...(provider === undefined ? {} : { provider }),
      }).lookupListing(input);
    },
  };
}
