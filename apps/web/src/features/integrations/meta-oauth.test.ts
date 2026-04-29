import { describe, expect, it, vi } from "vitest";
import { decryptCredential, encryptCredential } from "../../lib/credentials";
import {
  completeMetaOAuthSelection,
  getPendingMetaOAuthSelection,
  handleMetaOAuthCallback,
  type MetaOAuthConnectedHandler,
  startMetaOAuth,
  type MetaOAuthRepository,
} from "./meta-oauth";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const ownerMemberId = "123e4567-e89b-12d3-a456-426614174001";
const credentialSecret = "change-me-to-a-long-random-secret";

type ConnectIntegrationParams = {
  oauthState: string;
  providerAccountId: string;
  providerAccountIds: string[];
  providerAccountName: string | null;
  encryptedCredentialRef: string;
};

type PendingSelectionStageParams = {
  oauthState: string;
  encryptedCredentialRef: string;
};

function createRepository(overrides: Partial<MetaOAuthRepository> = {}): MetaOAuthRepository {
  return {
    createPendingIntegration: vi.fn().mockResolvedValue(undefined),
    connectIntegration: vi.fn().mockResolvedValue({
      integrationAccountId: "123e4567-e89b-12d3-a456-426614174010",
      workspaceId,
      accountScope: "member",
      ownerMemberId,
      providerAccountId: "ig-1",
      providerAccountIds: ["ig-1", "page-1"],
      providerAccountName: "houstonhomes",
    }),
    stagePendingIntegrationSelection: vi.fn().mockResolvedValue(true),
    findPendingIntegrationSelection: vi.fn().mockResolvedValue(null),
    clearPendingIntegrationSelection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("startMetaOAuth", () => {
  it("creates a member-scoped pending integration and returns an authorization URL", async () => {
    let createdPendingIntegration: {
      workspaceId: string;
      accountScope: "workspace" | "member";
      ownerMemberId: string | null;
      oauthState: string;
    } | null = null;
    const createPendingIntegration = vi.fn((params: {
      workspaceId: string;
      accountScope: "workspace" | "member";
      ownerMemberId: string | null;
      oauthState: string;
    }) => {
      createdPendingIntegration = params;
      return Promise.resolve();
    });
    const repository = createRepository({
      createPendingIntegration,
    });

    const response = await startMetaOAuth({
      request: {
        workspaceId,
        accountScope: "member",
        ownerMemberId,
      },
      appId: "meta-app-id",
      redirectUri: "https://app.example.com/api/meta/oauth/callback",
      repository,
    });

    expect(response.status).toBe(200);
    expect(response.body.authorizationUrl).toContain("https://www.facebook.com");
    expect(createPendingIntegration).toHaveBeenCalledTimes(1);
    expect(createdPendingIntegration).toEqual(expect.objectContaining({
      workspaceId,
      accountScope: "member",
      ownerMemberId,
    }));
  });
});

describe("handleMetaOAuthCallback", () => {
  it("connects the only returned Instagram account", async () => {
    const connectedIntegration = {
      current: null as ConnectIntegrationParams | null,
    };
    const connectIntegration = vi.fn((params: ConnectIntegrationParams) => {
      connectedIntegration.current = params;
      return Promise.resolve({
        integrationAccountId: "123e4567-e89b-12d3-a456-426614174010",
        workspaceId,
        accountScope: "member" as const,
        ownerMemberId,
        providerAccountId: params.providerAccountId,
        providerAccountIds: params.providerAccountIds,
        providerAccountName: params.providerAccountName,
      });
    });
    const stagePendingIntegrationSelection = vi.fn().mockResolvedValue(true);
    const onConnected = vi.fn<MetaOAuthConnectedHandler>().mockResolvedValue(undefined);
    const repository = createRepository({
      connectIntegration,
      stagePendingIntegrationSelection,
    });
    const response = await handleMetaOAuthCallback({
      query: {
        state: "oauth-state",
        code: "oauth-code",
      },
      oauthClient: {
        exchangeCodeForAccessToken: vi.fn().mockResolvedValue("short-token"),
        exchangeForLongLivedAccessToken: vi.fn().mockResolvedValue("long-token"),
        listInstagramAccounts: vi.fn().mockResolvedValue([
          {
            pageId: "page-1",
            pageName: "Houston Homes",
            pageAccessToken: "page-token-1",
            instagramBusinessAccountId: "ig-1",
            instagramUsername: "houstonhomes",
          },
        ]),
      },
      repository,
      credentialSecret,
      appBaseUrl: "https://app.example.com",
      onConnected,
    });

    expect(response).toEqual({
      status: 302,
      body: {
        redirectUrl: "https://app.example.com/?meta_oauth=connected",
      },
    });
    expect(stagePendingIntegrationSelection).not.toHaveBeenCalled();
    expect(connectIntegration).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledTimes(1);
    const callbackArgs = onConnected.mock.calls[0]?.[0];
    if (callbackArgs === undefined) {
      throw new Error("Expected onConnected payload.");
    }
    expect(callbackArgs.connectedIntegration.workspaceId).toBe(workspaceId);
    expect(callbackArgs.connectedAccount.instagramBusinessAccountId).toBe("ig-1");
    expect(callbackArgs.connectedCredential.pageId).toBe("page-1");
    const connectedCredentialRef = connectedIntegration.current?.encryptedCredentialRef;
    if (connectedCredentialRef === undefined) {
      throw new Error("Expected connectIntegration payload.");
    }
    expect(decryptCredential<{
      userAccessToken: string;
      pageAccessToken: string;
      pageId: string;
      instagramBusinessAccountId: string;
    }>(
      connectedCredentialRef,
      credentialSecret,
    )).toEqual({
      userAccessToken: "long-token",
      pageAccessToken: "page-token-1",
      pageId: "page-1",
      instagramBusinessAccountId: "ig-1",
    });
  });

  it("stages explicit selection when Meta returns multiple account options", async () => {
    const stagedSelection = {
      current: null as PendingSelectionStageParams | null,
    };
    const stagePendingIntegrationSelection = vi.fn((params: PendingSelectionStageParams) => {
      stagedSelection.current = params;
      return Promise.resolve(true);
    });
    const connectIntegration = vi.fn().mockResolvedValue(true);
    const repository = createRepository({
      stagePendingIntegrationSelection,
      connectIntegration,
    });
    const response = await handleMetaOAuthCallback({
      query: {
        state: "oauth-state",
        code: "oauth-code",
      },
      oauthClient: {
        exchangeCodeForAccessToken: vi.fn().mockResolvedValue("short-token"),
        exchangeForLongLivedAccessToken: vi.fn().mockResolvedValue("long-token"),
        listInstagramAccounts: vi.fn().mockResolvedValue([
          {
            pageId: "page-1",
            pageName: "Houston Homes",
            pageAccessToken: "page-token-1",
            instagramBusinessAccountId: "ig-1",
            instagramUsername: "houstonhomes",
          },
          {
            pageId: "page-2",
            pageName: "Katy Listings",
            pageAccessToken: "page-token-2",
            instagramBusinessAccountId: "ig-2",
            instagramUsername: "katylistings",
          },
        ]),
      },
      repository,
      credentialSecret,
      appBaseUrl: "https://app.example.com",
      now: new Date("2026-04-28T21:00:00.000Z"),
    });

    expect(response).toEqual({
      status: 302,
      body: {
        redirectUrl: "https://app.example.com/?meta_oauth=selection_required&state=oauth-state",
      },
    });
    expect(connectIntegration).not.toHaveBeenCalled();
    const stagedSelectionCredentialRef = stagedSelection.current?.encryptedCredentialRef;
    if (stagedSelectionCredentialRef === undefined) {
      throw new Error("Expected stagePendingIntegrationSelection payload.");
    }
    expect(decryptCredential<{
      version: string;
      issuedAt: string;
      userAccessToken: string;
      accounts: Array<{ instagramBusinessAccountId: string }>;
    }>(
      stagedSelectionCredentialRef,
      credentialSecret,
    )).toEqual(expect.objectContaining({
      version: "meta_oauth_selection_v1",
      issuedAt: "2026-04-28T21:00:00.000Z",
      userAccessToken: "long-token",
      accounts: [
        expect.objectContaining({ instagramBusinessAccountId: "ig-1" }),
        expect.objectContaining({ instagramBusinessAccountId: "ig-2" }),
      ],
    }));
  });
});

describe("getPendingMetaOAuthSelection", () => {
  it("returns safe account options for a staged selection", async () => {
    const findPendingIntegrationSelection = vi.fn().mockResolvedValue({
      encryptedCredentialRef: encryptCredential({
        version: "meta_oauth_selection_v1",
        issuedAt: "2026-04-28T21:00:00.000Z",
        userAccessToken: "long-token",
        accounts: [
          {
            pageId: "page-1",
            pageName: "Houston Homes",
            pageAccessToken: "page-token-1",
            instagramBusinessAccountId: "ig-1",
            instagramUsername: "houstonhomes",
          },
        ],
      }, credentialSecret),
    });
    const repository = createRepository({
      findPendingIntegrationSelection,
    });

    const response = await getPendingMetaOAuthSelection({
      query: { state: "oauth-state" },
      repository,
      credentialSecret,
      now: new Date("2026-04-28T21:10:00.000Z"),
    });

    expect(response).toEqual({
      status: 200,
      body: {
        state: "oauth-state",
        accounts: [
          {
            pageId: "page-1",
            pageName: "Houston Homes",
            instagramBusinessAccountId: "ig-1",
            instagramUsername: "houstonhomes",
          },
        ],
      },
    });
    expect(findPendingIntegrationSelection).toHaveBeenCalledWith({
      oauthState: "oauth-state",
    });
  });

  it("expires stale staged selections and clears the pending secret", async () => {
    const clearPendingIntegrationSelection = vi.fn().mockResolvedValue(undefined);
    const repository = createRepository({
      findPendingIntegrationSelection: vi.fn().mockResolvedValue({
        encryptedCredentialRef: encryptCredential({
          version: "meta_oauth_selection_v1",
          issuedAt: "2026-04-28T20:00:00.000Z",
          userAccessToken: "long-token",
          accounts: [
            {
              pageId: "page-1",
              pageName: "Houston Homes",
              pageAccessToken: "page-token-1",
              instagramBusinessAccountId: "ig-1",
              instagramUsername: "houstonhomes",
            },
          ],
        }, credentialSecret),
      }),
      clearPendingIntegrationSelection,
    });

    const response = await getPendingMetaOAuthSelection({
      query: { state: "oauth-state" },
      repository,
      credentialSecret,
      now: new Date("2026-04-28T21:00:01.000Z"),
      pendingSelectionMaxAgeMs: 15 * 60 * 1000,
    });

    expect(response).toEqual({
      status: 410,
      body: { error: "selection_expired" },
    });
    expect(clearPendingIntegrationSelection).toHaveBeenCalledWith({
      oauthState: "oauth-state",
    });
  });
});

describe("completeMetaOAuthSelection", () => {
  it("finalizes the chosen Instagram business account", async () => {
    const connectIntegration = vi.fn().mockResolvedValue({
      integrationAccountId: "123e4567-e89b-12d3-a456-426614174010",
      workspaceId,
      accountScope: "member",
      ownerMemberId,
      providerAccountId: "ig-2",
      providerAccountIds: ["ig-2", "page-2"],
      providerAccountName: "katylistings",
    });
    const onConnected = vi.fn<MetaOAuthConnectedHandler>().mockResolvedValue(undefined);
    const repository = createRepository({
      findPendingIntegrationSelection: vi.fn().mockResolvedValue({
        encryptedCredentialRef: encryptCredential({
          version: "meta_oauth_selection_v1",
          issuedAt: "2026-04-28T21:00:00.000Z",
          userAccessToken: "long-token",
          accounts: [
            {
              pageId: "page-1",
              pageName: "Houston Homes",
              pageAccessToken: "page-token-1",
              instagramBusinessAccountId: "ig-1",
              instagramUsername: "houstonhomes",
            },
            {
              pageId: "page-2",
              pageName: "Katy Listings",
              pageAccessToken: "page-token-2",
              instagramBusinessAccountId: "ig-2",
              instagramUsername: "katylistings",
            },
          ],
        }, credentialSecret),
      }),
      connectIntegration,
    });

    const response = await completeMetaOAuthSelection({
      request: {
        state: "oauth-state",
        instagramBusinessAccountId: "ig-2",
      },
      repository,
      credentialSecret,
      now: new Date("2026-04-28T21:05:00.000Z"),
      onConnected,
    });

    expect(response).toEqual({
      status: 200,
      body: { status: "connected" },
    });
    expect(connectIntegration).toHaveBeenCalledWith(expect.objectContaining({
      oauthState: "oauth-state",
      providerAccountId: "ig-2",
      providerAccountIds: ["ig-2", "page-2"],
      providerAccountName: "katylistings",
    }));
    expect(onConnected).toHaveBeenCalledTimes(1);
    const selectionArgs = onConnected.mock.calls[0]?.[0];
    if (selectionArgs === undefined) {
      throw new Error("Expected onConnected payload.");
    }
    expect(selectionArgs.connectedAccount.instagramBusinessAccountId).toBe("ig-2");
    expect(selectionArgs.connectedCredential.instagramBusinessAccountId).toBe("ig-2");
  });
});
