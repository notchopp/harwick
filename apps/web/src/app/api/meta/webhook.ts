import {
  handleMetaWebhookDelivery,
  handleMetaWebhookVerification,
  type LeadEventWriter,
  type MetaWorkspaceResolver,
  type SocialPostContextWriter,
} from "../../../features/lead-intake/meta-webhook";
import { getServerEnvironment } from "../../../lib/server-env";
import { createMetaSocialPostContextHydrator } from "../../../lib/meta-post-hydration";
import {
  createLeadEventWriter,
  createMetaWorkspaceResolver,
  createSupabaseLeadEventRepository,
} from "../../../lib/supabase/lead-events";
import { createSupabaseLeadUpsertRepository } from "../../../lib/supabase/leads";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createSupabaseMetaCredentialRepository } from "../../../lib/supabase/integration-accounts";
import { createSupabaseSocialPostRepository } from "../../../lib/supabase/social-posts";
import { createWorkflowJobEnqueuer } from "../../../lib/supabase/workflow-jobs";

export type MetaWebhookGetRequest = {
  query: Record<string, string | undefined>;
};

export type MetaWebhookGetResponse = {
  status: number;
  body: string;
};

export type MetaWebhookPostRequest = {
  body: unknown;
};

export type MetaWebhookPostDependencies = {
  resolveWorkspaceIdByProviderAccountId: MetaWorkspaceResolver;
  writeLeadEvents: LeadEventWriter;
  writeSocialPostContexts?: SocialPostContextWriter;
  hydrateSocialPostContexts?: (contexts: import("@realty-ops/core").SocialPostContext[]) => Promise<import("@realty-ops/core").SocialPostContext[]>;
};

export function getMetaWebhook(request: MetaWebhookGetRequest): MetaWebhookGetResponse {
  const environment = getServerEnvironment();

  return handleMetaWebhookVerification({
    query: request.query,
    expectedVerifyToken: environment.META_WEBHOOK_VERIFY_TOKEN,
  });
}

export async function postMetaWebhook(
  request: MetaWebhookPostRequest,
  dependencies: MetaWebhookPostDependencies = createMetaWebhookPostDependencies(),
) {
  const deliveryParams = {
    payload: request.body,
    resolveWorkspaceIdByProviderAccountId: dependencies.resolveWorkspaceIdByProviderAccountId,
    writeLeadEvents: dependencies.writeLeadEvents,
  };

  return handleMetaWebhookDelivery(dependencies.writeSocialPostContexts === undefined
    ? deliveryParams
    : {
      ...deliveryParams,
      ...(dependencies.hydrateSocialPostContexts === undefined ? {} : { hydrateSocialPostContexts: dependencies.hydrateSocialPostContexts }),
      writeSocialPostContexts: dependencies.writeSocialPostContexts,
    });
}

export function createMetaWebhookPostDependencies(): MetaWebhookPostDependencies {
  const environment = getServerEnvironment();
  const supabase = createServerSupabaseClient();
  const repository = createSupabaseLeadEventRepository(supabase);
  const leadUpsertRepository = createSupabaseLeadUpsertRepository(supabase);
  const socialPostRepository = createSupabaseSocialPostRepository(supabase);
  const credentialRepository = createSupabaseMetaCredentialRepository(supabase);

  return {
    resolveWorkspaceIdByProviderAccountId: createMetaWorkspaceResolver(repository),
    writeLeadEvents: createLeadEventWriter(repository, {
      leadUpsertRepository,
      enqueueWorkflowJob: createWorkflowJobEnqueuer(supabase),
    }),
    writeSocialPostContexts: (contexts) => socialPostRepository.upsertPostContexts(contexts),
    ...(environment.CREDENTIAL_ENCRYPTION_KEY === undefined
      ? {}
      : {
          hydrateSocialPostContexts: createMetaSocialPostContextHydrator({
            credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
            integrationRepository: credentialRepository,
          }),
        }),
  };
}
