import { describe, expect, it } from "vitest";
import { ProductUpdateFeedSchema } from "./product-update.js";

describe("ProductUpdateFeedSchema", () => {
  it("parses a structured product update feed", () => {
    const result = ProductUpdateFeedSchema.parse({
      repository: "notchopp/harwick",
      generatedAt: "2026-05-11T12:00:00.000Z",
      updates: [
        {
          version: "0.1.3",
          tagName: "v0.1.3",
          title: "Patch 0.1.3",
          kind: "patch",
          publishedAt: "2026-05-11T12:00:00.000Z",
          summary: "Harwick now keeps public replies on the original Meta comment thread.",
          highlights: [
            {
              category: "fix",
              text: "Comment replies stay attached to the original comment thread.",
            },
          ],
          compareUrl: "https://github.com/notchopp/harwick/compare/v0.1.2...v0.1.3",
          htmlUrl: "https://github.com/notchopp/harwick/releases/tag/v0.1.3",
          commitCount: 2,
          commitRange: "abc1234...def5678",
        },
      ],
    });

    expect(result.updates[0]?.highlights[0]?.customerVisible).toBe(true);
  });
});
