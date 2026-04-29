import { describe, expect, it } from "vitest";
import {
  CompleteMetaOAuthSelectionRequestSchema,
  MetaConnectedCredentialSchema,
  MetaOAuthPendingSelectionPayloadSchema,
  StartMetaOAuthRequestSchema,
} from "./meta-oauth.js";

describe("StartMetaOAuthRequestSchema", () => {
  it("requires member-owned connects to include an owner member id", () => {
    expect(() => StartMetaOAuthRequestSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      accountScope: "member",
      ownerMemberId: null,
    })).toThrow("Member-scoped Meta OAuth requires ownerMemberId.");
  });
});

describe("MetaOAuthPendingSelectionPayloadSchema", () => {
  it("accepts staged selection payloads with multiple Meta accounts", () => {
    expect(MetaOAuthPendingSelectionPayloadSchema.parse({
      version: "meta_oauth_selection_v1",
      issuedAt: "2026-04-28T21:00:00.000Z",
      userAccessToken: "long-lived-user-token",
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
    }).accounts).toHaveLength(2);
  });
});

describe("CompleteMetaOAuthSelectionRequestSchema", () => {
  it("parses explicit Instagram account selections", () => {
    expect(CompleteMetaOAuthSelectionRequestSchema.parse({
      state: "oauth-state",
      instagramBusinessAccountId: "ig-1",
    }).instagramBusinessAccountId).toBe("ig-1");
  });
});

describe("MetaConnectedCredentialSchema", () => {
  it("parses encrypted Meta credential payloads", () => {
    expect(MetaConnectedCredentialSchema.parse({
      userAccessToken: "long-lived-user-token",
      pageAccessToken: "page-token-1",
      pageId: "page-1",
      instagramBusinessAccountId: "ig-1",
    }).pageId).toBe("page-1");
  });
});
