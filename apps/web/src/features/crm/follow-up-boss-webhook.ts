import {
  FollowUpBossWebhookNotificationSchema,
  type FollowUpBossWebhookEventType,
  type FollowUpBossWebhookNotification,
} from "@realty-ops/core";
import { verifyFollowUpBossWebhookSignature } from "@realty-ops/integrations";

export type FollowUpBossWebhookSubscriptionResolver = (callbackToken: string) => Promise<{
  subscriptionId: string;
  workspaceId: string;
  eventType: FollowUpBossWebhookEventType;
  systemKey: string;
} | null>;

export type FollowUpBossBacksyncEventWriter = (params: {
  workspaceId: string;
  subscriptionId: string;
  notification: FollowUpBossWebhookNotification;
}) => Promise<{
  backsyncEventId: string;
  inserted: boolean;
}>;

export type FollowUpBossWebhookDeliveryResponse = {
  status: 200 | 202 | 400 | 401 | 500;
  body: {
    accepted: boolean;
    persistedBacksyncEventCount: number;
    duplicateEventCount: number;
    reason?:
      | "invalid_signature"
      | "malformed_payload"
      | "unexpected_event_type"
      | "unknown_subscription"
      | "missing_credential_encryption_key";
  };
};

function emptyResponse(
  status: FollowUpBossWebhookDeliveryResponse["status"],
  reason?: FollowUpBossWebhookDeliveryResponse["body"]["reason"],
): FollowUpBossWebhookDeliveryResponse {
  const accepted = status === 200 || status === 202;
  const body: FollowUpBossWebhookDeliveryResponse["body"] = {
    accepted,
    persistedBacksyncEventCount: 0,
    duplicateEventCount: 0,
  };

  if (reason !== undefined) {
    body.reason = reason;
  }

  return {
    status,
    body,
  };
}

export async function handleFollowUpBossWebhookDelivery(params: {
  callbackToken: string;
  rawBody: string;
  signature: string | null;
  resolveSubscription: FollowUpBossWebhookSubscriptionResolver;
  writeBacksyncEvent: FollowUpBossBacksyncEventWriter;
  credentialsReady: boolean;
}): Promise<FollowUpBossWebhookDeliveryResponse> {
  if (!params.credentialsReady) {
    return emptyResponse(500, "missing_credential_encryption_key");
  }

  const subscription = await params.resolveSubscription(params.callbackToken);
  if (subscription === null) {
    return emptyResponse(202, "unknown_subscription");
  }

  if (!verifyFollowUpBossWebhookSignature({
    rawBody: params.rawBody,
    signature: params.signature,
    systemKey: subscription.systemKey,
  })) {
    return emptyResponse(401, "invalid_signature");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(params.rawBody) as unknown;
  } catch {
    return emptyResponse(400, "malformed_payload");
  }

  const parsed = FollowUpBossWebhookNotificationSchema.safeParse(payload);
  if (!parsed.success) {
    return emptyResponse(400, "malformed_payload");
  }
  if (parsed.data.event !== subscription.eventType) {
    return emptyResponse(202, "unexpected_event_type");
  }

  const result = await params.writeBacksyncEvent({
    workspaceId: subscription.workspaceId,
    subscriptionId: subscription.subscriptionId,
    notification: parsed.data,
  });

  return {
    status: 200,
    body: {
      accepted: true,
      persistedBacksyncEventCount: result.inserted ? 1 : 0,
      duplicateEventCount: result.inserted ? 0 : 1,
    },
  };
}
