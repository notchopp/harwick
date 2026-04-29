import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createApiClient } from "./client.js";

describe("createApiClient", () => {
  it("validates responses at the client boundary", async () => {
    const client = createApiClient({
      baseUrl: "https://app.example.test/",
      fetchImpl: (input, init) => {
        expect(input).toBe("https://app.example.test/api/leads");
        expect(init?.method).toBe("POST");

        return Promise.resolve(new Response(JSON.stringify({ id: "lead-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }));
      },
    });

    const response = await client.request({
      path: "/api/leads",
      method: "POST",
      body: { sourceChannel: "instagram_dm" },
      responseSchema: z.object({ id: z.string() }),
    });

    expect(response.id).toBe("lead-1");
  });
});
