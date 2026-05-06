import { describe, expect, it, vi } from "vitest";
import {
  FollowUpBossConnectionValidationError,
  connectWorkspaceFollowUpBossIntegration,
} from "./follow-up-boss-connection";

function createResponse(params: {
  ok?: boolean;
  status?: number;
  body?: unknown;
  text?: string;
}) {
  return {
    ok: params.ok ?? true,
    status: params.status ?? 200,
    json: vi.fn().mockResolvedValue(params.body ?? { teams: [] }),
    text: vi.fn().mockResolvedValue(params.text ?? ""),
  } as unknown as Response;
}

describe("connectWorkspaceFollowUpBossIntegration", () => {
  it("validates the pasted API key before persisting the credential", async () => {
    const repository = {
      upsertWorkspaceCredential: vi.fn().mockResolvedValue({
        integrationAccountId: "integration-1",
        workspaceId: "workspace-1",
        providerAccountId: "workspace-default",
        providerAccountName: "Follow Up Boss",
      }),
    };
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({}));

    await expect(connectWorkspaceFollowUpBossIntegration({
      workspaceId: "workspace-1",
      request: {
        apiKey: "valid-api-key",
        providerAccountName: "Follow Up Boss",
      },
      credentialSecret: "secret",
      repository,
      fetchImpl,
    })).resolves.toMatchObject({
      integrationAccountId: "integration-1",
      provider: "follow_up_boss",
      status: "connected",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.followupboss.com/v1/teams",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(repository.upsertWorkspaceCredential).toHaveBeenCalledOnce();
  });

  it("does not persist invalid Follow Up Boss credentials", async () => {
    const repository = {
      upsertWorkspaceCredential: vi.fn(),
    };
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({
      ok: false,
      status: 401,
      text: "Unauthorized",
    }));

    await expect(connectWorkspaceFollowUpBossIntegration({
      workspaceId: "workspace-1",
      request: {
        apiKey: "invalid-api-key",
        providerAccountName: "Follow Up Boss",
      },
      credentialSecret: "secret",
      repository,
      fetchImpl,
    })).rejects.toMatchObject({
      name: "FollowUpBossConnectionValidationError",
      result: {
        success: false,
        error: "Invalid Follow Up Boss API key",
        errorCode: "authentication_failed",
      },
    } satisfies Partial<FollowUpBossConnectionValidationError>);

    expect(repository.upsertWorkspaceCredential).not.toHaveBeenCalled();
  });
});
