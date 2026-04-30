import type { NextRequest } from "next/server";
import type { AuthWorkspaceMembership } from "@realty-ops/core";
import { getAuthSessionSummary } from "../supabase/auth";
import { createUserSupabaseClient } from "../supabase/server-client";
import { createCookieSupabaseServerClient } from "../supabase/ssr-server";

export function readBearerToken(request: NextRequest): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization === null) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || token === undefined || token.trim().length === 0) {
    return null;
  }

  return token.trim();
}

export async function authorizeWorkspaceRequest(params: {
  request: NextRequest;
  workspaceId: string;
  allowedRoles?: ReadonlySet<AuthWorkspaceMembership["role"]>;
}): Promise<AuthWorkspaceMembership | null> {
  const accessToken = readBearerToken(params.request);
  if (accessToken !== null) {
    const session = await getAuthSessionSummary({
      supabase: createUserSupabaseClient(accessToken),
      accessToken,
    });
    const membership = session?.memberships.find((candidate) => candidate.workspaceId === params.workspaceId) ?? null;
    if (membership === null) {
      return null;
    }

    if (params.allowedRoles !== undefined && !params.allowedRoles.has(membership.role)) {
      return null;
    }

    return membership;
  }

  const supabase = await createCookieSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError !== null || userData.user === null) {
    return null;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const cookieAccessToken = sessionData.session?.access_token;
  if (cookieAccessToken === undefined) {
    return null;
  }

  const session = await getAuthSessionSummary({
    supabase: createUserSupabaseClient(cookieAccessToken),
    accessToken: cookieAccessToken,
  });
  const membership = session?.memberships.find((candidate) => candidate.workspaceId === params.workspaceId) ?? null;
  if (membership === null) {
    return null;
  }

  if (params.allowedRoles !== undefined && !params.allowedRoles.has(membership.role)) {
    return null;
  }

  return membership;
}
