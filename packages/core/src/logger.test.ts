import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLogger, sanitizeLogContext } from "./logger.js";

describe("sanitizeLogContext", () => {
  it("redacts sensitive keys and common secret-bearing string content", () => {
    expect(sanitizeLogContext({
      accessToken: "secret-token",
      encryptedCredentialRef: "enc:v1:abcdef",
      webhookSignature: "sig-value",
      contactEmail: "agent@example.com",
      phoneNumber: "+1 (713) 555-0100",
      nested: {
        pageAccessToken: "page-token",
        note: "Call Jordan at +1 713-555-0100 or email jordan@example.com",
      },
    })).toEqual({
      accessToken: "[REDACTED]",
      encryptedCredentialRef: "[REDACTED]",
      webhookSignature: "[REDACTED]",
      contactEmail: "[REDACTED]",
      phoneNumber: "[REDACTED]",
      nested: {
        pageAccessToken: "[REDACTED]",
        note: "Call Jordan at [REDACTED_PHONE] or email [REDACTED_EMAIL]",
      },
    });
  });

  it("serializes errors without leaking stacks or unsafe details", () => {
    const error = new Error("Meta OAuth failed for lead@example.com");
    const errorWithCode = error as Error & { code?: string };
    errorWithCode.code = "meta_oauth_failed";

    expect(sanitizeLogContext({
      error,
    })).toEqual({
      error: {
        name: "Error",
        message: "Meta OAuth failed for [REDACTED_EMAIL]",
        code: "meta_oauth_failed",
      },
    });
  });
});

describe("createLogger", () => {
  it("writes structured JSON entries", () => {
    const lines: Array<{ level: string; line: string }> = [];
    const logger = createLogger({
      service: "test-service",
      environment: "staging",
      write(level, line) {
        lines.push({ level, line });
      },
    });

    logger.error("request failed", {
      route: "/api/test",
      error: new Error("boom"),
      accessToken: "should-not-print",
    });

    expect(lines).toHaveLength(1);
    const parsedLine = z.object({
      timestamp: z.string(),
      level: z.literal("error"),
      service: z.literal("test-service"),
      environment: z.literal("staging"),
      message: z.literal("request failed"),
      context: z.object({
        route: z.literal("/api/test"),
        error: z.object({
          name: z.literal("Error"),
          message: z.literal("boom"),
        }),
        accessToken: z.literal("[REDACTED]"),
      }),
    }).parse(JSON.parse(lines[0]?.line ?? "{}"));
    expect(parsedLine).toEqual({
      timestamp: parsedLine.timestamp,
      level: "error",
      service: "test-service",
      environment: "staging",
      message: "request failed",
      context: {
        route: "/api/test",
        error: {
          name: "Error",
          message: "boom",
        },
        accessToken: "[REDACTED]",
      },
    });
  });
});
