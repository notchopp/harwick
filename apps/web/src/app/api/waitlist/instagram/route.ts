import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "../../../../lib/supabase/server-client";

export const runtime = "nodejs";

/**
 * LAUNCH-11: Instagram "coming soon" waitlist signup. Public endpoint — anyone
 * can join the waitlist; we just need workspace context to attribute the
 * signup to the right brokerage when Meta verification clears.
 */

const Body = z.object({
  workspaceId: UuidSchema,
  email: z.string().email().nullable().default(null),
  phone: z.string().max(40).nullable().default(null),
  instagramUsername: z.string().max(60).nullable().default(null),
  sourceUrl: z.string().url().nullable().default(null),
});

function hashIp(ip: string | null): string | null {
  if (ip === null) return null;
  // Lightweight non-cryptographic hash — we only need uniqueness for dedupe,
  // not secrecy. Avoids pulling in crypto for an edge call.
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  await untyped.from("instagram_waitlist").insert({
    workspace_id: parsed.data.workspaceId,
    email: parsed.data.email,
    phone: parsed.data.phone,
    instagram_username: parsed.data.instagramUsername,
    source_url: parsed.data.sourceUrl,
    user_agent: request.headers.get("user-agent") ?? null,
    ip_hash: hashIp(ip),
  });

  return NextResponse.json({ ok: true });
}
