import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PRODUCTION_REQUIRED_ENVIRONMENT_NAMES = [
  "APP_ENV",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_OAUTH_REDIRECT_URI",
  "CREDENTIAL_ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "RETELL_API_KEY",
  "RETELL_VOICE_ID",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SOLO_MONTHLY_PRICE_ID",
  "STRIPE_SOLO_YEARLY_PRICE_ID",
  "STRIPE_TEAM_MONTHLY_PRICE_ID",
  "STRIPE_TEAM_YEARLY_PRICE_ID",
  "STRIPE_BROKERAGE_MONTHLY_PRICE_ID",
  "STRIPE_BROKERAGE_YEARLY_PRICE_ID",
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_OAUTH_REDIRECT_URI",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
];

export const PRODUCTION_REQUIRED_ALTERNATIVES = [
  {
    label: "AGENT_RECONCILE_CRON_SECRET_OR_CRON_SECRET",
    names: ["AGENT_RECONCILE_CRON_SECRET", "CRON_SECRET"],
  },
];

export function parseVercelEnvListOutput(output) {
  const names = new Set();

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]+)\s+/);
    if (match === null) {
      continue;
    }

    names.add(match[1]);
  }

  return names;
}

export function auditConfiguredEnvironmentNames(configuredNames, options = {}) {
  const requiredNames = options.requiredNames ?? PRODUCTION_REQUIRED_ENVIRONMENT_NAMES;
  const requiredAlternatives = options.requiredAlternatives ?? PRODUCTION_REQUIRED_ALTERNATIVES;
  const configured = configuredNames instanceof Set ? configuredNames : new Set(configuredNames);

  const missing = requiredNames.filter((name) => !configured.has(name));
  const missingAlternatives = requiredAlternatives
    .filter((group) => !group.names.some((name) => configured.has(name)))
    .map((group) => group.label);

  return {
    ok: missing.length === 0 && missingAlternatives.length === 0,
    missing,
    missingAlternatives,
  };
}

function runVercelEnvList() {
  const command = process.platform === "win32" ? "vercel.cmd" : "vercel";
  const result = spawnSync(command, ["env", "ls"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`vercel env ls failed with exit code ${result.status ?? "unknown"}: ${result.stderr.trim()}`);
  }

  return result.stdout;
}

export function formatEnvironmentAuditFailure(report) {
  const parts = [];
  if (report.missing.length > 0) {
    parts.push(`missing required env names: ${report.missing.join(", ")}`);
  }
  if (report.missingAlternatives.length > 0) {
    parts.push(`missing one-of env names: ${report.missingAlternatives.join(", ")}`);
  }

  return parts.join("; ");
}

async function main() {
  const output = runVercelEnvList();
  const configuredNames = parseVercelEnvListOutput(output);
  const report = auditConfiguredEnvironmentNames(configuredNames);

  if (!report.ok) {
    console.error(`[launch-env-audit] failed: ${formatEnvironmentAuditFailure(report)}`);
    process.exitCode = 1;
    return;
  }

  console.log("[launch-env-audit] passed: required deployed environment names are configured.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[launch-env-audit] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
