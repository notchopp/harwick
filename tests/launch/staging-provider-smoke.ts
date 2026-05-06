import { sign as signRetellPayload } from "retell-sdk";

export type StagingProviderSmokeEnvironment = {
  LAUNCH_PROVIDER_SMOKE_BASE_URL?: string;
  LAUNCH_PROVIDER_SMOKE_BYPASS_SECRET?: string;
  LAUNCH_PROVIDER_SMOKE_REQUIRED?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  RETELL_API_KEY?: string;
  VERCEL_AUTOMATION_BYPASS_SECRET?: string;
};

export type StagingProviderSmokeCheck = {
  name: "readiness" | "systems" | "meta_webhook_challenge" | "retell_webhook_signature";
  status: "passed" | "failed" | "skipped";
  detail: string;
};

export type StagingProviderSmokeReport = {
  configured: boolean;
  required: boolean;
  baseUrl: string | null;
  checks: StagingProviderSmokeCheck[];
};

function normalizeBaseUrl(value: string | undefined): string | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim().replace(/\/+$/, "");
}

function isRequired(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function protectionBypassSecret(environment: StagingProviderSmokeEnvironment): string | null {
  const value = environment.LAUNCH_PROVIDER_SMOKE_BYPASS_SECRET
    ?? environment.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (value === undefined || value.trim().length === 0) {
    return null;
  }

  return value.trim();
}

function smokeFetch(params: {
  bypassSecret: string | null;
  fetchImpl: typeof fetch;
  init?: RequestInit;
  input: RequestInfo | URL;
}): Promise<Response> {
  if (params.bypassSecret === null) {
    return params.fetchImpl(params.input, params.init);
  }

  const headers = new Headers(params.init?.headers);
  headers.set("x-vercel-protection-bypass", params.bypassSecret);
  return params.fetchImpl(params.input, {
    ...params.init,
    headers,
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function missingCheck(name: StagingProviderSmokeCheck["name"], variable: string): StagingProviderSmokeCheck {
  return {
    name,
    status: "skipped",
    detail: `${variable} is not configured for this smoke check.`,
  };
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

async function checkReadiness(params: {
  baseUrl: string;
  bypassSecret: string | null;
  fetchImpl: typeof fetch;
}): Promise<StagingProviderSmokeCheck> {
  const response = await smokeFetch({
    bypassSecret: params.bypassSecret,
    fetchImpl: params.fetchImpl,
    input: `${params.baseUrl}/api/health/readiness`,
  });
  const body = jsonRecord(await readJson(response));
  const ready = body["ready"] === true;
  const missing = readStringList(body["missing"]);
  const missingDetail = missing.length > 0
    ? ` Missing: ${missing.join(", ")}.`
    : "";

  return {
    name: "readiness",
    status: response.ok && ready ? "passed" : "failed",
    detail: response.ok && ready
      ? "Runtime readiness endpoint reports ready."
      : `Runtime readiness endpoint failed with ${response.status}.${missingDetail}`,
  };
}

async function checkSystems(params: {
  baseUrl: string;
  bypassSecret: string | null;
  fetchImpl: typeof fetch;
}): Promise<StagingProviderSmokeCheck> {
  const response = await smokeFetch({
    bypassSecret: params.bypassSecret,
    fetchImpl: params.fetchImpl,
    input: `${params.baseUrl}/api/health/systems`,
  });
  const body = jsonRecord(await readJson(response));
  const healthy = body["status"] === "healthy";

  return {
    name: "systems",
    status: response.ok && healthy ? "passed" : "failed",
    detail: response.ok && healthy
      ? "Public system health endpoint reports healthy."
      : `Public system health endpoint failed with ${response.status}.`,
  };
}

async function checkMetaWebhookChallenge(params: {
  baseUrl: string;
  bypassSecret: string | null;
  verifyToken: string | undefined;
  fetchImpl: typeof fetch;
}): Promise<StagingProviderSmokeCheck> {
  if (params.verifyToken === undefined || params.verifyToken.trim().length === 0) {
    return missingCheck("meta_webhook_challenge", "META_WEBHOOK_VERIFY_TOKEN");
  }

  const challenge = `launch-smoke-${Date.now()}`;
  const url = new URL(`${params.baseUrl}/api/meta/webhook`);
  url.searchParams.set("hub.mode", "subscribe");
  url.searchParams.set("hub.verify_token", params.verifyToken);
  url.searchParams.set("hub.challenge", challenge);
  const response = await smokeFetch({
    bypassSecret: params.bypassSecret,
    fetchImpl: params.fetchImpl,
    input: url,
  });
  const body = await response.text();

  return {
    name: "meta_webhook_challenge",
    status: response.ok && body === challenge ? "passed" : "failed",
    detail: response.ok && body === challenge
      ? "Meta webhook challenge succeeds with the configured staging verify token."
      : `Meta webhook challenge failed with ${response.status}.`,
  };
}

async function checkRetellWebhookSignature(params: {
  baseUrl: string;
  bypassSecret: string | null;
  retellApiKey: string | undefined;
  fetchImpl: typeof fetch;
}): Promise<StagingProviderSmokeCheck> {
  if (params.retellApiKey === undefined || params.retellApiKey.trim().length === 0) {
    return missingCheck("retell_webhook_signature", "RETELL_API_KEY");
  }

  const agentId = "launch_smoke_unknown_agent";
  const rawBody = JSON.stringify({
    event: "call_started",
    call: {
      call_id: `launch_smoke_${Date.now()}`,
      agent_id: agentId,
    },
  });
  const signature = await signRetellPayload(rawBody, params.retellApiKey);
  const response = await smokeFetch({
    bypassSecret: params.bypassSecret,
    fetchImpl: params.fetchImpl,
    input: `${params.baseUrl}/api/retell/webhook`,
    init: {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-retell-signature": signature,
      },
      body: rawBody,
    },
  });
  const body = jsonRecord(await readJson(response));
  const unmatched = Array.isArray(body["unmatchedProviderAccountIds"])
    && body["unmatchedProviderAccountIds"].includes(agentId);

  return {
    name: "retell_webhook_signature",
    status: response.status === 202 && body["accepted"] === true && unmatched ? "passed" : "failed",
    detail: response.status === 202 && body["accepted"] === true && unmatched
      ? "Retell webhook accepts a valid signed staging-safe no-op payload."
      : `Retell webhook signature smoke failed with ${response.status}.`,
  };
}

export async function runStagingProviderSmoke(params: {
  environment: StagingProviderSmokeEnvironment;
  fetchImpl?: typeof fetch;
}): Promise<StagingProviderSmokeReport> {
  const baseUrl = normalizeBaseUrl(params.environment.LAUNCH_PROVIDER_SMOKE_BASE_URL);
  const required = isRequired(params.environment.LAUNCH_PROVIDER_SMOKE_REQUIRED);
  const fetchImpl = params.fetchImpl ?? fetch;
  const bypassSecret = protectionBypassSecret(params.environment);

  if (baseUrl === null) {
    return {
      configured: false,
      required,
      baseUrl: null,
      checks: [{
        name: "readiness",
        status: required ? "failed" : "skipped",
        detail: "LAUNCH_PROVIDER_SMOKE_BASE_URL is not configured.",
      }],
    };
  }

  const checks = await Promise.all([
    checkReadiness({ baseUrl, bypassSecret, fetchImpl }),
    checkSystems({ baseUrl, bypassSecret, fetchImpl }),
    checkMetaWebhookChallenge({
      baseUrl,
      bypassSecret,
      verifyToken: params.environment.META_WEBHOOK_VERIFY_TOKEN,
      fetchImpl,
    }),
    checkRetellWebhookSignature({
      baseUrl,
      bypassSecret,
      retellApiKey: params.environment.RETELL_API_KEY,
      fetchImpl,
    }),
  ]);

  return {
    configured: true,
    required,
    baseUrl,
    checks,
  };
}

export function assertStagingProviderSmokePassed(report: StagingProviderSmokeReport): void {
  const failed = report.checks.filter((check) => check.status === "failed");
  if (failed.length > 0) {
    throw new Error(`Staging provider smoke failed: ${failed.map((check) => `${check.name}: ${check.detail}`).join("; ")}`);
  }

  if (report.required) {
    const skipped = report.checks.filter((check) => check.status === "skipped");
    if (skipped.length > 0) {
      throw new Error(`Required staging provider smoke skipped checks: ${skipped.map((check) => `${check.name}: ${check.detail}`).join("; ")}`);
    }
  }
}
