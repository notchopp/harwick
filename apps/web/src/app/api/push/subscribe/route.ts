import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

const SubscribeBody = z.object({
  workspaceId: UuidSchema,
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({ p256dh: z.string(), auth: z.string() }),
  }),
  userAgent: z.string().nullable().default(null),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = SubscribeBody.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsed.data.workspaceId });
  if (membership === null) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  await untyped
    .from("push_subscriptions")
    .upsert({
      workspace_id: parsed.data.workspaceId,
      member_id: membership.memberId,
      endpoint: parsed.data.subscription.endpoint,
      p256dh_key: parsed.data.subscription.keys.p256dh,
      auth_key: parsed.data.subscription.keys.auth,
      user_agent: parsed.data.userAgent,
      last_used_at: new Date().toISOString(),
      failure_count: 0,
    }, { onConflict: "member_id,endpoint" });

  return NextResponse.json({ ok: true });
}
