import {
  handleRetellWebhookDelivery,
  type RetellLeadEventWriter,
  type RetellVoiceUsageRecorder,
  type RetellWorkspaceResolver,
} from "../../../features/call-intake/retell-webhook";
import { getServerEnvironment } from "../../../lib/server-env";
import { recordBillingUsageEvent } from "../../../lib/supabase/billing";
import {
  createLeadEventWriter,
  createRetellWorkspaceResolver,
  createSupabaseLeadEventRepository,
} from "../../../lib/supabase/lead-events";
import { createSupabaseLeadUpsertRepository } from "../../../lib/supabase/leads";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createWorkflowJobEnqueuer } from "../../../lib/supabase/workflow-jobs";

export type RetellWebhookPostRequest = {
  rawBody: string;
  signature: string | null;
};

export type RetellWebhookPostDependencies = {
  resolveWorkspaceIdByProviderAccountId: RetellWorkspaceResolver;
  writeLeadEvents: RetellLeadEventWriter;
  recordVoiceCallUsage: RetellVoiceUsageRecorder;
};

export async function postRetellWebhook(
  request: RetellWebhookPostRequest,
  dependencies: RetellWebhookPostDependencies = createRetellWebhookPostDependencies(),
) {
  const environment = getServerEnvironment();

  return handleRetellWebhookDelivery({
    rawBody: request.rawBody,
    signature: request.signature,
    retellApiKey: environment.RETELL_API_KEY,
    resolveWorkspaceIdByProviderAccountId: dependencies.resolveWorkspaceIdByProviderAccountId,
    writeLeadEvents: dependencies.writeLeadEvents,
    recordVoiceCallUsage: dependencies.recordVoiceCallUsage,
  });
}

export function createRetellWebhookPostDependencies(): RetellWebhookPostDependencies {
  const supabase = createServerSupabaseClient();
  const repository = createSupabaseLeadEventRepository(supabase);
  const leadUpsertRepository = createSupabaseLeadUpsertRepository(supabase);

  return {
    resolveWorkspaceIdByProviderAccountId: createRetellWorkspaceResolver(repository),
    writeLeadEvents: createLeadEventWriter(repository, {
      leadUpsertRepository,
      enqueueWorkflowJob: createWorkflowJobEnqueuer(supabase),
    }),
    recordVoiceCallUsage: (params) => recordBillingUsageEvent(supabase, {
      workspaceId: params.workspaceId,
      eventType: "voice_minute",
      unitCount: params.billableMinutes,
      sourceId: params.callId,
      idempotencyKey: `retell_call:${params.callId}`,
      eventMetadata: {
        provider: "retell",
        providerAccountId: params.providerAccountId,
        callId: params.callId,
        durationMs: params.durationMs,
      },
    }).then(() => undefined),
  };
}
