import { describe, expect, it, vi } from "vitest";
import { createMetaGraphClient } from "./meta-graph.js";

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

describe("createMetaGraphClient", () => {
  it("fetches Instagram media context", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({
      id: "ig-media-1",
      caption: "Houston new construction with Buyer Blueprint.",
      permalink: "https://instagram.example/p/abc",
      media_type: "CAROUSEL_ALBUM",
    }));
    const client = createMetaGraphClient({ fetchImpl });

    await expect(client.fetchPostContext({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      providerAccountId: "ig-account-1",
      sourcePostId: "ig-media-1",
      sourceChannel: "instagram_comment",
      accessToken: "page-token",
    })).resolves.toMatchObject({
      sourcePostId: "ig-media-1",
      sourceChannel: "instagram_comment",
      caption: "Houston new construction with Buyer Blueprint.",
      permalink: "https://instagram.example/p/abc",
      mediaType: "CAROUSEL_ALBUM",
      ctaLabel: "buyer blueprint",
    });
  });

  it("fetches Facebook post context", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({
      id: "fb-post-1",
      message: "Katy listing with pool and 4 bedrooms.",
      permalink_url: "https://facebook.example/posts/1",
      attachments: {
        data: [{ media_type: "album" }],
      },
    }));
    const client = createMetaGraphClient({ fetchImpl });

    await expect(client.fetchPostContext({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      providerAccountId: "fb-page-1",
      sourcePostId: "fb-post-1",
      sourceChannel: "facebook_comment",
      accessToken: "page-token",
    })).resolves.toMatchObject({
      sourcePostId: "fb-post-1",
      sourceChannel: "facebook_comment",
      caption: "Katy listing with pool and 4 bedrooms.",
      permalink: "https://facebook.example/posts/1",
      mediaType: "album",
    });
  });

  it("fetches a Meta account foundation snapshot", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(createResponse({
        id: "page-1",
        name: "Houston Homes",
        category: "Real Estate",
        link: "https://facebook.example/houstonhomes",
      }))
      .mockResolvedValueOnce(createResponse({
        id: "ig-1",
        username: "houstonhomes",
        name: "Houston Homes Team",
        biography: "Houston new construction and Katy buyers.",
        website: "https://houstonhomes.example.com",
        profile_picture_url: "https://cdn.example.com/profile.jpg",
        followers_count: 1200,
        follows_count: 345,
        media_count: 88,
      }))
      .mockResolvedValueOnce(createResponse({
        data: [
          {
            id: "post-1",
            caption: "Houston new construction with rate buy-downs.",
            permalink: "https://instagram.example/p/post-1",
            media_type: "IMAGE",
            timestamp: "2026-04-27T22:00:00+0000",
          },
        ],
      }));
    const client = createMetaGraphClient({ fetchImpl });

    await expect(client.fetchAccountFoundation({
      pageId: "page-1",
      instagramBusinessAccountId: "ig-1",
      accessToken: "page-token",
    })).resolves.toEqual({
      pageId: "page-1",
      pageName: "Houston Homes",
      pageCategory: "Real Estate",
      pageLinkUrl: "https://facebook.example/houstonhomes",
      instagramBusinessAccountId: "ig-1",
      instagramUsername: "houstonhomes",
      instagramDisplayName: "Houston Homes Team",
      biography: "Houston new construction and Katy buyers.",
      websiteUrl: "https://houstonhomes.example.com/",
      profilePhotoUrl: "https://cdn.example.com/profile.jpg",
      followerCount: 1200,
      followsCount: 345,
      mediaCount: 88,
      recentPosts: [
        {
          sourcePostId: "post-1",
          caption: "Houston new construction with rate buy-downs.",
          permalink: "https://instagram.example/p/post-1",
          mediaType: "IMAGE",
          publishedAt: "2026-04-27T22:00:00.000Z",
        },
      ],
    });
  });
});
