import { buildPublicSystemHealth } from "@realty-ops/core";
import { NextResponse } from "next/server";
import { getServerEnvironment } from "../../../../lib/server-env";

export const runtime = "nodejs";

export function GET() {
  const environment = getServerEnvironment();
  const health = buildPublicSystemHealth({
    checkedAt: new Date().toISOString(),
    hasSocialIntake: environment.META_APP_ID.length > 0
      && environment.META_APP_SECRET.length > 0
      && environment.META_WEBHOOK_VERIFY_TOKEN.length >= 16,
    hasHarwickAi: environment.OPENAI_API_KEY !== undefined || environment.APP_ENV === "development",
    hasVoiceSystem: environment.RETELL_API_KEY.length > 0,
    hasListingSystem: environment.LISTING_PROVIDER === "repliers"
      ? environment.REPLIERS_API_KEY !== undefined && environment.REPLIERS_BOARD_ID !== undefined
      : true,
    hasCrmSync: environment.CREDENTIAL_ENCRYPTION_KEY !== undefined || environment.APP_ENV === "development",
    hasBackgroundJobs: environment.SUPABASE_SERVICE_ROLE_KEY.length > 0,
  });

  return NextResponse.json(health, {
    status: health.status === "healthy" ? 200 : 503,
  });
}
