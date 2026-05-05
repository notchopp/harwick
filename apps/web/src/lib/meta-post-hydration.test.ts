import { describe, expect, it, vi } from "vitest";
import { encryptCredential } from "./credentials";
import {
  createMetaSocialPostContextHydrator,
  hydrateMetaSocialPostContext,
  isSocialPostContextThin,
} from "./meta-post-hydration";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const credentialSecret = "super-secret-encryption-key";

describe("isSocialPostContextThin", () => {
  it("flags contexts with missing primary post fields", () => {
    expect(isSocialPostContextThin({
      caption: null,
      permalink: null,
      mediaType: null,
      ctaLabel: null,
      areasMentioned: [],
      listingHints: [],
    })).toBe(true);
  });

  it("accepts full contexts", () => {
    expect(isSocialPostContextThin({
      caption: "Houston listing",
      permalink: "https://instagram.example/p/abc",
      mediaType: "IMAGE",
      ctaLabel: "buyer blueprint",
      areasMentioned: ["Houston"],
      listingHints: ["pool"],
    })).toBe(false);
  });
});

describe("hydrateMetaSocialPostContext", () => {
  it("fetches post context with the stored Meta page token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        id: "ig-media-1",
        caption: "Houston new construction with Buyer Blueprint",
        permalink: "https://instagram.example/p/abc",
        media_type: "IMAGE",
      }),
      text: vi.fn().mockResolvedValue(""),
    });
    const encryptedCredentialRef = encryptCredential({
      userAccessToken: "user-token",
      pageAccessToken: "page-token",
      pageId: "page-1",
      instagramBusinessAccountId: "ig-1",
    }, credentialSecret);

    const context = await hydrateMetaSocialPostContext({
      workspaceId,
      providerAccountId: "ig-1",
      sourcePostId: "ig-media-1",
      sourceChannel: "instagram_comment",
      credentialSecret,
      fetchImpl,
      integrationRepository: {
        findConnectedCredential: () => Promise.resolve({
          workspaceId,
          providerAccountId: "ig-1",
          providerAccountIds: ["ig-1", "page-1"],
          encryptedCredentialRef,
        }),
      },
      existingContext: {
        workspaceId,
        provider: "meta",
        providerAccountId: "ig-1",
        sourcePostId: "ig-media-1",
        sourceChannel: "instagram_comment",
        caption: null,
        permalink: null,
        mediaType: null,
        mediaUrl: null,
        visualDescription: null,
        ctaLabel: null,
        areasMentioned: [],
        listingHints: [],
        fetchedAt: new Date().toISOString(),
        rawPayload: {},
      },
    });

    expect(context).toMatchObject({
      caption: "Houston new construction with Buyer Blueprint",
      permalink: "https://instagram.example/p/abc",
      mediaType: "IMAGE",
      ctaLabel: "buyer blueprint",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("keeps the original context when no connected credential exists", async () => {
    const originalContext = {
      workspaceId,
      provider: "meta" as const,
      providerAccountId: "ig-1",
      sourcePostId: "ig-media-1",
      sourceChannel: "instagram_comment" as const,
      caption: null,
      permalink: null,
      mediaType: null,
      mediaUrl: null,
      visualDescription: null,
      ctaLabel: null,
      areasMentioned: [],
      listingHints: [],
      fetchedAt: new Date().toISOString(),
      rawPayload: {},
    };

    await expect(hydrateMetaSocialPostContext({
      workspaceId,
      providerAccountId: "ig-1",
      sourcePostId: "ig-media-1",
      sourceChannel: "instagram_comment",
      credentialSecret,
      integrationRepository: {
        findConnectedCredential: () => Promise.resolve(null),
      },
      existingContext: originalContext,
    })).resolves.toEqual(originalContext);
  });
});

describe("createMetaSocialPostContextHydrator", () => {
  it("hydrates only thin contexts", async () => {
    const hydratedContext = {
      workspaceId,
      provider: "meta" as const,
      providerAccountId: "ig-1",
      sourcePostId: "ig-media-1",
      sourceChannel: "instagram_comment" as const,
      caption: "Houston listing",
      permalink: "https://instagram.example/p/abc",
      mediaType: "IMAGE",
      mediaUrl: null,
      visualDescription: null,
      ctaLabel: null,
      areasMentioned: ["Houston"],
      listingHints: [],
      fetchedAt: new Date().toISOString(),
      rawPayload: {},
    };
    const hydrator = createMetaSocialPostContextHydrator({
      credentialSecret,
      fetchImpl: vi.fn(),
      integrationRepository: {
        findConnectedCredential: vi.fn(),
      },
    });

    await expect(hydrator([
      hydratedContext,
    ])).resolves.toEqual([hydratedContext]);
  });
});
