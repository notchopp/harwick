import { describe, expect, it } from "vitest";

import {
  SetWorkspaceIdentityInputSchema,
  WorkspaceTypeSchema,
} from "./workspace-onboarding.js";

describe("workspace onboarding contracts", () => {
  it("keeps workspace types scoped to the currently supported real-estate plans", () => {
    expect(WorkspaceTypeSchema.options).toEqual(["solo", "team", "brokerage", "other"]);
  });

  it("accepts richer business context while defaulting optional onboarding arrays", () => {
    const parsed = SetWorkspaceIdentityInputSchema.parse({
      workspaceType: "team",
      primaryAreas: ["Katy", "Sugar Land"],
      leadTypes: ["buyer", "new construction"],
      priceBands: ["$300k-$500k"],
      listingFocus: ["first-time buyers"],
      routingNotes: "Ademola keeps source credit. Sarah handles Katy buyers.",
      toneDescription: "Warm, direct, and always asks one useful qualifying question.",
    });

    expect(parsed.leadTypes).toEqual(["buyer", "new construction"]);
    expect(parsed.priceBands).toEqual(["$300k-$500k"]);
    expect(parsed.listingFocus).toEqual(["first-time buyers"]);
    expect(parsed.routingNotes).toContain("source credit");
  });

  it("keeps older identity payloads compatible", () => {
    const parsed = SetWorkspaceIdentityInputSchema.parse({
      workspaceType: "solo",
      primaryAreas: ["Richmond"],
      toneDescription: "Professional and concise with one qualifying question.",
    });

    expect(parsed.leadTypes).toEqual([]);
    expect(parsed.priceBands).toEqual([]);
    expect(parsed.listingFocus).toEqual([]);
  });
});
