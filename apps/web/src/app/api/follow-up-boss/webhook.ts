import { z } from "zod";
import { handleFollowUpBossWebhookDelivery } from "../../../features/crm/follow-up-boss-webhook";
import { decryptCredential } from "../../../lib/credentials";
import {
  createSupabaseFollowUpBossWebhookRepository,
} from "../../../lib/supabase/follow-up-boss";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createWorkflowJobEnqueuer } from "../../../lib/supabase/workflow-jobs";
import { getServerEnvironment } from "../../../lib/server-env";

const FollowUpBossSystemKeySchema = z.object({
  systemKey: z.string().trim().min(16),
});

export type FollowUpBossWebhookPostRequest = {
  subscriptionToken: string;
  rawBody: string;
  signature: string | null;
};

export async function postFollowUpBossWebhook(
  request: FollowUpBossWebhookPostRequest,
) {
  const environment = getServerEnvironment();
  const credentialsReady = environment.CREDENTIAL_ENCRYPTION_KEY !== undefined;
  const supabase = createServerSupabaseClient();
  const repository = createSupabaseFollowUpBossWebhookRepository(supabase);
  const enqueueWorkflowJob = createWorkflowJobEnqueuer(supabase);

  return handleFollowUpBossWebhookDelivery({
    callbackToken: request.subscriptionToken,
    rawBody: request.rawBody,
    signature: request.signature,
    credentialsReady,
    resolveSubscription: async (callbackToken) => {
      if (!credentialsReady) {
        return null;
      }

      const record = await repository.findSubscriptionByCallbackToken(callbackToken);
      if (record === null) {
        return null;
      }

      const systemKey = FollowUpBossSystemKeySchema.parse(
        decryptCredential<unknown>(
          record.encryptedSystemKeyRef,
          environment.CREDENTIAL_ENCRYPTION_KEY!,
        ),
      ).systemKey;

      return {
        subscriptionId: record.subscriptionId,
        workspaceId: record.workspaceId,
        eventType: record.eventType,
        systemKey,
      };
    },
    writeBacksyncEvent: async (params) => {
      const result = await repository.recordInboundEvent(params);
      if (result.inserted) {
        await enqueueWorkflowJob({
          workspaceId: params.workspaceId,
          leadId: null,
          leadEventId: null,
          jobType: "fub_backsync_reconcile",
          idempotencyKey: `fub_backsync_reconcile:${params.notification.eventId}`,
          payload: {
            jobType: "fub_backsync_reconcile",
            workspaceId: params.workspaceId,
            backsyncEventId: result.backsyncEventId,
          },
        });
      }

      return result;
    },
  });
}
