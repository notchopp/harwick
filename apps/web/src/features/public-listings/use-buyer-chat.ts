"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

/**
 * AI-SDK useChat hook bound to the public listing chat route.
 *
 * The route accepts a UIMessage[] body and streams back parts (text +
 * tool calls + tool results) via toUIMessageStreamResponse. The hook
 * gives the chat panel a live `messages` array that auto-updates as
 * tokens stream in.
 *
 * `initialMessages` is the scrollback hydration from the portal GET —
 * pass it once on mount, then the hook owns state.
 */
export function useBuyerChat(params: {
  workspaceSlug: string;
  listingId: string;
  initialMessages?: UIMessage[];
}) {
  return useChat({
    id: `${params.workspaceSlug}:${params.listingId}`,
    transport: new DefaultChatTransport({
      api: `/${params.workspaceSlug}/api/listings/chat?listingId=${encodeURIComponent(params.listingId)}`,
    }),
    ...(params.initialMessages === undefined ? {} : { messages: params.initialMessages }),
  });
}
