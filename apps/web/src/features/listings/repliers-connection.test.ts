import { describe, expect, it, vi } from "vitest";
import { decryptCredential } from "../../lib/credentials";
import {
  connectWorkspaceRepliersIntegration,
  type RepliersCredentialRepository,
} from "./repliers-connection";

describe("connectWorkspaceRepliersIntegration", () => {
  it("stores an encrypted workspace-scoped Repliers credential", async () => {
    const upsertWorkspaceCredential = vi.fn<RepliersCredentialRepository["upsertWorkspaceCredential"]>()
      .mockImplementation((params) => Promise.resolve({
      integrationAccountId: "integration-1",
      workspaceId: params.workspaceId,
      providerAccountId: params.providerAccountId,
      providerAccountName: params.providerAccountName,
    }));

    const result = await connectWorkspaceRepliersIntegration({
      workspaceId: "workspace-1",
      request: {
        apiKey: "repliers-secret",
        boardId: 123,
      },
      credentialSecret: "credential-secret-value",
      repository: {
        upsertWorkspaceCredential,
      },
    });

    expect(result).toMatchObject({
      provider: "repliers",
      accountScope: "workspace",
      providerAccountId: "board:123",
      status: "connected",
    });
    const upsertPayload = upsertWorkspaceCredential.mock.calls[0]?.[0];
    if (upsertPayload === undefined) {
      throw new Error("Expected Repliers credential upsert payload.");
    }
    const encryptedCredentialRef = upsertPayload.encryptedCredentialRef;
    expect(encryptedCredentialRef).toMatch(/^enc:v1:/);
    expect(decryptCredential(encryptedCredentialRef, "credential-secret-value")).toEqual({
      apiKey: "repliers-secret",
      boardId: 123,
    });
  });
});
