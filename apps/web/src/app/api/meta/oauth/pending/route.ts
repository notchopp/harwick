import { NextResponse, type NextRequest } from "next/server";
import { getServerEnvironment } from "../../../../../lib/server-env";
import { createSupabaseMetaOAuthRepository } from "../../../../../lib/supabase/integration-accounts";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { getPendingMetaOAuthSelection } from "../../../../../features/integrations/meta-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const environment = getServerEnvironment();
  if (environment.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return NextResponse.json({ error: "missing_credential_encryption_key" }, { status: 500 });
  }

  const response = await getPendingMetaOAuthSelection({
    query: {
      state: request.nextUrl.searchParams.get("state"),
    },
    repository: createSupabaseMetaOAuthRepository(createServerSupabaseClient()),
    credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
  });

  return NextResponse.json(response.body, { status: response.status });
}
