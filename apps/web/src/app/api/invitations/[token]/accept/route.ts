import { WorkspaceInvitationAcceptResponseSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { selectedWorkspaceCookieName } from "../../../../../features/auth/session";
import { createCookieSupabaseServerClient } from "../../../../../lib/supabase/ssr-server";

export const runtime = "nodejs";

type AcceptRow = { workspace_id: string; workspace_slug: string };

const KNOWN_ACCEPT_ERRORS: Record<string, { status: number; code: string }> = {
  not_authenticated: { status: 401, code: "unauthorized" },
  invitation_not_found: { status: 404, code: "not_found" },
  invitation_revoked: { status: 410, code: "revoked" },
  invitation_expired: { status: 410, code: "expired" },
  invitation_email_mismatch: { status: 403, code: "email_mismatch" },
  user_not_found: { status: 401, code: "unauthorized" },
};

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (typeof token !== "string" || token.length < 16 || token.length > 128) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  const supabase = await createCookieSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError !== null || userData.user === null) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .rpc("accept_workspace_invitation", { p_token: token })
    .returns<AcceptRow[]>();
  if (error !== null) {
    const errCode = error.message
      .split(":")
      .map((part) => part.trim())
      .find((part) => part in KNOWN_ACCEPT_ERRORS);
    if (errCode !== undefined) {
      const meta = KNOWN_ACCEPT_ERRORS[errCode]!;
      return NextResponse.json({ error: meta.code }, { status: meta.status });
    }
    return NextResponse.json(
      { error: "accept_failed", message: error.message },
      { status: 500 },
    );
  }

  const row = data?.[0];
  if (row === undefined) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = WorkspaceInvitationAcceptResponseSchema.parse({
    workspaceId: row.workspace_id,
    workspaceSlug: row.workspace_slug,
  });
  const response = NextResponse.json(body, { status: 200 });
  response.cookies.set(selectedWorkspaceCookieName, body.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  return response;
}
