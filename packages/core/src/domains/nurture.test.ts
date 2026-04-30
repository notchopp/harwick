import { describe, expect, it } from "vitest";
import {
  decideNurtureAction,
  isInsideQuietHours,
  isOptOutMessage,
  type NurtureEnrollment,
  type NurtureLeadContact,
} from "./nurture.js";

const enrollment: NurtureEnrollment = {
  id: "11111111-1111-4111-8111-111111111111",
  workspaceId: "22222222-2222-4222-8222-222222222222",
  leadId: "33333333-3333-4333-8333-333333333333",
  status: "active",
  sequenceKey: "default_realtor_nurture_v1",
  nextActionAt: "2026-04-29T12:00:00.000Z",
  quietHoursTimezone: "America/Chicago",
  lastStepIndex: 0,
  optedOutAt: null,
  optOutReason: null,
};

const lead: NurtureLeadContact = {
  leadId: enrollment.leadId,
  workspaceId: enrollment.workspaceId,
  fullName: "Ari Buyer",
  phone: "+17135551212",
  instagramUserId: null,
  sourceChannel: "call",
};

describe("nurture decisions", () => {
  it("detects opt-out language", () => {
    expect(isOptOutMessage("please STOP texting me")).toBe(true);
    expect(isOptOutMessage("still looking in Houston")).toBe(false);
  });

  it("blocks during quiet hours", () => {
    expect(isInsideQuietHours({
      at: new Date("2026-04-29T03:00:00.000Z"),
      timeZone: "America/Chicago",
    })).toBe(true);
  });

  it("drafts the next nurture step when contact is reachable", () => {
    const decision = decideNurtureAction({
      enrollment,
      lead,
      now: new Date("2026-04-29T15:00:00.000Z"),
    });

    expect(decision).toMatchObject({
      action: "draft",
      step: {
        channel: "sms",
        index: 0,
      },
    });
  });

  it("blocks opted-out enrollments", () => {
    expect(decideNurtureAction({
      enrollment: {
        ...enrollment,
        status: "opted_out",
        optedOutAt: "2026-04-29T10:00:00.000Z",
        optOutReason: "sms_stop_keyword",
      },
      lead,
      now: new Date("2026-04-29T15:00:00.000Z"),
    })).toMatchObject({
      action: "block",
      reason: "opted_out",
    });
  });
});
