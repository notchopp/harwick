import { describe, expect, it } from "vitest";
import { normalizeAuthRedirect } from "./redirects";

describe("normalizeAuthRedirect", () => {
  it("allows local app paths", () => {
    expect(normalizeAuthRedirect("/leads")).toBe("/leads");
  });

  it("rejects external and auth callback redirects", () => {
    expect(normalizeAuthRedirect("https://example.com")).toBe("/home");
    expect(normalizeAuthRedirect("//example.com")).toBe("/home");
    expect(normalizeAuthRedirect("/auth/callback")).toBe("/home");
    expect(normalizeAuthRedirect("/api/home")).toBe("/home");
  });
});
