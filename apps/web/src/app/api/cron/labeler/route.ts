import { NextResponse, type NextRequest } from "next/server";

import { runLabelerBatch } from "../../../../features/judgment-tools/labeler";

export const runtime = "nodejs";

/**
 * Cron endpoint — runs the labeler worker. Vercel cron schedule
 * configured separately. Auth via CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const expected = `Bearer ${process.env["CRON_SECRET"] ?? ""}`;
  if (auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runLabelerBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("/api/cron/labeler error:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export const GET = POST;
