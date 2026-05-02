import { describe, expect, it } from "vitest";
import {
  appendConversationLeadMessage,
  buildConversationSandboxThreads,
  isConversationSandboxThread,
  mergeConversationThreadsWithSandbox,
} from "./conversation-sandbox";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("conversation sandbox helpers", () => {
  it("builds local sandbox threads for development testing", () => {
    const threads = buildConversationSandboxThreads(workspaceId);

    expect(threads.length).toBeGreaterThanOrEqual(6);
    expect(threads.every((thread) => isConversationSandboxThread(thread))).toBe(true);
    expect(threads.every((thread) => thread.reviewId === null)).toBe(true);
  });

  it("merges sandbox threads without duplicating ids", () => {
    const sandboxThreads = buildConversationSandboxThreads(workspaceId);
    const merged = mergeConversationThreadsWithSandbox([sandboxThreads[0]!], workspaceId);

    expect(merged).toHaveLength(sandboxThreads.length);
    expect(merged.filter((thread) => thread.id === sandboxThreads[0]?.id)).toHaveLength(1);
  });

  it("appends a simulated inbound lead message and clears prior ai actions", () => {
    const [thread] = buildConversationSandboxThreads(workspaceId);
    expect(thread).toBeDefined();

    const withAiAction = {
      ...thread!,
      messages: [
        ...thread!.messages,
        {
          id: "ai-action",
          kind: "ai_action" as const,
          body: "Draft reply",
          meta: "AI Action",
          occurredAt: "2026-04-30T20:20:00.000Z",
        },
      ],
    };

    const updated = appendConversationLeadMessage(withAiAction, "Can I tour it this Friday?");

    expect(updated.preview).toBe("Can I tour it this Friday?");
    expect(updated.lastTouchLabel).toBe("now");
    expect(updated.messages.at(-1)).toMatchObject({
      kind: "lead",
      body: "Can I tour it this Friday?",
    });
    expect(updated.messages.some((message) => message.kind === "ai_action")).toBe(false);
  });
});
