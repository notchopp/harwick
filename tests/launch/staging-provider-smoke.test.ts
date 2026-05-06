import { describe, expect, it } from "vitest";
import {
  assertStagingProviderSmokePassed,
  runStagingProviderSmoke,
} from "./staging-provider-smoke";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  if (input instanceof URL) {
    return input.toString();
  }

  return input;
}

describe("staging provider smoke fixture", () => {
  it("passes against staging-safe provider endpoints when configured", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = (input, init) => {
      const url = requestUrl(input);
      calls.push({ url, init });

      if (url.endsWith("/api/health/readiness")) {
        return Promise.resolve(jsonResponse({ ready: true, status: "ready", missing: [] }));
      }
      if (url.endsWith("/api/health/systems")) {
        return Promise.resolve(jsonResponse({ status: "healthy", checkedAt: "2026-05-06T00:00:00.000Z", systems: [] }));
      }
      if (url.startsWith("https://staging.harwick.example/api/meta/webhook")) {
        const challenge = new URL(url).searchParams.get("hub.challenge") ?? "";
        return Promise.resolve(new Response(challenge, { status: 200 }));
      }
      if (url.endsWith("/api/retell/webhook")) {
        return Promise.resolve(jsonResponse({
          accepted: true,
          normalizedEventCount: 0,
          persistedEventCount: 0,
          duplicateEventCount: 0,
          leadUpsertCount: 0,
          unmatchedProviderAccountIds: ["launch_smoke_unknown_agent"],
        }, { status: 202 }));
      }

      return Promise.resolve(jsonResponse({ error: "unexpected" }, { status: 500 }));
    };

    const report = await runStagingProviderSmoke({
      environment: {
        LAUNCH_PROVIDER_SMOKE_BASE_URL: "https://staging.harwick.example/",
        LAUNCH_PROVIDER_SMOKE_BYPASS_SECRET: "vercel-bypass-secret",
        LAUNCH_PROVIDER_SMOKE_REQUIRED: "true",
        META_WEBHOOK_VERIFY_TOKEN: "verify-token-long-enough",
        RETELL_API_KEY: "retell-api-key",
      },
      fetchImpl,
    });

    expect(report.baseUrl).toBe("https://staging.harwick.example");
    expect(report.checks.map((check) => check.status)).toEqual(["passed", "passed", "passed", "passed"]);
    expect(calls.every((call) => new Headers(call.init?.headers).get("x-vercel-protection-bypass") === "vercel-bypass-secret")).toBe(true);
    expect(calls.some((call) => call.url.includes("/api/meta/webhook"))).toBe(true);
    expect(calls.some((call) => call.url.endsWith("/api/retell/webhook") && call.init?.method === "POST")).toBe(true);
    expect(() => assertStagingProviderSmokePassed(report)).not.toThrow();
  });

  it("does not block local launch checks when the live smoke target is intentionally unset", async () => {
    const report = await runStagingProviderSmoke({
      environment: {},
      fetchImpl: () => Promise.resolve(jsonResponse({ error: "should not be called" }, { status: 500 })),
    });

    expect(report.configured).toBe(false);
    expect(report.checks).toEqual([{
      name: "readiness",
      status: "skipped",
      detail: "LAUNCH_PROVIDER_SMOKE_BASE_URL is not configured.",
    }]);
    expect(() => assertStagingProviderSmokePassed(report)).not.toThrow();
  });

  it("reports missing readiness keys from the deployed app response", async () => {
    const report = await runStagingProviderSmoke({
      environment: {
        LAUNCH_PROVIDER_SMOKE_BASE_URL: "https://staging.harwick.example",
        META_WEBHOOK_VERIFY_TOKEN: "verify-token-long-enough",
        RETELL_API_KEY: "retell-api-key",
      },
      fetchImpl: (input) => {
        const url = requestUrl(input);
        if (url.endsWith("/api/health/readiness")) {
          return Promise.resolve(jsonResponse({
            ready: false,
            status: "blocked",
            missing: ["RETELL_VOICE_ID", "STRIPE_SECRET_KEY"],
          }, { status: 503 }));
        }
        if (url.endsWith("/api/health/systems")) {
          return Promise.resolve(jsonResponse({ status: "healthy", checkedAt: "2026-05-06T00:00:00.000Z", systems: [] }));
        }
        if (url.startsWith("https://staging.harwick.example/api/meta/webhook")) {
          const challenge = new URL(url).searchParams.get("hub.challenge") ?? "";
          return Promise.resolve(new Response(challenge, { status: 200 }));
        }
        if (url.endsWith("/api/retell/webhook")) {
          return Promise.resolve(jsonResponse({
            accepted: true,
            normalizedEventCount: 0,
            persistedEventCount: 0,
            duplicateEventCount: 0,
            leadUpsertCount: 0,
            unmatchedProviderAccountIds: ["launch_smoke_unknown_agent"],
          }, { status: 202 }));
        }

        return Promise.resolve(jsonResponse({ error: "unexpected" }, { status: 500 }));
      },
    });

    expect(report.checks[0]).toEqual({
      name: "readiness",
      status: "failed",
      detail: "Runtime readiness endpoint failed with 503. Missing: RETELL_VOICE_ID, STRIPE_SECRET_KEY.",
    });
    expect(() => assertStagingProviderSmokePassed(report)).toThrow(/RETELL_VOICE_ID, STRIPE_SECRET_KEY/);
  });

  it("fails when staging smoke is required but not configured", async () => {
    const report = await runStagingProviderSmoke({
      environment: {
        LAUNCH_PROVIDER_SMOKE_REQUIRED: "1",
      },
      fetchImpl: () => Promise.resolve(jsonResponse({ error: "should not be called" }, { status: 500 })),
    });

    expect(report.checks[0]?.status).toBe("failed");
    expect(() => assertStagingProviderSmokePassed(report)).toThrow(/LAUNCH_PROVIDER_SMOKE_BASE_URL/);
  });

  it("live staging provider smoke uses the deployed app when LAUNCH_PROVIDER_SMOKE_BASE_URL is set", async () => {
    const report = await runStagingProviderSmoke({
      environment: process.env,
    });

    if (!report.configured) {
      console.warn("[staging-provider-smoke] skipped: set LAUNCH_PROVIDER_SMOKE_BASE_URL to run deployed provider checks.");
    }

    assertStagingProviderSmokePassed(report);
  }, 30_000);
});
