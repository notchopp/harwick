import { NextResponse } from "next/server";
import { createLogger } from "@realty-ops/core";
import { createMetaGraphClient } from "@realty-ops/integrations";
import { bootstrapMetaAccountFoundation } from "../../../../../features/integrations/meta-foundations";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseMetaOAuthRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseMetaAccountFoundationRepository } from "../../../../../lib/supabase/meta-foundations";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { completeMetaOAuthSelection } from "../../../../../features/integrations/meta-oauth";

export const runtime = "nodejs";
const logger = createLogger({
  service: "web-meta-oauth",
  environment: process.env["APP_ENV"],
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "missing_credential_encryption_key" }, { status: 500 });
  }

  const supabase = createServerSupabaseClient();
  const foundationRepository = createSupabaseMetaAccountFoundationRepository(supabase);
  const response = await completeMetaOAuthSelection({
    request: body,
    repository: createSupabaseMetaOAuthRepository(supabase),
    credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
    onConnected: async ({ connectedIntegration, connectedAccount, connectedCredential }) => {
      try {
        await bootstrapMetaAccountFoundation({
          connectedIntegration,
          connectedAccount,
          connectedCredential,
          graphClient: createMetaGraphClient(),
          repository: foundationRepository,
          logger,
        });
      } catch (error) {
        logger.error("meta foundation bootstrap failed after oauth completion", {
          workspaceId: connectedIntegration.workspaceId,
          integrationAccountId: connectedIntegration.integrationAccountId,
          providerAccountId: connectedIntegration.providerAccountId,
          error,
        });
      }
    },
  });

  return NextResponse.json(response.body, { status: response.status });
}
