import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorizeWorkspaceRequest } from "../../../../lib/api/workspace-auth";
import { sendSms } from "../../../../features/twilio/sms-dispatch";

export const runtime = "nodejs";

const Body = z.object({
  workspaceId: UuidSchema,
  toPhone: z.string().min(10),
  body: z.string().min(1).max(1600),
  leadId: UuidSchema.optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const membership = await authorizeWorkspaceRequest({ request, workspaceId: parsed.data.workspaceId });
  if (membership === null) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await sendSms({
    workspaceId: parsed.data.workspaceId,
    toPhone: parsed.data.toPhone,
    body: parsed.data.body,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true, sid: result.sid });
}
