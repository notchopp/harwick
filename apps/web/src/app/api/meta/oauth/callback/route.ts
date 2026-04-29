import { NextResponse, type NextRequest } from "next/server";
import { createLogger } from "@realty-ops/core";
import { createMetaOAuthClient } from "@realty-ops/integrations";
import { createMetaGraphClient } from "@realty-ops/integrations";
import { bootstrapMetaAccountFoundation } from "../../../../../features/integrations/meta-foundations";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseMetaOAuthRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseMetaAccountFoundationRepository } from "../../../../../lib/supabase/meta-foundations";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { handleMetaOAuthCallback } from "../../../../../features/integrations/meta-oauth";

export const runtime = "nodejs";
const logger = createLogger({
  service: "web-meta-oauth",
  environment: process.env["APP_ENV"],
});

export async function GET(request: NextRequest) {
  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "missing_credential_encryption_key" }, { status: 500 });
  }
  const redirectUri = environment.META_OAUTH_REDIRECT_URI
    ?? `${environment.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "")}/api/meta/oauth/callback`;
  const meta = createMetaOAuthClient({
    appId: environment.META_APP_ID,
    appSecret: environment.META_APP_SECRET,
    redirectUri,
  });
  const supabase = createServerSupabaseClient();
  const foundationRepository = createSupabaseMetaAccountFoundationRepository(supabase);
  const response = await handleMetaOAuthCallback({
    query: {
      state: request.nextUrl.searchParams.get("state"),
      code: request.nextUrl.searchParams.get("code"),
    },
    oauthClient: meta,
    repository: createSupabaseMetaOAuthRepository(supabase),
    credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
    appBaseUrl: environment.NEXT_PUBLIC_APP_URL,
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
        logger.error("meta foundation bootstrap failed after oauth callback", {
          workspaceId: connectedIntegration.workspaceId,
          integrationAccountId: connectedIntegration.integrationAccountId,
          providerAccountId: connectedIntegration.providerAccountId,
          error,
        });
      }
    },
  });

  if (response.status !== 302) {
    return NextResponse.json(response.body, { status: response.status });
  }

  return NextResponse.redirect(response.body.redirectUrl);
}
