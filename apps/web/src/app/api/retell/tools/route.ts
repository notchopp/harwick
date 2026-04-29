import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@realty-ops/core";
import { verifyRetellWebhookSignature } from "@realty-ops/integrations";
import { handleRetellToolCall } from "../../../../features/call-intake/retell-tools";
import { createWorkspaceScopedListingLookupRepository } from "../../../../features/listings/workspace-listing-lookup";
import { getServerEnvironment } from "../../../../lib/server-env";
import { createSupabaseRepliersCredentialRepository } from "../../../../lib/supabase/integration-accounts";
import { createSupabaseVerifyListingTaskRepository } from "../../../../lib/supabase/lead-tasks";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";
import { createSupabaseListingFactsRepository } from "../../../../lib/supabase/listings";
import { createSupabaseVoiceLeadHandoffRepository } from "../../../../lib/supabase/voice-handoffs";
import { createWorkflowJobEnqueuer } from "../../../../lib/supabase/workflow-jobs";

export const runtime = "nodejs";

const logger = createLogger({
  service: "web",
  environment: process.env["APP_ENV"],
});

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-retell-signature");
  const environment = getServerEnvironment();
  const signatureValid = await verifyRetellWebhookSignature({
    rawBody,
    signature,
    apiKey: environment.RETELL_API_KEY,
  });

  if (!signatureValid) {
    return NextResponse.json({ result: "Invalid signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({
      result: "That tool request was malformed. Continue the call without using a tool.",
    }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const listingFactsRepository = createSupabaseListingFactsRepository(supabase);
  const listingRepository = createWorkspaceScopedListingLookupRepository({
    repository: listingFactsRepository,
    credentialRepository: createSupabaseRepliersCredentialRepository(supabase),
    environment,
    logger,
    ...(environment.CREDENTIAL_ENCRYPTION_KEY === undefined ? {} : {
      credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
    }),
  });
  const response = await handleRetellToolCall({
    body,
    repository: createSupabaseVoiceLeadHandoffRepository(supabase),
    listingRepository,
    verifyListingTaskRepository: createSupabaseVerifyListingTaskRepository(supabase),
    enqueueWorkflowJob: createWorkflowJobEnqueuer(supabase),
  });

  return NextResponse.json(response.body, {
    status: response.status,
  });
}
