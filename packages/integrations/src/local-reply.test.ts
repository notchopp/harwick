import { describe, expect, it } from "vitest";
import { createLocalReplyClient } from "./local-reply.js";

describe("createLocalReplyClient", () => {
  it("uses post context for listing questions", async () => {
    const client = createLocalReplyClient();

    const draft = await client.draftReply({
      workspaceName: "Harwick",
      channel: "instagram_dm",
      leadText: "What is the price and can you send more details?",
      leadContext: "Purchase • Coral Gables • 30-60 days • $900k-$1.1M",
      postContext: {
        caption: "Coral Gables family home with pool near Miracle Mile.",
        ctaLabel: "Send details",
        areasMentioned: ["Coral Gables"],
        listingHints: ["$998k", "4bd / 3ba", "Pool"],
        permalink: "https://example.com/listing",
      },
      buyerBlueprintUrl: null,
      listingContext: null,
    });

    expect(draft).toMatchObject({
      intent: "listing_question",
      nextAction: "ask_qualification",
      policyFlags: ["safe_to_send"],
    });
    expect(draft.reply).toContain("$998k");
  });

  it("sends the buyer blueprint when requested", async () => {
    const client = createLocalReplyClient();

    const draft = await client.draftReply({
      workspaceName: "Harwick",
      channel: "instagram_comment",
      leadText: "Send me the buyer blueprint please",
      leadContext: "Buyer blueprint • Weston • Unknown • $700k-$850k",
      postContext: null,
      buyerBlueprintUrl: "https://example.com/blueprint",
      listingContext: null,
    });

    expect(draft).toMatchObject({
      intent: "blueprint_request",
      nextAction: "send_buyer_blueprint",
    });
    expect(draft.reply).toContain("https://example.com/blueprint");
  });

  it("keeps financing replies safe and avoids certainty", async () => {
    const client = createLocalReplyClient();

    const draft = await client.draftReply({
      workspaceName: "Harwick",
      channel: "facebook_dm",
      leadText: "How much down payment would I need around 450k?",
      leadContext: "Purchase • Pembroke Pines • 60-90 days • $420k-$500k",
      postContext: null,
      buyerBlueprintUrl: null,
      listingContext: null,
    });

    expect(draft).toMatchObject({
      intent: "financing_question",
      nextAction: "ask_qualification",
      policyFlags: ["safe_to_send"],
    });
    expect(draft.reply.toLowerCase()).toContain("depends");
    expect(draft.reply.toLowerCase()).not.toContain("guarantee");
  });

  it("hands off legal or guaranteed-rate asks", async () => {
    const client = createLocalReplyClient();

    await expect(client.draftReply({
      workspaceName: "Harwick",
      channel: "facebook_dm",
      leadText: "Can you guarantee I can lock a 5.5% rate and tell me the legal steps?",
      leadContext: "Purchase • Brickell • This week • $850k-$950k",
      postContext: null,
      buyerBlueprintUrl: null,
      listingContext: null,
    })).resolves.toMatchObject({
      intent: "financing_question",
      nextAction: "handoff_to_agent",
      policyFlags: ["needs_human_review"],
    });
  });

  it("answers identity questions like Harwick instead of a generic placeholder", async () => {
    const client = createLocalReplyClient();

    const draft = await client.draftReply({
      workspaceName: "Harwick",
      channel: "facebook_dm",
      leadText: "wait so who are you",
      leadContext: "Purchase • Brickell • This week • $850k-$950k",
      postContext: null,
      buyerBlueprintUrl: null,
      listingContext: "Brickell bay-view condo • $915k • 3bd / 2ba",
    });

    expect(draft).toMatchObject({
      intent: "general_follow_up",
      nextAction: "ask_qualification",
      policyFlags: ["safe_to_send"],
    });
    expect(draft.reply).toContain("I’m Harwick");
    expect(draft.reply).toContain("Brickell");
  });

  it("handles simple greetings with a real opener", async () => {
    const client = createLocalReplyClient();

    const draft = await client.draftReply({
      workspaceName: "Harwick",
      channel: "instagram_dm",
      leadText: "hello",
      leadContext: "Purchase • Weston • 30-60 days • $700k-$850k",
      postContext: null,
      buyerBlueprintUrl: null,
      listingContext: "Weston relocation search",
    });

    expect(draft).toMatchObject({
      intent: "general_follow_up",
      nextAction: "ask_qualification",
      policyFlags: ["safe_to_send"],
    });
    expect(draft.reply).toContain("Harwick");
    expect(draft.reply).toContain("pricing, a tour, or a few comparable options");
  });
});
