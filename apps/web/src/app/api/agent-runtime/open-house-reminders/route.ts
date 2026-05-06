import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { produceOpenHouseReminders } from "../../../../features/calendar/open-house-reminders";
import { createSupabaseOpenHouseReminderRepository } from "../../../../lib/supabase/open-house-reminders";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const OpenHouseReminderCronQuerySchema = z.object({
  hoursAhead: z.coerce.number().int().min(1).max(168).default(24),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

function authorizeAgentRuntimeCron(request: NextRequest): boolean | "disabled" {
  const explicitSecret = process.env["AGENT_RECONCILE_CRON_SECRET"];
  const vercelCronSecret = process.env["CRON_SECRET"];
  const acceptedSecrets = [explicitSecret, vercelCronSecret].filter((secret): secret is string =>
    secret !== undefined && secret.length > 0
  );
  if (acceptedSecrets.length === 0) {
    return "disabled";
  }

  const headerSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  return acceptedSecrets.includes(headerSecret) || acceptedSecrets.includes(querySecret);
}

export async function POST(request: NextRequest) {
  const authorized = authorizeAgentRuntimeCron(request);
  if (authorized === "disabled") {
    return NextResponse.json({ error: "open_house_reminders_disabled" }, { status: 503 });
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const query = OpenHouseReminderCronQuerySchema.safeParse({
    hoursAhead: request.nextUrl.searchParams.get("hoursAhead") ?? undefined,
    limit: request.nextUrl.searchParams.get("limit") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const report = await produceOpenHouseReminders({
      repository: createSupabaseOpenHouseReminderRepository(createServerSupabaseClient()),
      hoursAhead: query.data.hoursAhead,
      limit: query.data.limit,
    });
    return NextResponse.json({ status: "ok", report }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "open_house_reminders_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
