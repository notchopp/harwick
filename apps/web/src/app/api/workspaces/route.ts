import {
  WorkspaceCreateRequestSchema,
  WorkspaceCreateResponseSchema,
} from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { selectedWorkspaceCookieName } from "../../../features/auth/session";
import { createCookieSupabaseServerClient } from "../../../lib/supabase/ssr-server";

export const runtime = "nodejs";

function slugifyWorkspaceName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug.length < 2 ? "workspace" : slug;
}

export async function POST(request: NextRequest) {
  const parsed = WorkspaceCreateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = await createCookieSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError !== null || userData.user === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("create_workspace_for_current_user", {
    p_name: parsed.data.name,
    p_slug_base: slugifyWorkspaceName(parsed.data.name),
  });
  if (error !== null) {
    return NextResponse.json({ error: "workspace_create_failed", message: error.message }, { status: 500 });
  }

  const created = data?.[0];
  if (created === undefined) {
    return NextResponse.json({ error: "workspace_create_failed" }, { status: 500 });
  }

  const body = WorkspaceCreateResponseSchema.parse({
    workspaceId: created.workspace_id,
    workspaceSlug: created.workspace_slug,
    planTier: parsed.data.planTier,
  });
  const response = NextResponse.json(body, { status: 201 });
  response.cookies.set(selectedWorkspaceCookieName, body.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
