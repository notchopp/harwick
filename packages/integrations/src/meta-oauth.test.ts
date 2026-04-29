import { describe, expect, it, vi } from "vitest";
import { createMetaOAuthClient } from "./meta-oauth.js";

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

describe("createMetaOAuthClient", () => {
  it("exchanges OAuth code and lists Instagram business accounts", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createResponse({ access_token: "short-token" }))
      .mockResolvedValueOnce(createResponse({ access_token: "long-token" }))
      .mockResolvedValueOnce(createResponse({
        data: [
          {
            id: "page-1",
            name: "Houston Homes",
            access_token: "page-token",
            instagram_business_account: {
              id: "ig-1",
              username: "houstonhomes",
            },
          },
        ],
      }));
    const client = createMetaOAuthClient({
      appId: "app-id",
      appSecret: "app-secret",
      redirectUri: "https://app.example.com/api/meta/oauth/callback",
      fetchImpl,
    });

    await expect(client.exchangeCodeForAccessToken("code")).resolves.toBe("short-token");
    await expect(client.exchangeForLongLivedAccessToken("short-token")).resolves.toBe("long-token");
    await expect(client.listInstagramAccounts("long-token")).resolves.toEqual([
      {
        pageId: "page-1",
        pageName: "Houston Homes",
        pageAccessToken: "page-token",
        instagramBusinessAccountId: "ig-1",
        instagramUsername: "houstonhomes",
      },
    ]);
  });

  it("deduplicates and sorts Instagram business account options", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createResponse({
        data: [
          {
            id: "page-2",
            name: "Team Katy",
            access_token: "page-token-2",
            instagram_business_account: {
              id: "ig-2",
              username: "teamkaty",
            },
          },
          {
            id: "page-1",
            name: "Houston Homes",
            access_token: "page-token-1",
            instagram_business_account: {
              id: "ig-1",
              username: "houstonhomes",
            },
          },
          {
            id: "page-2-duplicate",
            name: "Team Katy Duplicate",
            access_token: "page-token-2b",
            instagram_business_account: {
              id: "ig-2",
              username: "teamkaty",
            },
          },
        ],
      }));
    const client = createMetaOAuthClient({
      appId: "app-id",
      appSecret: "app-secret",
      redirectUri: "https://app.example.com/api/meta/oauth/callback",
      fetchImpl,
    });

    await expect(client.listInstagramAccounts("long-token")).resolves.toEqual([
      {
        pageId: "page-1",
        pageName: "Houston Homes",
        pageAccessToken: "page-token-1",
        instagramBusinessAccountId: "ig-1",
        instagramUsername: "houstonhomes",
      },
      {
        pageId: "page-2-duplicate",
        pageName: "Team Katy Duplicate",
        pageAccessToken: "page-token-2b",
        instagramBusinessAccountId: "ig-2",
        instagramUsername: "teamkaty",
      },
    ]);
  });
});
