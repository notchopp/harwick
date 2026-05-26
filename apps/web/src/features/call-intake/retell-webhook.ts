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

export type RetellVoiceUsageRecorder = (params: {
  workspaceId: string;
  providerAccountId: string;
  callId: string;
  durationMs: number;
  billableMinutes: number;
}) => Promise<void>;

/**
 * Optional post-call Harwick synthesis hook. Fires after the call_analyzed
 * lead events are persisted AND at least one lead was upserted. The
 * implementation is expected to run the typed HarwickAi runtime over the
 * transcript, update the lead document, and queue follow-on tasks
 * (callback / showing approval / listing-memory log). Errors are
 * swallowed and logged — synthesis failure should never break the
 * webhook ack since Retell will retry the whole payload otherwise.
 */
export type RetellPostCallSynthesisHook = (params: {
  workspaceId: string;
  callId: string;
  transcript: string;
  durationMs: number | null;
}) => Promise<void>;

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

function readDurationMs(call: {
  duration_ms?: number | null | undefined;
  start_timestamp?: number | null | undefined;
  end_timestamp?: number | null | undefined;
}): number | null {
  if (call.duration_ms !== null && call.duration_ms !== undefined && call.duration_ms > 0) {
    return call.duration_ms;
  }
  if (
    call.start_timestamp !== null
    && call.start_timestamp !== undefined
    && call.end_timestamp !== null
    && call.end_timestamp !== undefined
    && call.end_timestamp > call.start_timestamp
  ) {
    return call.end_timestamp - call.start_timestamp;
  }

  return null;
}

export async function handleRetellWebhookDelivery(params: {
  rawBody: string;
  signature: string | null;
  retellApiKey: string;
  resolveWorkspaceIdByProviderAccountId: RetellWorkspaceResolver;
  writeLeadEvents: RetellLeadEventWriter;
  recordVoiceCallUsage?: RetellVoiceUsageRecorder;
  runPostCallSynthesis?: RetellPostCallSynthesisHook;
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
  const durationMs = readDurationMs(parsedPayload.data.call);
  if (
    params.recordVoiceCallUsage !== undefined
    && parsedPayload.data.event === "call_analyzed"
    && writeResult.persistedCount > 0
    && durationMs !== null
  ) {
    try {
      await params.recordVoiceCallUsage({
        workspaceId,
        providerAccountId,
        callId: parsedPayload.data.call.call_id,
        durationMs,
        billableMinutes: Math.max(1, Math.ceil(durationMs / 60_000)),
      });
    } catch (error) {
      console.error("[retell] failed to record voice usage", error);
    }
  }

  // Post-call Harwick synthesis — God Flow 2's "Harwick thinks after the
  // call ends" step. Fires only when (a) we got a call_analyzed event with
  // a real transcript, (b) at least one lead was upserted from this call
  // (otherwise there's nothing for Harwick to attach synthesis to), and
  // (c) the route configured the hook. Failures are logged but never
  // surface to Retell — the webhook still acks 200 so Retell doesn't
  // retry the whole payload and risk double-persistence downstream.
  if (
    params.runPostCallSynthesis !== undefined
    && parsedPayload.data.event === "call_analyzed"
    && writeResult.leadUpsertCount > 0
  ) {
    const transcript = parsedPayload.data.call.transcript;
    if (typeof transcript === "string" && transcript.trim().length > 0) {
      try {
        await params.runPostCallSynthesis({
          workspaceId,
          callId: parsedPayload.data.call.call_id,
          transcript: transcript.trim(),
          durationMs,
        });
      } catch (error) {
        console.error("[retell] post-call Harwick synthesis failed", {
          callId: parsedPayload.data.call.call_id,
          workspaceId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

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
