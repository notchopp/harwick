import { describe, expect, it } from "vitest";
import { RouteLeadRequestSchema, RouteLeadResponseSchema, UpdateLeadQualificationRequestSchema } from "./lead.js";

describe("UpdateLeadQualificationRequestSchema", () => {
  it("normalizes empty editable text fields to null", () => {
    const parsed = UpdateLeadQualificationRequestSchema.parse({
      timeline: " ",
      targetArea: "",
      budget: "   ",
    });

    expect(parsed).toEqual({
      timeline: null,
      targetArea: null,
      budget: null,
    });
  });

  it("rejects empty qualification patches", () => {
    expect(() => UpdateLeadQualificationRequestSchema.parse({})).toThrow();
  });
});

describe("RouteLeadRequestSchema", () => {
  it("defaults to automatic Harwick routing", () => {
    expect(RouteLeadRequestSchema.parse({})).toEqual({ mode: "auto" });
  });
});

describe("RouteLeadResponseSchema", () => {
  it("validates an explainable assignment response", () => {
    expect(RouteLeadResponseSchema.parse({
      leadId: "123e4567-e89b-12d3-a456-426614174001",
      status: "assigned",
      assignedMemberId: "123e4567-e89b-12d3-a456-426614174011",
      assignedDisplayName: "Sarah K.",
      reasons: ["area match: Katy"],
      routingDecisionId: "123e4567-e89b-12d3-a456-426614174099",
    })).toMatchObject({
      status: "assigned",
      assignedDisplayName: "Sarah K.",
    });
  });
});
