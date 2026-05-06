import { describe, it, expect } from "vitest";
import { PublicListingInquiryRequestSchema } from "@realty-ops/core";

describe("PublicListingInquiryRequest schema", () => {
  it("should accept valid inquiry data", () => {
    const validData = {
      fullName: "John Doe",
      email: "john@example.com",
      phone: "+1234567890",
      message: "Interested in this property",
      propertyType: "Single Family Home",
      budget: 500000,
      timeline: "next_30_days",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it("should accept nullable and optional fields", () => {
    const minimalData = {
      fullName: "Jane Smith",
      email: "jane@example.com",
      phone: "+1987654321",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
    expect(result.success && result.data.intent).toBe("general");
  });

  it("should accept showing intent with a requested time window", () => {
    const showingData = {
      fullName: "Jane Smith",
      email: "jane@example.com",
      phone: "+1987654321",
      intent: "showing",
      requestedStartAt: "2026-05-07T14:00:00.000Z",
      requestedEndAt: "2026-05-07T14:30:00.000Z",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(showingData);
    expect(result.success).toBe(true);
  });

  it("should accept open-house registration intent", () => {
    const openHouseData = {
      fullName: "Jane Smith",
      email: "jane@example.com",
      phone: "+1987654321",
      intent: "open_house",
      message: "Please register us for the open house.",
      requestedStartAt: "2026-05-10T18:00:00.000Z",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(openHouseData);
    expect(result.success).toBe(true);
  });

  it("should reject showing windows where the end is before the start", () => {
    const showingData = {
      fullName: "Jane Smith",
      email: "jane@example.com",
      phone: "+1987654321",
      intent: "showing",
      requestedStartAt: "2026-05-07T14:30:00.000Z",
      requestedEndAt: "2026-05-07T14:00:00.000Z",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(showingData);
    expect(result.success).toBe(false);
  });

  it("should reject invalid email", () => {
    const invalidData = {
      fullName: "John Doe",
      email: "not-an-email",
      phone: "+1234567890",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it("should reject short phone number", () => {
    const invalidData = {
      fullName: "John Doe",
      email: "john@example.com",
      phone: "123",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });

  it("should reject missing required fields", () => {
    const incompleteData = {
      fullName: "John Doe",
      email: "john@example.com",
    };

    const result = PublicListingInquiryRequestSchema.safeParse(incompleteData);
    expect(result.success).toBe(false);
  });
});

