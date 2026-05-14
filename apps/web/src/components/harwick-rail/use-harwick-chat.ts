"use client";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";

export function useHarwickChat(params: { workspaceId: string; threadId: string; initialMessages?: UIMessage[] }) {
  return useChat({
    id: params.threadId,
    transport: new DefaultChatTransport({
      api: `/api/workspaces/${params.workspaceId}/harwick-chat`,
    }),
    ...(params.initialMessages === undefined ? {} : { messages: params.initialMessages }),
  });
}
