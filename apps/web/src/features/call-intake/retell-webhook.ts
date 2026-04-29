import type { NormalizedLeadEvent } from "@realty-ops/core";
import {
  normalizeRetellWebhookPayload,
  RetellWebhookPayloadSchema,
  verifyRetellWebhookSignature,
} from "@realty-ops/integrations";

export type RetellWorkspaceResolver = (providerAccountId: string) => Promise<string | null>;

export type RetellLeadEventWriterResult = {
  persistedCount: number;
  duplicateCount: number;
  leadUpsertCount: number;
};

export type RetellLeadEventWriter = (
  events: NormalizedLeadEvent[],
) => Promise<RetellLeadEventWriterResult>;

export type RetellWebhookDeliveryResponse = {
  status: 200 | 202 | 400 | 401;
  body: {
    accepted: boolean;
    normalizedEventCount: number;
    persistedEventCount: number;
    duplicateEventCount: number;
    leadUpsertCount: number;
    unmatchedProviderAccountIds: string[];
    reason?: "invalid_signature" | "malformed_payload";
  };
};

function emptyResponse(
  status: RetellWebhookDeliveryResponse["status"],
  reason?: RetellWebhookDeliveryResponse["body"]["reason"],
): RetellWebhookDeliveryResponse {
  const body: RetellWebhookDeliveryResponse["body"] = {
    accepted: status !== 400 && status !== 401,
    normalizedEventCount: 0,
    persistedEventCount: 0,
    duplicateEventCount: 0,
    leadUpsertCount: 0,
    unmatchedProviderAccountIds: [],
  };

  if (reason !== undefined) {
    body.reason = reason;
  }

  return {
    status,
    body,
  };
}

export async function handleRetellWebhookDelivery(params: {
  rawBody: string;
  signature: string | null;
  retellApiKey: string;
  resolveWorkspaceIdByProviderAccountId: RetellWorkspaceResolver;
  writeLeadEvents: RetellLeadEventWriter;
}): Promise<RetellWebhookDeliveryResponse> {
  const signatureValid = await verifyRetellWebhookSignature({
    rawBody: params.rawBody,
    signature: params.signature,
    apiKey: params.retellApiKey,
  });

  if (!signatureValid) {
    return emptyResponse(401, "invalid_signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(params.rawBody) as unknown;
  } catch {
    return emptyResponse(400, "malformed_payload");
  }

  const parsedPayload = RetellWebhookPayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    return emptyResponse(400, "malformed_payload");
  }

  const providerAccountId = parsedPayload.data.call.agent_id;
  const workspaceId = await params.resolveWorkspaceIdByProviderAccountId(providerAccountId);

  if (workspaceId === null) {
    return {
      ...emptyResponse(202),
      body: {
        ...emptyResponse(202).body,
        unmatchedProviderAccountIds: [providerAccountId],
      },
    };
  }

  const normalizedEvents = normalizeRetellWebhookPayload({
    workspaceId,
    payload: parsedPayload.data,
  });

  if (normalizedEvents.length === 0) {
    return emptyResponse(200);
  }

  const writeResult = await params.writeLeadEvents(normalizedEvents);

  return {
    status: 200,
    body: {
      accepted: true,
      normalizedEventCount: normalizedEvents.length,
      persistedEventCount: writeResult.persistedCount,
      duplicateEventCount: writeResult.duplicateCount,
      leadUpsertCount: writeResult.leadUpsertCount,
      unmatchedProviderAccountIds: [],
    },
  };
}
