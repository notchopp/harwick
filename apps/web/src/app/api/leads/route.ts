import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadLeadsPageData } from "../../../features/leads/leads-data";
import { createSupabaseLeadsPageRepository } from "../../../lib/supabase/leads-page";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";

export const runtime = "nodejs";

const demoWorkspaceId = "123e4567-e89b-12d3-a456-426614174000";

export async function GET(request: NextRequest) {
  const requestedWorkspaceId = UuidSchema.safeParse(request.nextUrl.searchParams.get("workspaceId"));
  const workspaceId = requestedWorkspaceId.success ? requestedWorkspaceId.data : demoWorkspaceId;
  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = limitParam === null ? undefined : Number(limitParam);

  if (process.env["NODE_ENV"] !== "development") {
    return NextResponse.json({ workspaceId, items: [] }, { status: 200 });
  }

  try {
    const data = await loadLeadsPageData({
      workspaceId,
      repository: createSupabaseLeadsPageRepository(createServerSupabaseClient()),
      ...(limit !== undefined && Number.isInteger(limit) && limit > 0 ? { limit } : {}),
    });

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ workspaceId, items: [] }, { status: 200 });
  }
}
