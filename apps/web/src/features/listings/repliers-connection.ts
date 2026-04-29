import {
  ConnectRepliersIntegrationRequestSchema,
  RepliersCredentialSchema,
} from "@realty-ops/core";
import { encryptCredential } from "../../lib/credentials";

export type RepliersCredentialRepository = {
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

function buildProviderAccountId(boardId: number | null | undefined): string {
  return boardId === null || boardId === undefined ? "workspace-default" : `board:${boardId}`;
}

export async function connectWorkspaceRepliersIntegration(params: {
  workspaceId: string;
  request: unknown;
  credentialSecret: string;
  repository: RepliersCredentialRepository;
}) {
  const parsed = ConnectRepliersIntegrationRequestSchema.parse(params.request);
  const credential = RepliersCredentialSchema.parse({
    apiKey: parsed.apiKey,
    boardId: parsed.boardId ?? null,
  });
  const providerAccountId = buildProviderAccountId(credential.boardId);
  const providerAccountName = parsed.providerAccountName
    ?? (credential.boardId === null || credential.boardId === undefined
      ? "Repliers"
      : `Repliers board ${credential.boardId}`);
  const connected = await params.repository.upsertWorkspaceCredential({
    workspaceId: params.workspaceId,
    providerAccountId,
    providerAccountName,
    encryptedCredentialRef: encryptCredential(credential, params.credentialSecret),
  });

  return {
    integrationAccountId: connected.integrationAccountId,
    workspaceId: connected.workspaceId,
    provider: "repliers" as const,
    accountScope: "workspace" as const,
    providerAccountId: connected.providerAccountId,
    providerAccountName: connected.providerAccountName,
    status: "connected" as const,
  };
}
