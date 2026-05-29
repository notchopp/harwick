import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { authorizeWorkspaceRequest } from "../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import {
  buildShareLink,
  DM_SHARE_TEMPLATES,
  renderDmShareMessage,
} from "../../../features/share-links/share-link";

export const runtime = "nodejs";

/**
 * GET /api/share-links?workspaceId=X&listingId=Y[&memberId=Z][&templateId=T]
 *
 * Returns the share link + the rendered DM message for the requesting agent
 * (or the specified memberId when team leads share on behalf of an agent).
 * Includes all DM-share template options so the operator UI can let the agent
 * pick + re-roll.
 */

const QuerySchema = z.object({
  workspaceId: UuidSchema,
  listingId: UuidSchema,
  memberId: UuidSchema.optional(),
  templateId: z.string().optional(),
});

export async function GET(request: NextRequest) {
  const query = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: query.data.workspaceId,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const targetMemberId = query.data.memberId ?? membership.memberId;

  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const { data: workspace } = await untyped
    .from("workspaces")
    .select("id, slug")
    .eq("id", query.data.workspaceId)
    .maybeSingle();
  if (workspace === null || workspace === undefined) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: member } = await untyped
    .from("workspace_members")
    .select("id, display_name")
    .eq("id", targetMemberId)
    .eq("workspace_id", query.data.workspaceId)
    .maybeSingle();
  if (member === null || member === undefined) {
    return NextResponse.json({ error: "member_not_found" }, { status: 404 });
  }

  const { data: listing } = await untyped
    .from("listings")
    .select("id, address, city, state")
    .eq("id", query.data.listingId)
    .eq("workspace_id", query.data.workspaceId)
    .maybeSingle();

  const listingShortAddress = listing === null || listing === undefined
    ? "this listing"
    : ((listing.address as string | null)?.split(",")[0]?.trim() ?? "this listing");

  const origin = request.nextUrl.origin;
  const link = buildShareLink({
    origin,
    workspaceSlug: workspace.slug ?? workspace.id,
    listingId: query.data.listingId,
    agent: {
      memberId: member.id,
      displayName: member.display_name ?? "Agent",
    },
  });

  const firstName = (member.display_name as string | null)?.split(/\s+/)[0] ?? "there";
  const templates = DM_SHARE_TEMPLATES.map((t) => ({
    id: t.id,
    label: t.label,
    message: renderDmShareMessage({
      templateId: t.id,
      link: link.url,
      firstName: null,
      listingShortAddress,
      agentFirstName: firstName,
    }),
  }));

  const chosenTemplateId = query.data.templateId ?? DM_SHARE_TEMPLATES[0]!.id;
  const message = templates.find((t) => t.id === chosenTemplateId)?.message ?? templates[0]!.message;

  return NextResponse.json({
    link: link.url,
    agentSlug: link.agentSlug,
    sig: link.sig,
    message,
    templates,
  });
}
