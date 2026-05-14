import { HarwickAiRuntimeInputSchema } from "@realty-ops/core";
import { describe, expect, it } from "vitest";

import { createHarwickAiRuntime } from "./ai-sdk-runtime";

describe("createHarwickAiRuntime", () => {
  it("returns a HarwickAiRuntimeClient with runTurn()", () => {
    const client = createHarwickAiRuntime({ apiKey: "sk-test", model: "gpt-4o" });
    expect(typeof client.runTurn).toBe("function");
  });

  it("accepts the same HarwickAiRuntimeInput as the legacy factory", () => {
    const input = HarwickAiRuntimeInputSchema.parse({
      workspaceName: "Test Brokerage",
      channel: "instagram_dm",
      inboundText: "Hey is 1234 Oak still on the market?",
      conversation: [],
      state: null,
      toneProfile: {},
      postContext: null,
      listingContext: null,
      calendarContext: [],
      buyerBlueprintUrl: null,
    });
    expect(input.inboundText).toContain("Oak");

    // Just constructing the client should not perform any network call;
    // sanity-check it doesn't blow up at construction time.
    const client = createHarwickAiRuntime({ apiKey: "sk-test", model: "gpt-4o" });
    expect(client).toBeDefined();
  });

  it("rejects invalid HarwickAiRuntimeInput up front (via schema parse)", async () => {
    const client = createHarwickAiRuntime({ apiKey: "sk-test", model: "gpt-4o" });
    // Missing required workspaceName — schema parse should throw before any
    // network call is attempted.
    await expect(
      client.runTurn({
        workspaceName: 5 as unknown as string,
        channel: "instagram_dm",
        inboundText: "test",
        conversation: [],
      } as Parameters<typeof client.runTurn>[0]),
    ).rejects.toThrow();
  });
});
