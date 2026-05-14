#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const PRODUCT_UPDATE_AI_MODEL = process.env["PRODUCT_UPDATES_AI_MODEL"]?.trim() || "gpt-4o-mini";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function runGit(args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }

  return result.stdout.trim();
}

function readPackageVersion() {
  const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
  return typeof packageJson.version === "string" && packageJson.version.length > 0 ? packageJson.version : "0.1.0";
}

function listSemverTags() {
  return runGit(["tag", "--list", "v*", "--sort=-v:refname"])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
}

function resolveHeadSha(explicitSha) {
  return explicitSha?.trim() || runGit(["rev-parse", "HEAD"]);
}

function listTagsPointingAtHead() {
  return runGit(["tag", "--points-at", "HEAD"])
    .split(/\r?\n/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function readCommitsSinceTag(tag, headSha) {
  const range = tag ? `${tag}..${headSha}` : headSha;
  const stdout = runGit(["log", range, "--format=%H%x1f%s"]);

  if (stdout.length === 0) {
    return [];
  }

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\u001f");
      return {
        sha,
        shortSha: sha.slice(0, 7),
        subject: subject?.trim() || "Untitled change",
      };
    });
}

function parseVersion(version) {
  const [major, minor, patch] = version.split(".").map((part) => Number(part));
  return { major, minor, patch };
}

function classifyCommit(subject) {
  const normalized = subject.trim();
  const lower = normalized.toLowerCase();

  if (/breaking change|^feat!|^fix!|!:/i.test(normalized)) {
    return { category: "feature", bump: "major", customerVisible: true };
  }

  if (/^(feat|feature|add|launch|introduce)(\(.+\))?:/i.test(normalized) || /\bnew\b|\blaunch\b/.test(lower)) {
    return { category: "feature", bump: "minor", customerVisible: true };
  }

  if (/^(fix|bugfix|repair)(\(.+\))?:/i.test(normalized) || /\bfix\b|\bfixed\b|\bbug\b|\bissue\b/.test(lower)) {
    return { category: "fix", bump: "patch", customerVisible: true };
  }

  if (/^(ai|assistant|model|prompt)(\(.+\))?:/i.test(normalized) || /\bharwick\b|\bprompt\b|\bmodel\b/.test(lower)) {
    return { category: "ai", bump: "patch", customerVisible: true };
  }

  if (/^(perf|performance|ux|ui|improve|polish)(\(.+\))?:/i.test(normalized) || /\bux\b|\bui\b|\bimprov/.test(lower)) {
    return { category: "improvement", bump: "patch", customerVisible: true };
  }

  if (/^(ops|infra|deploy|release|workflow|ci)(\(.+\))?:/i.test(normalized)) {
    return { category: "ops", bump: "patch", customerVisible: true };
  }

  if (/^(chore|refactor|docs|test|build)(\(.+\))?:/i.test(normalized)) {
    return { category: "internal", bump: "none", customerVisible: false };
  }

  return { category: "improvement", bump: "patch", customerVisible: true };
}

function nextVersionFrom(version, bump) {
  const current = parseVersion(version);

  if (bump === "major") {
    return `${current.major + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${current.major}.${current.minor + 1}.0`;
  }

  return `${current.major}.${current.minor}.${current.patch + 1}`;
}

function highestBump(commits) {
  if (commits.some((commit) => commit.classification.bump === "major")) {
    return "major";
  }

  if (commits.some((commit) => commit.classification.bump === "minor")) {
    return "minor";
  }

  if (commits.some((commit) => commit.classification.bump === "patch")) {
    return "patch";
  }

  return "none";
}

function summarizeSubject(subject) {
  return subject
    .replace(/^[a-z]+(\(.+\))?!?:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackSummary(visibleCommits, kind) {
  const topSubjects = visibleCommits.slice(0, 2).map((commit) => summarizeSubject(commit.subject));

  if (topSubjects.length === 0) {
    return `Harwick shipped a ${kind} update.`;
  }

  if (topSubjects.length === 1) {
    return `${topSubjects[0]}.`;
  }

  return `${topSubjects[0]}, plus ${topSubjects[1].charAt(0).toLowerCase()}${topSubjects[1].slice(1)}.`;
}

async function maybeBuildAiSummary({ version, kind, visibleCommits }) {
  const apiKey = process.env["OPENAI_API_KEY"]?.trim();
  if (apiKey === undefined || apiKey.length === 0 || visibleCommits.length === 0) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: PRODUCT_UPDATE_AI_MODEL,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You write concise software release notes. Use only the provided commit subjects. Do not mention code internals, files, or implementation details. Return strict JSON with title, summary, and highlights.",
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: JSON.stringify({
                  version,
                  kind,
                  commits: visibleCommits.map((commit) => ({
                    category: commit.classification.category,
                    subject: summarizeSubject(commit.subject),
                  })),
                }),
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "product_update_summary",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                title: { type: "string" },
                summary: { type: "string" },
                highlights: {
                  type: "array",
                  maxItems: 5,
                  items: { type: "string" },
                },
              },
              required: ["title", "summary", "highlights"],
            },
          },
        },
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const text = typeof payload.output_text === "string" ? payload.output_text : "";
    if (text.length === 0) {
      return null;
    }

    const parsed = JSON.parse(text);
    if (typeof parsed.title !== "string" || typeof parsed.summary !== "string" || !Array.isArray(parsed.highlights)) {
      return null;
    }

    return {
      title: parsed.title.trim(),
      summary: parsed.summary.trim(),
      highlights: parsed.highlights.map((item) => String(item).trim()).filter(Boolean).slice(0, 5),
    };
  } catch {
    return null;
  }
}

function buildReleaseTitle(kind, version, aiTitle) {
  if (typeof aiTitle === "string" && aiTitle.trim().length > 0) {
    return aiTitle.trim();
  }

  return `${kind.charAt(0).toUpperCase()}${kind.slice(1)} ${version}`;
}

function buildHighlights(visibleCommits, aiHighlights) {
  if (Array.isArray(aiHighlights) && aiHighlights.length > 0) {
    return aiHighlights.map((text, index) => ({
      category: visibleCommits[index]?.classification.category ?? "improvement",
      text,
      customerVisible: true,
    }));
  }

  return visibleCommits.slice(0, 5).map((commit) => ({
    category: commit.classification.category,
    text: summarizeSubject(commit.subject),
    customerVisible: commit.classification.customerVisible,
  }));
}

function buildMarkdown({ summary, highlights, commitRange, commitCount, compareUrl, headSha }) {
  const lines = [
    "## Summary",
    summary,
    "",
    "## Highlights",
    ...highlights.map((highlight) => `- [${highlight.category}] ${highlight.text}`),
    "",
    "## Commit range",
    commitRange,
    "",
    `Commits: ${commitCount}`,
    `Head SHA: ${headSha.slice(0, 7)}`,
  ];

  if (compareUrl) {
    lines.push(`Compare: ${compareUrl}`);
  }

  return `${lines.join("\n")}\n`;
}

function ensureParentDirectory(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeOptionalFile(filePath, contents) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return;
  }

  const absolutePath = resolve(process.cwd(), filePath);
  ensureParentDirectory(absolutePath);
  writeFileSync(absolutePath, contents, "utf8");
}

function writeGitHubOutput(filePath, values) {
  if (typeof filePath !== "string" || filePath.trim().length === 0) {
    return;
  }

  const absolutePath = resolve(process.cwd(), filePath);
  ensureParentDirectory(absolutePath);

  const lines = Object.entries(values).flatMap(([key, value]) => {
    const normalized = String(value ?? "");
    if (normalized.includes("\n")) {
      return [`${key}<<EOF`, normalized, "EOF"];
    }

    return [`${key}=${normalized}`];
  });

  writeFileSync(absolutePath, `${lines.join("\n")}\n`, { encoding: "utf8", flag: "a" });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repository = args["repo"]?.trim() || process.env["GITHUB_REPOSITORY"]?.trim() || "notchopp/harwick";
  const headSha = resolveHeadSha(args["sha"]);
  const currentTags = listTagsPointingAtHead().filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));
  const releaseAlreadyExists = currentTags.length > 0;
  const tags = listSemverTags();
  const latestTag = tags.find((tag) => !currentTags.includes(tag)) ?? tags[0] ?? null;
  const commits = readCommitsSinceTag(latestTag, headSha).map((commit) => ({
    ...commit,
    classification: classifyCommit(commit.subject),
  }));
  const visibleCommits = commits.filter((commit) => commit.classification.customerVisible);
  const bump = highestBump(visibleCommits);
  const shouldRelease = !releaseAlreadyExists && bump !== "none" && visibleCommits.length > 0;
  const baseVersion = latestTag ? latestTag.replace(/^v/i, "") : readPackageVersion();
  const nextVersion = nextVersionFrom(baseVersion, bump === "none" ? "patch" : bump);
  const tagName = `v${nextVersion}`;
  const compareUrl = latestTag === null ? null : `https://github.com/${repository}/compare/${latestTag}...${tagName}`;
  const commitRange = latestTag === null ? `${headSha.slice(0, 7)}` : `${latestTag}...${headSha.slice(0, 7)}`;

  const aiSummary = shouldRelease
    ? await maybeBuildAiSummary({ version: nextVersion, kind: bump, visibleCommits })
    : null;

  const releaseTitle = buildReleaseTitle(bump === "none" ? "patch" : bump, nextVersion, aiSummary?.title);
  const summary = aiSummary?.summary || buildFallbackSummary(visibleCommits, bump === "none" ? "patch" : bump);
  const highlights = buildHighlights(visibleCommits, aiSummary?.highlights);
  const markdown = buildMarkdown({
    summary,
    highlights,
    commitRange,
    commitCount: visibleCommits.length,
    compareUrl,
    headSha,
  });

  const update = {
    repository,
    generatedAt: new Date().toISOString(),
    updates: shouldRelease ? [{
      version: nextVersion,
      tagName,
      title: releaseTitle,
      kind: bump === "none" ? "patch" : bump,
      publishedAt: new Date().toISOString(),
      summary,
      highlights,
      compareUrl,
      htmlUrl: `https://github.com/${repository}/releases/tag/${tagName}`,
      commitCount: visibleCommits.length,
      commitRange,
    }] : [],
  };

  writeOptionalFile(args["json-output"], `${JSON.stringify(update, null, 2)}\n`);
  writeOptionalFile(args["markdown-output"], markdown);
  writeGitHubOutput(args["github-output"], {
    should_release: shouldRelease,
    release_title: releaseTitle,
    release_summary: summary,
    release_version: nextVersion,
    tag_name: tagName,
  });

  process.stdout.write(`${JSON.stringify({
    shouldRelease,
    tagName,
    releaseTitle,
    visibleCommitCount: visibleCommits.length,
  }, null, 2)}\n`);
}

await main();
