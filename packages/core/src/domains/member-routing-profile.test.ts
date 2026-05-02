import { describe, expect, it } from "vitest";
import {
  MemberRoutingProfileCreateRequestSchema,
  MemberRoutingProfileUpdateRequestSchema,
} from "./member-routing-profile.js";

const memberId = "123e4567-e89b-12d3-a456-426614174010";

describe("MemberRoutingProfileCreateRequestSchema", () => {
  it("validates a complete routing profile create request", () => {
    const result = MemberRoutingProfileCreateRequestSchema.safeParse({
      memberId,
      roleLabel: "new construction specialist",
      areas: ["Katy", "Cypress"],
      propertyTypes: ["new_construction", "single_family"],
      leadTypes: ["buyer"],
      budgetMin: 300_000,
      budgetMax: 750_000,
      maxActiveLeads: 12,
      acceptsNewLeads: true,
      notificationPreference: "sms",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.memberId).toBe(memberId);
      expect(result.data.areas).toHaveLength(2);
      expect(result.data.propertyTypes).toContain("new_construction");
    }
  });

  it("applies default values for optional fields", () => {
    const result = MemberRoutingProfileCreateRequestSchema.safeParse({
      memberId,
      roleLabel: "generalist",
      areas: ["Houston"],
      propertyTypes: ["single_family"],
      leadTypes: ["buyer", "seller"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.budgetMin).toBeNull();
      expect(result.data.budgetMax).toBeNull();
      expect(result.data.maxActiveLeads).toBe(10);
      expect(result.data.acceptsNewLeads).toBe(true);
      expect(result.data.notificationPreference).toBe("app");
    }
  });

  it("rejects empty areas array", () => {
    const result = MemberRoutingProfileCreateRequestSchema.safeParse({
      memberId,
      roleLabel: "agent",
      areas: [],
      propertyTypes: ["single_family"],
      leadTypes: ["buyer"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown in lead types", () => {
    const result = MemberRoutingProfileCreateRequestSchema.safeParse({
      memberId,
      roleLabel: "agent",
      areas: ["Houston"],
      propertyTypes: ["single_family"],
      leadTypes: ["buyer", "unknown"],
    });

    expect(result.success).toBe(false);
  });

  it("rejects maxActiveLeads over 100", () => {
    const result = MemberRoutingProfileCreateRequestSchema.safeParse({
      memberId,
      roleLabel: "agent",
      areas: ["Houston"],
      propertyTypes: ["single_family"],
      leadTypes: ["buyer"],
      maxActiveLeads: 150,
    });

    expect(result.success).toBe(false);
  });
});

describe("MemberRoutingProfileUpdateRequestSchema", () => {
  it("validates partial update with only changed fields", () => {
    const result = MemberRoutingProfileUpdateRequestSchema.safeParse({
      acceptsNewLeads: false,
      notificationPreference: "email",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.acceptsNewLeads).toBe(false);
      expect(result.data.notificationPreference).toBe("email");
      expect(result.data.areas).toBeUndefined();
    }
  });

  it("validates area update", () => {
    const result = MemberRoutingProfileUpdateRequestSchema.safeParse({
      areas: ["Dallas", "Fort Worth", "Plano"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.areas).toHaveLength(3);
    }
  });

  it("allows null budget values in update", () => {
    const result = MemberRoutingProfileUpdateRequestSchema.safeParse({
      budgetMin: null,
      budgetMax: null,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.budgetMin).toBeNull();
      expect(result.data.budgetMax).toBeNull();
    }
  });

  it("rejects empty areas array in update", () => {
    const result = MemberRoutingProfileUpdateRequestSchema.safeParse({
      areas: [],
    });

    expect(result.success).toBe(false);
  });
});
