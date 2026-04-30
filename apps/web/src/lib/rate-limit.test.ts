import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("blocks requests over the configured window", () => {
    expect(checkRateLimit({ key: "test:1", limit: 1, windowMs: 60_000, now: () => 1_000 })).toEqual({ allowed: true });
    expect(checkRateLimit({ key: "test:1", limit: 1, windowMs: 60_000, now: () => 2_000 })).toEqual({
      allowed: false,
      retryAfterSeconds: 59,
    });
  });

  it("resets after the window", () => {
    expect(checkRateLimit({ key: "test:2", limit: 1, windowMs: 1_000, now: () => 1_000 })).toEqual({ allowed: true });
    expect(checkRateLimit({ key: "test:2", limit: 1, windowMs: 1_000, now: () => 2_001 })).toEqual({ allowed: true });
  });
});
