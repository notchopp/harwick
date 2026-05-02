import { describe, expect, it } from "vitest";
import { buildConversationSandboxThreads } from "./conversation-sandbox";
import {
  draftConversationSandboxReply,
  draftConversationSandboxReplySet,
} from "./conversation-sandbox-reply";

const workspaceId = "11111111-1111-4111-8111-111111111111";

describe("draftConversationSandboxReply", () => {
  it("answers identity questions like Harwick", () => {
    const threads = buildConversationSandboxThreads(workspaceId);
    const thread = {
      ...threads[1]!,
      messages: [
        ...threads[1]!.messages,
        {
          id: "lead-identity",
          kind: "lead" as const,
          body: "wait so who are you",
          meta: "now",
          occurredAt: "2026-04-30T20:30:00.000Z",
        },
      ],
    };

    const draft = draftConversationSandboxReply(thread);

    expect(draft).toContain("I’m Harwick");
    expect(draft).toContain("Brickell");
  });

  it("returns multiple suggestion styles for the same turn", () => {
    const thread = buildConversationSandboxThreads(workspaceId)[0]!;
    const replySet = draftConversationSandboxReplySet(thread);

    expect(replySet.primary.label).toBe("Balanced");
    expect(replySet.suggestions).toHaveLength(3);
    expect(replySet.suggestions.map((suggestion) => suggestion.label)).toEqual([
      "Balanced",
      "Warmer",
      "Direct",
    ]);
    expect(replySet.coachNote).toContain("Best move");
  });

  it("handles greetings with a useful opener", () => {
    const thread = buildConversationSandboxThreads(workspaceId)[5]!;

    const draft = draftConversationSandboxReply({
      ...thread,
      messages: [
        {
          id: "lead-hello",
          kind: "lead",
          body: "hello",
          meta: "now",
          occurredAt: "2026-04-30T20:32:00.000Z",
        },
      ],
    });

    expect(draft).toContain("Harwick");
    expect(draft).toContain("pricing, a tour, or a few comparable options");
  });

  it("moves a showing request forward once phone and budget are captured", () => {
    const thread = buildConversationSandboxThreads(workspaceId)[1]!;

    const replySet = draftConversationSandboxReplySet(thread);

    expect(replySet.primary.reply).toContain("I’ve got 305-555-0143");
    expect(replySet.primary.reply).toContain("Friday after 5");
    expect(replySet.detectedSignals).toContain("phone captured");
    expect(replySet.detectedSignals).toContain("financing captured");
  });

  it("offers a direct human handoff for risky certainty questions", () => {
    const thread = buildConversationSandboxThreads(workspaceId)[1]!;
    const replySet = draftConversationSandboxReplySet({
      ...thread,
      messages: [
        ...thread.messages,
        {
          id: "lead-risk",
          kind: "lead",
          body: "Can you guarantee the legal side and promise approval?",
          meta: "now",
          occurredAt: "2026-04-30T20:40:00.000Z",
        },
      ],
    });

    expect(replySet.primary.reply.toLowerCase()).toContain("confirm the exact financing or legal details");
    expect(replySet.coachNote).toContain("Risky");
  });
});
