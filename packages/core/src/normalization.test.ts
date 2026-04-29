import { describe, expect, it } from "vitest";
import {
  normalizeFreeformText,
  normalizeInstagramUsername,
  parseBudgetRangeText,
  normalizeUsPhoneNumber,
} from "./normalization.js";

describe("normalization", () => {
  it("normalizes Instagram usernames", () => {
    expect(normalizeInstagramUsername("  @YourRealtorDemo ")).toBe("yourrealtordemo");
  });

  it("collapses freeform text whitespace", () => {
    expect(normalizeFreeformText("  Price?\n\nDM me   please ")).toBe("Price? DM me please");
  });

  it("normalizes US phone numbers to E.164", () => {
    expect(normalizeUsPhoneNumber("(713) 555-1200")).toBe("+17135551200");
  });

  it("rejects invalid phone numbers", () => {
    expect(normalizeUsPhoneNumber("123")).toBeNull();
  });

  it("parses budget ranges with k and m suffixes", () => {
    expect(parseBudgetRangeText("$450k - $575k")).toEqual({
      min: 450_000,
      max: 575_000,
    });
    expect(parseBudgetRangeText("$1.2m")).toEqual({
      min: 1_200_000,
      max: 1_200_000,
    });
  });

  it("parses open-ended budget ranges", () => {
    expect(parseBudgetRangeText("up to 850k")).toEqual({
      min: null,
      max: 850_000,
    });
    expect(parseBudgetRangeText("at least $900,000")).toEqual({
      min: 900_000,
      max: null,
    });
  });

  it("ignores non-budget text", () => {
    expect(parseBudgetRangeText("just browsing")).toEqual({
      min: null,
      max: null,
    });
  });
});
