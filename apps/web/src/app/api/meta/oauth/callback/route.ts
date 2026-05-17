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
      const graphClient = createMetaGraphClient();
      // Subscribe the Page to webhooks so inbound DMs + comments start
      // arriving at /api/meta/webhook. Without this, the OAuth grant is
      // useless. Wrap independently so a failure here doesn't block the
      // foundation bootstrap below.
      try {
        await graphClient.subscribePageToWebhooks({
          pageId: connectedCredential.pageId,
          pageAccessToken: connectedCredential.pageAccessToken,
        });
      } catch (error) {
        logger.error("meta page webhook subscribe failed after oauth callback", {
          workspaceId: connectedIntegration.workspaceId,
          pageId: connectedCredential.pageId,
          error,
        });
      }
      try {
        await bootstrapMetaAccountFoundation({
          connectedIntegration,
          connectedAccount,
          connectedCredential,
          graphClient,
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
