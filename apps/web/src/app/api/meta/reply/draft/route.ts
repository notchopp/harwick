import { NextResponse } from "next/server";
import { createOpenAIReplyClient } from "@realty-ops/integrations";
import { checkRateLimit, rateLimitKeyFromRequest } from "../../../../../lib/rate-limit";
import { getServerEnvironment } from "../../../../../lib/server-env";
import {
  hydrateMetaSocialPostContext,
  isSocialPostContextThin,
} from "../../../../../lib/meta-post-hydration";
import { createServerSupabaseClient } from "../../../../../lib/supabase/server-client";
import { createSupabaseMetaCredentialRepository } from "../../../../../lib/supabase/integration-accounts";
import { createSupabaseSocialPostRepository } from "../../../../../lib/supabase/social-posts";

export const runtime = "nodejs";

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit({
    key: rateLimitKeyFromRequest({ request, namespace: "meta-reply-draft" }),
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const environment = getServerEnvironment();
  if (environment.OPENAI_API_KEY === undefined) {
    return NextResponse.json({ error: "missing_openai_api_key" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const record = body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
  const leadText = readString(record, "leadText");
  const workspaceName = readString(record, "workspaceName") ?? "the team";
  const rawChannel = record["channel"];
  const channel = rawChannel === "instagram_comment" || rawChannel === "facebook_dm" || rawChannel === "facebook_comment"
    ? rawChannel
    : "instagram_dm";
  const leadContext = readString(record, "leadContext");
  const workspaceId = readString(record, "workspaceId");
  const sourcePostId = readString(record, "sourcePostId");
  const providerAccountId = readString(record, "providerAccountId");
  const buyerBlueprintUrl = readString(record, "buyerBlueprintUrl");

  if (leadText === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const socialPostRepository = createSupabaseSocialPostRepository(supabase);
  const integrationRepository = createSupabaseMetaCredentialRepository(supabase);
  let postContext = workspaceId !== null && sourcePostId !== null
    ? await socialPostRepository.findPostContext({
        workspaceId,
        provider: "meta",
        sourcePostId,
      })
    : null;

  if (
    workspaceId !== null
    && sourcePostId !== null
    && environment.CREDENTIAL_ENCRYPTION_KEY !== undefined
    && (channel === "instagram_comment" || channel === "facebook_comment")
  ) {
    const hydratedContext = postContext !== null && isSocialPostContextThin({
      caption: postContext.caption,
      permalink: postContext.permalink,
      mediaType: postContext.media_type,
      ctaLabel: postContext.cta_label,
      areasMentioned: postContext.areas_mentioned,
      listingHints: postContext.listing_hints,
    })
      ? await hydrateMetaSocialPostContext({
          workspaceId,
          providerAccountId: postContext.provider_account_id,
          sourcePostId,
          sourceChannel: postContext.source_channel,
          credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
          integrationRepository,
        })
      : (
          postContext === null && providerAccountId !== null
            ? await hydrateMetaSocialPostContext({
                workspaceId,
                providerAccountId,
                sourcePostId,
                sourceChannel: channel,
                credentialSecret: environment.CREDENTIAL_ENCRYPTION_KEY,
                integrationRepository,
              })
            : null
        );

    if (hydratedContext !== null) {
      await socialPostRepository.upsertPostContexts([hydratedContext]);
      postContext = await socialPostRepository.findPostContext({
        workspaceId,
        provider: "meta",
        sourcePostId,
      });
    }
  }

  const draft = await createOpenAIReplyClient({
    apiKey: environment.OPENAI_API_KEY,
    model: environment.OPENAI_REPLY_MODEL,
  }).draftReply({
    workspaceName,
    channel,
    leadText,
    leadContext,
    buyerBlueprintUrl,
    postContext: postContext === null ? null : {
      caption: postContext.caption,
      ctaLabel: postContext.cta_label,
      areasMentioned: postContext.areas_mentioned,
      listingHints: postContext.listing_hints,
      permalink: postContext.permalink,
    },
  });

  return NextResponse.json({
    ...draft,
    status: "draft",
  });
}
