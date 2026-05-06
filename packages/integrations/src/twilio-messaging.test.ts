import { describe, expect, it, vi } from "vitest";
import { createTwilioMessagingClient } from "./twilio-messaging.js";

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(""),
  } as unknown as Response;
}

describe("createTwilioMessagingClient", () => {
  it("sends SMS through Twilio Messages API", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(createResponse({
      sid: "SM123",
    }));
    const client = createTwilioMessagingClient({ fetchImpl });

    await expect(client.sendSms({
      accountSid: "AC123",
      authToken: "token-1",
      from: "+15550001111",
      to: "+15550002222",
      body: "Open house reminder.",
    })).resolves.toEqual({
      providerEventId: "SM123",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from("AC123:token-1", "utf8").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "From=%2B15550001111&To=%2B15550002222&Body=Open+house+reminder.",
      }),
    );
  });
});
