import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PRODUCTION_REQUIRED_ALTERNATIVES,
  PRODUCTION_REQUIRED_ENVIRONMENT_NAMES,
} from "./audit-vercel-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

export const DEFAULT_SOURCE_ENV_FILES = [
  path.resolve(repoRoot, ".env"),
  path.resolve(repoRoot, ".env.local"),
  path.resolve(repoRoot, ".env.production"),
  path.resolve(repoRoot, ".env.prod.tmp"),
  path.resolve(repoRoot, "..", "receptionist-dashboard", ".env.local"),
  path.resolve(repoRoot, "..", "receptionist-dashboard", ".env.pulled"),
  path.resolve(repoRoot, "..", "receptionist-dashboard", ".env.vercel.live"),
  path.resolve(repoRoot, "..", "receptionist-dashboard", ".env.dashboard-check"),
];

export const LOCAL_ENV_ALIASES = {
  GOOGLE_CALENDAR_CLIENT_ID: ["GOOGLE_CLIENT_ID"],
  GOOGLE_CALENDAR_CLIENT_SECRET: ["GOOGLE_CLIENT_SECRET"],
  TWILIO_PHONE_NUMBER: ["TWILIO_SHARED_NUMBER"],
  STRIPE_SOLO_MONTHLY_PRICE_ID: ["STRIPE_PRICE_SOLO"],
  STRIPE_TEAM_MONTHLY_PRICE_ID: ["STRIPE_PRICE_SCALE"],
  AGENT_RECONCILE_CRON_SECRET: ["CRON_SECRET"],
};

function normalizePathForReport(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return relative.startsWith("..")
    ? relative.replaceAll(path.sep, "/")
    : relative.replaceAll(path.sep, "/");
}

export function parseEnvFileNames(contents) {
  const names = new Set();
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match !== null) {
      names.add(match[1]);
    }
  }
  return names;
}

export function collectLocalEnvSourceNames(files) {
  const sourcesByName = new Map();

  for (const file of files) {
    if (!fs.existsSync(file)) {
      continue;
    }

    const names = parseEnvFileNames(fs.readFileSync(file, "utf8"));
    for (const name of names) {
      const sources = sourcesByName.get(name) ?? [];
      sources.push(normalizePathForReport(file));
      sourcesByName.set(name, sources);
    }
  }

  return sourcesByName;
}

function findSources(sourcesByName, names) {
  const matches = [];
  for (const name of names) {
    const sources = sourcesByName.get(name);
    if (sources !== undefined) {
      matches.push({ name, sources });
    }
  }
  return matches;
}

export function auditLocalLaunchEnvSources(options = {}) {
  const files = options.files ?? DEFAULT_SOURCE_ENV_FILES;
  const requiredNames = options.requiredNames ?? PRODUCTION_REQUIRED_ENVIRONMENT_NAMES;
  const requiredAlternatives = options.requiredAlternatives ?? PRODUCTION_REQUIRED_ALTERNATIVES;
  const aliases = options.aliases ?? LOCAL_ENV_ALIASES;
  const sourcesByName = options.sourcesByName ?? collectLocalEnvSourceNames(files);

  const required = requiredNames.map((name) => {
    const exact = findSources(sourcesByName, [name]);
    const alias = findSources(sourcesByName, aliases[name] ?? []);
    return {
      name,
      status: exact.length > 0 ? "exact" : alias.length > 0 ? "alias" : "missing",
      exact,
      alias,
    };
  });

  const alternatives = requiredAlternatives.map((group) => {
    const exact = findSources(sourcesByName, group.names);
    const alias = findSources(sourcesByName, group.names.flatMap((name) => aliases[name] ?? []));
    return {
      label: group.label,
      status: exact.length > 0 ? "exact" : alias.length > 0 ? "alias" : "missing",
      exact,
      alias,
    };
  });

  return {
    ok: required.every((item) => item.status !== "missing")
      && alternatives.every((item) => item.status !== "missing"),
    required,
    alternatives,
  };
}

function formatMatches(matches) {
  return matches
    .map((match) => `${match.name} in ${match.sources.join(", ")}`)
    .join("; ");
}

export function formatLocalLaunchEnvSourceAudit(report) {
  const lines = [];
  for (const item of report.required) {
    if (item.status === "exact") {
      lines.push(`exact   ${item.name}: ${formatMatches(item.exact)}`);
    } else if (item.status === "alias") {
      lines.push(`alias   ${item.name}: ${formatMatches(item.alias)}`);
    } else {
      lines.push(`missing ${item.name}`);
    }
  }

  for (const item of report.alternatives) {
    if (item.status === "exact") {
      lines.push(`exact   ${item.label}: ${formatMatches(item.exact)}`);
    } else if (item.status === "alias") {
      lines.push(`alias   ${item.label}: ${formatMatches(item.alias)}`);
    } else {
      lines.push(`missing ${item.label}`);
    }
  }

  return lines.join("\n");
}

async function main() {
  const report = auditLocalLaunchEnvSources();
  console.log(formatLocalLaunchEnvSourceAudit(report));
  if (!report.ok) {
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[launch-env-source-audit] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
