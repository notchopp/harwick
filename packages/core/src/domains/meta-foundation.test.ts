import { describe, expect, it } from "vitest";
import { MetaAccountFoundationSchema } from "./meta-foundation.js";

describe("MetaAccountFoundationSchema", () => {
  it("requires member-scoped foundations to carry an owner member id", () => {
    expect(() => MetaAccountFoundationSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      integrationAccountId: "123e4567-e89b-12d3-a456-426614174001",
      accountScope: "member",
      ownerMemberId: null,
      provider: "meta",
      providerAccountId: "ig-1",
      pageId: "page-1",
      pageName: "Houston Homes",
      pageCategory: null,
      pageLinkUrl: null,
      instagramBusinessAccountId: "ig-1",
      instagramUsername: "houstonhomes",
      instagramDisplayName: null,
      biography: null,
      websiteUrl: null,
      profilePhotoUrl: null,
      followerCount: null,
      followsCount: null,
      mediaCount: null,
      areasMentioned: [],
      listingHints: [],
      recentPosts: [],
      lastFetchedAt: "2026-04-28T22:00:00.000Z",
    })).toThrow("Member-scoped Meta foundations require ownerMemberId.");
  });

  it("accepts bounded recent post snapshots", () => {
    expect(MetaAccountFoundationSchema.parse({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      integrationAccountId: "123e4567-e89b-12d3-a456-426614174001",
      accountScope: "workspace",
      ownerMemberId: null,
      provider: "meta",
      providerAccountId: "ig-1",
      pageId: "page-1",
      pageName: "Houston Homes",
      pageCategory: "Real Estate",
      pageLinkUrl: "https://facebook.example/houstonhomes",
      instagramBusinessAccountId: "ig-1",
      instagramUsername: "houstonhomes",
      instagramDisplayName: "Houston Homes",
      biography: "Houston new construction and first-time buyer help.",
      websiteUrl: "https://houstonhomes.example.com",
      profilePhotoUrl: "https://cdn.example.com/houstonhomes.jpg",
      followerCount: 1500,
      followsCount: 420,
      mediaCount: 88,
      areasMentioned: ["Houston"],
      listingHints: ["new construction"],
      recentPosts: [
        {
          sourcePostId: "post-1",
          caption: "Houston new construction with rate buy-downs.",
          permalink: "https://instagram.example/p/post-1",
          mediaType: "IMAGE",
          publishedAt: "2026-04-27T22:00:00.000Z",
        },
      ],
      lastFetchedAt: "2026-04-28T22:00:00.000Z",
    }).recentPosts).toHaveLength(1);
  });
});
