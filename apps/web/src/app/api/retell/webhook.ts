import {
  handleRetellWebhookDelivery,
  type RetellLeadEventWriter,
  type RetellWorkspaceResolver,
} from "../../../features/call-intake/retell-webhook";
import { getServerEnvironment } from "../../../lib/server-env";
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
  };
}
