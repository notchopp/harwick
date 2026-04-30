import { SocialReplyQueueActionRequestSchema, UuidSchema } from "@realty-ops/core";
import { createMetaMessagingClient } from "@realty-ops/integrations";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { sendMetaReply } from "../../../../../../../features/integrations/meta-reply-send";
import { actOnSocialReplyReview } from "../../../../../../../features/operator-queues/operator-queues";
import { getServerEnvironment } from "../../../../../../../lib/server-env";
import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { createSupabaseMetaCredentialRepository } from "../../../../../../../lib/supabase/integration-accounts";
import { createSupabaseLeadEventRepository } from "../../../../../../../lib/supabase/lead-events";
import { createSupabaseSocialReplyQueueRepository } from "../../../../../../../lib/supabase/operator-queues";
import { createServerSupabaseClient } from "../../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
    reviewId: string;
  }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId, reviewId } = await context.params;
  if (!UuidSchema.safeParse(workspaceId).success || !UuidSchema.safeParse(reviewId).success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({ request, workspaceId });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const parsedAction = SocialReplyQueueActionRequestSchema.parse(body);
    const supabase = createServerSupabaseClient();
    const environment = getServerEnvironment();
    const sendReply = parsedAction.action === "send" && environment.CREDENTIAL_ENCRYPTION_KEY !== undefined
      ? (replyRequest: Parameters<typeof sendMetaReply>[0]["request"]) => {
          return sendMetaReply({
            request: replyRequest,
            credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY!,
            credentialRepository: createSupabaseMetaCredentialRepository(supabase),
            leadEventRepository: createSupabaseLeadEventRepository(supabase),
            metaClient: createMetaMessagingClient(),
          });
        }
      : undefined;
    const result = await actOnSocialReplyReview({
      workspaceId,
      reviewId,
      memberId: membership.memberId,
      request: parsedAction,
      repository: createSupabaseSocialReplyQueueRepository(supabase),
      ...(sendReply === undefined ? {} : { sendReply }),
    });

    if (result === null) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    return NextResponse.json({ item: result }, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    throw error;
  }
}
