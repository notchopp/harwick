import {
  ProductUpdateFeedSchema,
  type ProductUpdateCategory,
  type ProductUpdateEntry,
  type ProductUpdateFeed,
  type ProductUpdateKind,
} from "@realty-ops/core";
import { z } from "zod";

const DEFAULT_UPDATES_REPOSITORY = "notchopp/harwick";
const GITHUB_API_BASE = "https://api.github.com";

export type ProductUpdateLoadResult = {
  feed: ProductUpdateFeed;
  error: string | null;
};

const GitHubReleaseSchema = z.object({
  tag_name: z.string().trim().min(1),
  name: z.string().trim().nullable(),
  body: z.string().nullable(),
  html_url: z.string().trim().url(),
  published_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

const GitHubReleaseListSchema = z.array(GitHubReleaseSchema);

function resolveRepository(): string {
  const explicitRepository = process.env["GITHUB_UPDATES_REPOSITORY"]?.trim();
  if (explicitRepository !== undefined && explicitRepository.length > 0) {
    return explicitRepository;
  }

  const githubRepository = process.env["GITHUB_REPOSITORY"]?.trim();
  if (githubRepository !== undefined && githubRepository.length > 0) {
    return githubRepository;
  }

  return DEFAULT_UPDATES_REPOSITORY;
}

function parseVersion(tagName: string): { version: string; kind: ProductUpdateKind } {
  const normalizedTag = tagName.replace(/^v/i, "");
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(normalizedTag);

  if (match?.groups === undefined) {
    return { version: normalizedTag, kind: "patch" };
  }

  const patch = Number(match.groups["patch"]);
  const minor = Number(match.groups["minor"]);

  if (patch > 0) {
    return { version: normalizedTag, kind: "patch" };
  }

  if (minor > 0) {
    return { version: normalizedTag, kind: "minor" };
  }

  return { version: normalizedTag, kind: "major" };
}

function normalizeCategory(value: string | undefined): ProductUpdateCategory {
  if (value === "feature" || value === "improvement" || value === "fix" || value === "ai" || value === "ops" || value === "internal") {
    return value;
  }

  return "improvement";
}

function extractSection(body: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`##\\s+${escapedHeading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i").exec(body);
  return match?.[1]?.trim() ?? null;
}

function extractSummary(body: string | null): string {
  if (body === null || body.trim().length === 0) {
    return "A new Harwick product update shipped.";
  }

  const structuredSummary = extractSection(body, "Summary");
  if (structuredSummary !== null && structuredSummary.length > 0) {
    return structuredSummary.replace(/\n+/g, " ").trim();
  }

  const fallbackLine = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("-"));

  return fallbackLine ?? "A new Harwick product update shipped.";
}

function extractHighlights(body: string | null): ProductUpdateEntry["highlights"] {
  if (body === null || body.trim().length === 0) {
    return [];
  }

  const highlightSection = extractSection(body, "Highlights") ?? body;
  return highlightSection
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .slice(0, 6)
    .map((line) => {
      const rawText = line.replace(/^- /, "").trim();
      const categoryMatch = /^\[(?<category>[^\]]+)\]\s*(?<text>.+)$/i.exec(rawText);

      return {
        category: normalizeCategory(categoryMatch?.groups?.["category"]?.toLowerCase()),
        text: categoryMatch?.groups?.["text"]?.trim() ?? rawText,
        customerVisible: normalizeCategory(categoryMatch?.groups?.["category"]?.toLowerCase()) !== "internal",
      };
    })
    .filter((highlight) => highlight.text.length > 0);
}

function extractCommitCount(body: string | null): number {
  if (body === null) {
    return 0;
  }

  const match = /Commits?\s*:\s*(?<count>\d+)/i.exec(body);
  return match?.groups?.["count"] === undefined ? 0 : Number(match.groups["count"]);
}

function extractCommitRange(body: string | null): string | null {
  if (body === null) {
    return null;
  }

  const section = extractSection(body, "Commit range");
  return section === null || section.length === 0 ? null : section.split(/\r?\n/)[0]?.trim() ?? null;
}

export function mapGitHubReleasesToProductUpdates(repository: string, releases: unknown): ProductUpdateFeed {
  const parsedReleases = GitHubReleaseListSchema.parse(releases);

  return ProductUpdateFeedSchema.parse({
    repository,
    generatedAt: new Date().toISOString(),
    updates: parsedReleases.map((release) => {
      const { version, kind } = parseVersion(release.tag_name);

      return {
        version,
        tagName: release.tag_name,
        title: release.name?.trim() || `${kind[0]?.toUpperCase() ?? ""}${kind.slice(1)} ${version}`,
        kind,
        publishedAt: release.published_at ?? release.created_at,
        summary: extractSummary(release.body),
        highlights: extractHighlights(release.body),
        compareUrl: null,
        htmlUrl: release.html_url,
        commitCount: extractCommitCount(release.body),
        commitRange: extractCommitRange(release.body),
      };
    }),
  });
}

export async function loadProductUpdates(params: { limit?: number } = {}): Promise<ProductUpdateLoadResult> {
  const repository = resolveRepository();
  const limit = Math.min(Math.max(params.limit ?? 4, 1), 10);
  const requestHeaders = new Headers({
    Accept: "application/vnd.github+json",
  });

  const githubToken = process.env["GITHUB_TOKEN"]?.trim();
  if (githubToken !== undefined && githubToken.length > 0) {
    requestHeaders.set("Authorization", `Bearer ${githubToken}`);
  }

  try {
    const response = await fetch(`${GITHUB_API_BASE}/repos/${repository}/releases?per_page=${limit}`, {
      headers: requestHeaders,
    });

    if (!response.ok) {
      return {
        feed: ProductUpdateFeedSchema.parse({
          repository,
          generatedAt: new Date().toISOString(),
          updates: [],
        }),
        error: `GitHub updates request failed with ${response.status}`,
      };
    }

    return {
      feed: mapGitHubReleasesToProductUpdates(repository, await response.json()),
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GitHub updates error";

    return {
      feed: ProductUpdateFeedSchema.parse({
        repository,
        generatedAt: new Date().toISOString(),
        updates: [],
      }),
      error: message,
    };
  }
}
