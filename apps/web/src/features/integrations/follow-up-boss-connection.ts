import {
  ConnectFollowUpBossIntegrationRequestSchema,
} from "@realty-ops/core";
import { encryptCredential } from "../../lib/credentials";
import {
  verifyFollowUpBossApiKey,
  type FollowUpBossTestConnectionResult,
} from "./follow-up-boss-test";

const FollowUpBossCredentialSchema = ConnectFollowUpBossIntegrationRequestSchema.pick({
  apiKey: true,
});

export type FollowUpBossConnectionValidationFailure = Extract<
  FollowUpBossTestConnectionResult,
  { success: false }
>;

export class FollowUpBossConnectionValidationError extends Error {
  readonly result: FollowUpBossConnectionValidationFailure;

  constructor(result: FollowUpBossConnectionValidationFailure) {
    super(result.error);
    this.name = "FollowUpBossConnectionValidationError";
    this.result = result;
  }
}

export type FollowUpBossCredentialRepository = {
  upsertWorkspaceCredential(params: {
    workspaceId: string;
    providerAccountId: string;
    providerAccountName: string | null;
    encryptedCredentialRef: string;
  }): Promise<{
    integrationAccountId: string;
    workspaceId: string;
    providerAccountId: string | null;
    providerAccountName: string | null;
  }>;
};

export async function connectWorkspaceFollowUpBossIntegration(params: {
  workspaceId: string;
  request: unknown;
  credentialSecret: string;
  repository: FollowUpBossCredentialRepository;
  fetchImpl?: typeof fetch;
}) {
  const parsed = ConnectFollowUpBossIntegrationRequestSchema.parse(params.request);
  const credential = FollowUpBossCredentialSchema.parse({
    apiKey: parsed.apiKey,
  });
  const validation = await verifyFollowUpBossApiKey(params.fetchImpl === undefined
    ? { apiKey: credential.apiKey }
    : { apiKey: credential.apiKey, fetchImpl: params.fetchImpl });
  if (!validation.success) {
    throw new FollowUpBossConnectionValidationError(validation);
  }

  const connected = await params.repository.upsertWorkspaceCredential({
    workspaceId: params.workspaceId,
    providerAccountId: "workspace-default",
    providerAccountName: parsed.providerAccountName ?? "Follow Up Boss",
    encryptedCredentialRef: encryptCredential(credential, params.credentialSecret),
  });

  return {
    integrationAccountId: connected.integrationAccountId,
    workspaceId: connected.workspaceId,
    provider: "follow_up_boss" as const,
    accountScope: "workspace" as const,
    providerAccountId: connected.providerAccountId,
    providerAccountName: connected.providerAccountName,
    status: "connected" as const,
  };
}
