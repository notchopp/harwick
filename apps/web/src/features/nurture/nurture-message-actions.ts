import {
  NurtureDeliveryReceiptRequestSchema,
  NurtureMessageActionRequestSchema,
  NurtureMessageSchema,
  type NurtureDeliveryReceiptRequest,
  type NurtureMessage,
  type NurtureMessageActionRequest,
} from "@realty-ops/core";

export type NurtureMessageRepository = {
  findNurtureMessage(params: {
    workspaceId: string;
    messageId: string;
  }): Promise<NurtureMessage | null>;
  updateNurtureMessage(params: {
    workspaceId: string;
    messageId: string;
    values: {
      status: NurtureMessage["status"];
      blockReason?: NurtureMessage["blockReason"];
      providerMessageId?: string | null;
      sentAt?: string | null;
      lastErrorCode?: string | null;
      lastErrorMessage?: string | null;
    };
  }): Promise<NurtureMessage | null>;
  recordUsageEvent?(params: {
    workspaceId: string;
    message: NurtureMessage;
  }): Promise<void>;
  enqueueDeliveryJob?(params: {
    workspaceId: string;
    message: NurtureMessage;
  }): Promise<void>;
};

export async function actOnNurtureMessage(params: {
  workspaceId: string;
  messageId: string;
  request: unknown;
  repository: NurtureMessageRepository;
}): Promise<NurtureMessage | null> {
  const action: NurtureMessageActionRequest = NurtureMessageActionRequestSchema.parse(params.request);
  const message = await params.repository.findNurtureMessage({
    workspaceId: params.workspaceId,
    messageId: params.messageId,
  });
  if (message === null) {
    return null;
  }

  if (action.action === "dismiss") {
    return params.repository.updateNurtureMessage({
      workspaceId: params.workspaceId,
      messageId: params.messageId,
      values: {
        status: "blocked",
        blockReason: "sequence_complete",
        lastErrorCode: "operator_dismissed",
        lastErrorMessage: action.reason ?? "Dismissed by operator.",
      },
    });
  }

  const updated = await params.repository.updateNurtureMessage({
    workspaceId: params.workspaceId,
    messageId: params.messageId,
    values: {
      status: "queued",
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });

  if (updated !== null && params.repository.enqueueDeliveryJob !== undefined) {
    await params.repository.enqueueDeliveryJob({
      workspaceId: params.workspaceId,
      message: updated,
    });
  }

  return updated;
}

export async function recordNurtureDeliveryReceipt(params: {
  workspaceId: string;
  messageId: string;
  request: unknown;
  repository: NurtureMessageRepository;
  now?: () => Date;
}): Promise<NurtureMessage | null> {
  const receipt: NurtureDeliveryReceiptRequest = NurtureDeliveryReceiptRequestSchema.parse(params.request);
  if (receipt.status === "failed") {
    return params.repository.updateNurtureMessage({
      workspaceId: params.workspaceId,
      messageId: params.messageId,
      values: {
        status: "failed",
        lastErrorCode: receipt.errorCode,
        lastErrorMessage: receipt.errorMessage ?? null,
      },
    });
  }

  const existingMessage = await params.repository.findNurtureMessage({
    workspaceId: params.workspaceId,
    messageId: params.messageId,
  });
  const updated = await params.repository.updateNurtureMessage({
    workspaceId: params.workspaceId,
    messageId: params.messageId,
    values: {
      status: "sent",
      providerMessageId: receipt.providerMessageId,
      sentAt: receipt.sentAt ?? (params.now?.() ?? new Date()).toISOString(),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });

  if (
    updated !== null
    && existingMessage?.status !== "sent"
    && params.repository.recordUsageEvent !== undefined
  ) {
    try {
      await params.repository.recordUsageEvent({
        workspaceId: params.workspaceId,
        message: updated,
      });
    } catch (error) {
      console.error("[nurture] failed to record sent-message usage", error);
    }
  }

  return updated === null ? null : NurtureMessageSchema.parse(updated);
}
