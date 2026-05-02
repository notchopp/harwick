import { describe, expect, it, vi } from "vitest";
import type { FollowUpBossTestConnectionResult } from "../../../../../../../features/integrations/follow-up-boss-test";
import { testFollowUpBossConnection } from "../../../../../../../features/integrations/follow-up-boss-test";
import { encryptCredential } from "../../../../../../../lib/credentials";

describe("testFollowUpBossConnection", () => {
  const secret = "test-encryption-secret";

  it("returns success when credential is valid", async () => {
    const apiKey = "valid-api-key";
    const encryptedRef = encryptCredential({ apiKey }, secret);

    const mockRepository = {
      findConnectedCredential: vi.fn().mockResolvedValue({
        integrationAccountId: "integration-1",
        workspaceId: "workspace-1",
        encryptedCredentialRef: encryptedRef,
      }),
    };

    // Mock fetch to simulate successful FUB API response
    const originalFetch = global.fetch;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ teams: [] }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    try {
      const result = await testFollowUpBossConnection({
        workspaceId: "workspace-1",
        credentialSecret: secret,
        repository: mockRepository,
      });

      expect(result).toEqual({
        success: true,
        message: "Successfully connected to Follow Up Boss",
      });

      expect(mockRepository.findConnectedCredential).toHaveBeenCalledWith("workspace-1");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns error when credential is not found", async () => {
    const mockRepository = {
      findConnectedCredential: vi.fn().mockResolvedValue(null),
    };

    const result = await testFollowUpBossConnection({
      workspaceId: "workspace-1",
      credentialSecret: secret,
      repository: mockRepository,
    });

    expect(result).toEqual({
      success: false,
      error: "No Follow Up Boss credential found for this workspace",
      errorCode: "credential_not_found",
    });
  });

  it("returns authentication error on 401 response", async () => {
    const apiKey = "invalid-api-key";
    const encryptedRef = encryptCredential({ apiKey }, secret);

    const mockRepository = {
      findConnectedCredential: vi.fn().mockResolvedValue({
        integrationAccountId: "integration-1",
        workspaceId: "workspace-1",
        encryptedCredentialRef: encryptedRef,
      }),
    };

    const originalFetch = global.fetch;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue("Unauthorized"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    try {
      const result = await testFollowUpBossConnection({
        workspaceId: "workspace-1",
        credentialSecret: secret,
        repository: mockRepository,
      });

      expect(result).toEqual({
        success: false,
        error: "Invalid Follow Up Boss API key",
        errorCode: "authentication_failed",
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns rate limit error on 429 response", async () => {
    const apiKey = "valid-api-key";
    const encryptedRef = encryptCredential({ apiKey }, secret);

    const mockRepository = {
      findConnectedCredential: vi.fn().mockResolvedValue({
        integrationAccountId: "integration-1",
        workspaceId: "workspace-1",
        encryptedCredentialRef: encryptedRef,
      }),
    };

    const originalFetch = global.fetch;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: vi.fn().mockResolvedValue("Too many requests"),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    try {
      const result = await testFollowUpBossConnection({
        workspaceId: "workspace-1",
        credentialSecret: secret,
        repository: mockRepository,
      });

      expect(result).toEqual({
        success: false,
        error: "Too many requests to Follow Up Boss API",
        errorCode: "rate_limited",
      });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns generic error for unexpected failures", async () => {
    const apiKey = "valid-api-key";
    const encryptedRef = encryptCredential({ apiKey }, secret);

    const mockRepository = {
      findConnectedCredential: vi.fn().mockResolvedValue({
        integrationAccountId: "integration-1",
        workspaceId: "workspace-1",
        encryptedCredentialRef: encryptedRef,
      }),
    };

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    try {
      const result = await testFollowUpBossConnection({
        workspaceId: "workspace-1",
        credentialSecret: secret,
        repository: mockRepository,
      });

      expect((result as FollowUpBossTestConnectionResult & { success: false }).success).toBe(false);
      expect((result as FollowUpBossTestConnectionResult & { success: false }).errorCode).toBe("connection_test_failed");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("returns error for invalid encrypted credential", async () => {
    const mockRepository = {
      findConnectedCredential: vi.fn().mockResolvedValue({
        integrationAccountId: "integration-1",
        workspaceId: "workspace-1",
        encryptedCredentialRef: "enc:v1:invalid-base64",
      }),
    };

    const result = await testFollowUpBossConnection({
      workspaceId: "workspace-1",
      credentialSecret: secret,
      repository: mockRepository,
    });

    expect((result as FollowUpBossTestConnectionResult & { success: false }).success).toBe(false);
    expect((result as FollowUpBossTestConnectionResult & { success: false }).errorCode).toBe("connection_test_failed");
  });
});
