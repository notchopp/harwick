import {
  ConnectFollowUpBossIntegrationRequestSchema,
} from "@realty-ops/core";
import { encryptCredential } from "../../lib/credentials";

const FollowUpBossCredentialSchema = ConnectFollowUpBossIntegrationRequestSchema.pick({
  apiKey: true,
});

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
}) {
  const parsed = ConnectFollowUpBossIntegrationRequestSchema.parse(params.request);
  const credential = FollowUpBossCredentialSchema.parse({
    apiKey: parsed.apiKey,
  });
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
