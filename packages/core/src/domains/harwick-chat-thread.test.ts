import { describe, expect, it } from "vitest";

import {
  HarwickChannelCreateSchema,
  HarwickChannelMessageCreateSchema,
  HarwickChatThreadCreateSchema,
  HarwickChatThreadUpdateSchema,
  detectHarwickMention,
} from "./harwick-chat-thread.js";

describe("HarwickChatThreadCreateSchema", () => {
  it("accepts an empty body and lets the server default the title", () => {
    const parsed = HarwickChatThreadCreateSchema.safeParse({});
    expect(parsed.success).toBe(true);
  });

  it("trims and bounds long titles", () => {
    const parsed = HarwickChatThreadCreateSchema.safeParse({ title: " hi " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.title).toBe("hi");
  });

  it("rejects whitespace-only titles", () => {
    const parsed = HarwickChatThreadCreateSchema.safeParse({ title: "   " });
    expect(parsed.success).toBe(false);
  });
});

describe("HarwickChatThreadUpdateSchema", () => {
  it("accepts archived: true", () => {
    const parsed = HarwickChatThreadUpdateSchema.safeParse({ archived: true });
    expect(parsed.success).toBe(true);
  });

  it("accepts a title change", () => {
    const parsed = HarwickChatThreadUpdateSchema.safeParse({ title: "Oak Ave research" });
    expect(parsed.success).toBe(true);
  });
});

describe("HarwickChannelCreateSchema", () => {
  it("defaults kind to channel", () => {
    const parsed = HarwickChannelCreateSchema.safeParse({ name: "oak-ave-deal" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe("channel");
  });

  it("rejects an empty name", () => {
    const parsed = HarwickChannelCreateSchema.safeParse({ name: " " });
    expect(parsed.success).toBe(false);
  });
});

describe("HarwickChannelMessageCreateSchema", () => {
  it("rejects empty bodies", () => {
    expect(HarwickChannelMessageCreateSchema.safeParse({ body: "" }).success).toBe(false);
    expect(HarwickChannelMessageCreateSchema.safeParse({ body: "  " }).success).toBe(false);
  });

  it("trims body whitespace", () => {
    const parsed = HarwickChannelMessageCreateSchema.safeParse({ body: "  hi  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.body).toBe("hi");
  });
});

describe("detectHarwickMention", () => {
  it("detects @harwick anywhere in the body", () => {
    expect(detectHarwickMention("hey @harwick can you look at this")).toBe(true);
    expect(detectHarwickMention("@harwick")).toBe(true);
    expect(detectHarwickMention("ping @Harwick please")).toBe(true);
  });

  it("does not match substrings or near-matches", () => {
    expect(detectHarwickMention("harwick")).toBe(false);
    expect(detectHarwickMention("@harwicker")).toBe(false);
    expect(detectHarwickMention("email harwick@example.com")).toBe(false);
  });

  it("returns false on empty input", () => {
    expect(detectHarwickMention("")).toBe(false);
  });
});
