import { describe, expect, it, vi } from "vitest";
import { createOpenAIReplyClient } from "./openai-reply.js";

describe("createOpenAIReplyClient", () => {
  it("drafts replies with the Responses API", async () => {
    const response = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        output_text: JSON.stringify({
          intent: "listing_question",
          nextAction: "ask_qualification",
          missingFields: ["timeline"],
          confidence: 0.82,
          policyFlags: ["safe_to_send"],
          reply: "That one is listed at $339,990 with 5 beds, 3 baths, a 3-car garage, game room, and office. Are you looking to move soon or just browsing?",
        }),
      }),
      text: vi.fn().mockResolvedValue(""),
    };
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const client = createOpenAIReplyClient({
      apiKey: "openai-key",
      model: "gpt-5.2",
      fetchImpl,
    });

    await expect(client.draftReply({
      workspaceName: "Houston Homes",
      channel: "instagram_comment",
      leadText: "Price?",
      leadContext: null,
      postContext: {
        caption: "40 mins from Houston. 5 bed, 3 bath, 3 car garage. $339,990.",
        ctaLabel: null,
        areasMentioned: ["Houston"],
        listingHints: ["$339,990", "5 bed", "3 bath", "3 car garage"],
        permalink: null,
      },
    })).resolves.toEqual(expect.objectContaining({
      intent: "listing_question",
      reply: expect.stringContaining("$339,990") as string,
    }));

    expect(fetchImpl).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("\"model\":\"gpt-5.2\"") as string,
    }));
    const [, requestInit] = fetchImpl.mock.calls[0] as [string, RequestInit];
    const requestBody = JSON.parse(requestInit.body as string) as Record<string, unknown>;
    expect(JSON.stringify(requestBody)).toContain("Post context");
  });
});
