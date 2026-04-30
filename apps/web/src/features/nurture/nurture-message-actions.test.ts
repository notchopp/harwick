import { describe, expect, it, vi } from "vitest";
import type { NurtureMessage } from "@realty-ops/core";
import {
  actOnNurtureMessage,
  recordNurtureDeliveryReceipt,
  type NurtureMessageRepository,
} from "./nurture-message-actions";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const leadId = "22222222-2222-4222-8222-222222222222";
const messageId = "33333333-3333-4333-8333-333333333333";

function message(overrides: Partial<NurtureMessage> = {}): NurtureMessage {
  return {
    id: messageId,
    workspaceId,
    leadId,
    enrollmentId: "44444444-4444-4444-8444-444444444444",
    channel: "sms",
    status: "drafted",
    stepIndex: 0,
    body: "Still looking around Houston?",
    blockReason: null,
    providerMessageId: null,
    scheduledFor: "2026-04-29T12:00:00.000Z",
    sentAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: "2026-04-29T11:00:00.000Z",
    updatedAt: "2026-04-29T11:00:00.000Z",
    ...overrides,
  };
}

describe("nurture message actions", () => {
  it("queues an approved draft for delivery", async () => {
    const updateNurtureMessage = vi.fn<NurtureMessageRepository["updateNurtureMessage"]>()
      .mockResolvedValue(message({ status: "queued" }));
    const repository: NurtureMessageRepository = {
      findNurtureMessage: vi.fn().mockResolvedValue(message()),
      updateNurtureMessage,
    };

    await actOnNurtureMessage({
      workspaceId,
      messageId,
      request: { action: "approve_send" },
      repository,
    });

    expect(updateNurtureMessage).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        status: "queued",
        lastErrorCode: null,
      }) as Record<string, unknown>,
    }));
  });

  it("records delivery receipts without provider payload leakage", async () => {
    const updateNurtureMessage = vi.fn<NurtureMessageRepository["updateNurtureMessage"]>()
      .mockResolvedValue(message({ status: "sent", providerMessageId: "sms-1" }));
    const repository: NurtureMessageRepository = {
      findNurtureMessage: vi.fn(),
      updateNurtureMessage,
    };

    await recordNurtureDeliveryReceipt({
      workspaceId,
      messageId,
      request: { status: "sent", providerMessageId: "sms-1" },
      repository,
      now: () => new Date("2026-04-29T12:30:00.000Z"),
    });

    expect(updateNurtureMessage).toHaveBeenCalledWith(expect.objectContaining({
      values: expect.objectContaining({
        status: "sent",
        providerMessageId: "sms-1",
        sentAt: "2026-04-29T12:30:00.000Z",
      }) as Record<string, unknown>,
    }));
  });
});
