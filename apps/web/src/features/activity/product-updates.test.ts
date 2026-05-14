import { describe, expect, it } from "vitest";
import { mapGitHubReleasesToProductUpdates } from "./product-updates";

describe("mapGitHubReleasesToProductUpdates", () => {
  it("maps structured GitHub releases into product updates", () => {
    const feed = mapGitHubReleasesToProductUpdates("notchopp/harwick", [
      {
        tag_name: "v0.1.3",
        name: "Patch 0.1.3",
        body: [
          "## Summary",
          "Harwick now keeps Meta comment replies on the original thread.",
          "",
          "## Highlights",
          "- [fix] Comment replies stay on the original public thread.",
          "- [ai] Harwick uses one Meta messaging transport tool internally.",
          "",
          "## Commit range",
          "abc1234...def5678",
          "",
          "Commits: 2",
        ].join("\n"),
        html_url: "https://github.com/notchopp/harwick/releases/tag/v0.1.3",
        published_at: "2026-05-11T12:00:00.000Z",
        created_at: "2026-05-11T12:00:00.000Z",
      },
    ]);

    expect(feed.updates[0]).toMatchObject({
      version: "0.1.3",
      kind: "patch",
      summary: "Harwick now keeps Meta comment replies on the original thread.",
      commitCount: 2,
      commitRange: "abc1234...def5678",
    });
    expect(feed.updates[0]?.highlights).toEqual([
      {
        category: "fix",
        text: "Comment replies stay on the original public thread.",
        customerVisible: true,
      },
      {
        category: "ai",
        text: "Harwick uses one Meta messaging transport tool internally.",
        customerVisible: true,
      },
    ]);
  });
});
