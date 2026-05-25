import { describe, expect, it, vi } from "vitest";

import {
  buildVisionRequestBody,
  callVisionWithRetry,
  isHeicMimeType,
  parseVisionMessages,
  resolveMimeType,
} from "./route";

describe("resolveMimeType", () => {
  it("prefers the declared MIME type when present", () => {
    expect(resolveMimeType("image/jpeg", "anything.heic")).toBe("image/jpeg");
  });

  it("falls back to HEIC for empty MIME with .heic filename (iPhone uploads)", () => {
    expect(resolveMimeType("", "IMG_4521.HEIC".toLowerCase())).toBe("image/heic");
    expect(resolveMimeType("", "shot.heif")).toBe("image/heic");
  });

  it("falls back to JPEG/PNG/WEBP/GIF based on extension", () => {
    expect(resolveMimeType("", "screenshot.jpg")).toBe("image/jpeg");
    expect(resolveMimeType("", "screenshot.jpeg")).toBe("image/jpeg");
    expect(resolveMimeType("", "screenshot.png")).toBe("image/png");
    expect(resolveMimeType("", "screenshot.webp")).toBe("image/webp");
    expect(resolveMimeType("", "screenshot.gif")).toBe("image/gif");
  });
});

describe("isHeicMimeType", () => {
  it("matches all HEIC/HEIF variants", () => {
    expect(isHeicMimeType("image/heic")).toBe(true);
    expect(isHeicMimeType("image/heif")).toBe(true);
    expect(isHeicMimeType("image/heic-sequence")).toBe(true);
    expect(isHeicMimeType("image/heif-sequence")).toBe(true);
  });

  it("rejects non-HEIC types", () => {
    expect(isHeicMimeType("image/jpeg")).toBe(false);
    expect(isHeicMimeType("image/png")).toBe(false);
  });
});

describe("buildVisionRequestBody", () => {
  it("attaches the data URI in image_url and asks for JSON", () => {
    const body = buildVisionRequestBody("data:image/jpeg;base64,AAAA");
    expect(body["model"]).toBe("gpt-4o-mini");
    expect(body["response_format"]).toEqual({ type: "json_object" });
    const messages = body["messages"] as Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
    const imagePart = messages[0]?.content.find((part) => part.type === "image_url");
    expect(imagePart?.image_url?.url).toBe("data:image/jpeg;base64,AAAA");
  });
});

describe("parseVisionMessages", () => {
  it("returns trimmed bodies and caps at 12", () => {
    const content = JSON.stringify({
      messages: Array.from({ length: 20 }, (_, i) => ({ body: `Message body number ${i}` })),
    });
    const result = parseVisionMessages(content);
    expect(result).toHaveLength(12);
    expect(result[0]).toBe("Message body number 0");
  });

  it("drops empty or too-short bodies", () => {
    const content = JSON.stringify({
      messages: [{ body: "ok this works" }, { body: "" }, { body: "hi" }, { body: 42 }],
    });
    expect(parseVisionMessages(content)).toEqual(["ok this works"]);
  });

  it("falls back to text-split when the model returns non-JSON", () => {
    const content = "First message body here\n\nSecond message body here";
    const result = parseVisionMessages(content);
    expect(result).toEqual(["First message body here", "Second message body here"]);
  });
});

describe("callVisionWithRetry", () => {
  it("returns the assistant content on first success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "{\"messages\":[]}" } }] }),
    });
    const result = await callVisionWithRetry({
      apiKey: "sk-test",
      requestBody: { hello: "world" },
      timeoutMs: 100,
      fetchImpl,
    });
    expect(result).toBe("{\"messages\":[]}");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on a 4xx response — fails fast", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("unauthorized"),
    });
    await expect(
      callVisionWithRetry({
        apiKey: "sk-test",
        requestBody: {},
        timeoutMs: 100,
        fetchImpl,
        maxAttempts: 2,
      }),
    ).rejects.toThrow(/401/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("retries once on an AbortError (timeout) and succeeds", async () => {
    const fetchImpl = vi.fn()
      .mockImplementationOnce(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: "retried-ok" } }] }),
      });

    const result = await callVisionWithRetry({
      apiKey: "sk-test",
      requestBody: {},
      timeoutMs: 100,
      fetchImpl,
    });
    expect(result).toBe("retried-ok");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured retry budget", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => {
      const error = new Error("aborted");
      error.name = "AbortError";
      return Promise.reject(error);
    });
    await expect(
      callVisionWithRetry({
        apiKey: "sk-test",
        requestBody: {},
        timeoutMs: 50,
        fetchImpl,
        maxAttempts: 2,
      }),
    ).rejects.toThrow(/abort/i);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
