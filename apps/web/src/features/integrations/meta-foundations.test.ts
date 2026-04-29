import { describe, expect, it, vi } from "vitest";
import { createLogger } from "@realty-ops/core";
import { bootstrapMetaAccountFoundation } from "./meta-foundations";

const connectedIntegration = {
  integrationAccountId: "123e4567-e89b-12d3-a456-426614174100",
  workspaceId: "123e4567-e89b-12d3-a456-426614174000",
  accountScope: "member" as const,
  ownerMemberId: "123e4567-e89b-12d3-a456-426614174001",
  providerAccountId: "ig-1",
  providerAccountIds: ["ig-1", "page-1"],
  providerAccountName: "houstonhomes",
};

const connectedAccount = {
  pageId: "page-1",
  pageName: "Houston Homes",
  pageAccessToken: "page-token",
  instagramBusinessAccountId: "ig-1",
  instagramUsername: "houstonhomes",
};

const connectedCredential = {
  userAccessToken: "user-token",
  pageAccessToken: "page-token",
  pageId: "page-1",
  instagramBusinessAccountId: "ig-1",
};

describe("bootstrapMetaAccountFoundation", () => {
  it("persists an enriched account foundation snapshot", async () => {
    const repository = {
      upsertFoundation: vi.fn().mockResolvedValue(undefined),
      findFoundation: vi.fn().mockResolvedValue(null),
    };

    const foundation = await bootstrapMetaAccountFoundation({
      connectedIntegration,
      connectedAccount,
      connectedCredential,
      graphClient: {
        fetchAccountFoundation: vi.fn().mockResolvedValue({
          pageId: "page-1",
          pageName: "Houston Homes",
          pageCategory: "Real Estate",
          pageLinkUrl: "https://facebook.example/houstonhomes",
          instagramBusinessAccountId: "ig-1",
          instagramUsername: "houstonhomes",
          instagramDisplayName: "Houston Homes Team",
          biography: "Houston new construction and Katy buyers.",
          websiteUrl: "https://houstonhomes.example.com",
          profilePhotoUrl: "https://cdn.example.com/profile.jpg",
          followerCount: 1200,
          followsCount: 345,
          mediaCount: 88,
          recentPosts: [
            {
              sourcePostId: "post-1",
              caption: "Katy listing with pool and Houston new construction.",
              permalink: "https://instagram.example/p/post-1",
              mediaType: "IMAGE",
              publishedAt: "2026-04-27T22:00:00.000Z",
            },
          ],
        }),
      },
      repository,
      logger: createLogger({
        service: "test",
        environment: "development",
        write: vi.fn(),
      }),
      now: new Date("2026-04-28T22:00:00.000Z"),
    });

    expect(repository.upsertFoundation).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: connectedIntegration.workspaceId,
      integrationAccountId: connectedIntegration.integrationAccountId,
      accountScope: "member",
      ownerMemberId: connectedIntegration.ownerMemberId,
      pageCategory: "Real Estate",
      instagramDisplayName: "Houston Homes Team",
      areasMentioned: ["Houston", "Katy"],
    }));
    expect(foundation.listingHints).toContain("pool");
  });

  it("falls back to the OAuth snapshot when Graph enrichment fails", async () => {
    const warnings: string[] = [];
    const repository = {
      upsertFoundation: vi.fn().mockResolvedValue(undefined),
      findFoundation: vi.fn().mockResolvedValue(null),
    };

    const foundation = await bootstrapMetaAccountFoundation({
      connectedIntegration: {
        ...connectedIntegration,
        accountScope: "workspace",
        ownerMemberId: null,
      },
      connectedAccount,
      connectedCredential,
      graphClient: {
        fetchAccountFoundation: vi.fn().mockRejectedValue(new Error("graph failed")),
      },
      repository,
      logger: createLogger({
        service: "test",
        environment: "development",
        write(_level, line) {
          warnings.push(line);
        },
      }),
      now: new Date("2026-04-28T22:00:00.000Z"),
    });

    expect(foundation.pageName).toBe("Houston Homes");
    expect(foundation.pageCategory).toBeNull();
    expect(foundation.recentPosts).toEqual([]);
    expect(warnings.some((line) => line.includes("meta foundation bootstrap fell back to oauth snapshot"))).toBe(true);
  });
});
