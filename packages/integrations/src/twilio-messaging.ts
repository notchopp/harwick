import { z } from "zod";

const TwilioMessageResponseSchema = z.object({
  sid: z.string().trim().min(1),
}).passthrough();

export type TwilioMessagingClientOptions = {
  fetchImpl?: typeof fetch;
};

export function createTwilioMessagingClient(options: TwilioMessagingClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async sendSms(params: {
      accountSid: string;
      authToken: string;
      from: string;
      to: string;
      body: string;
    }): Promise<{ providerEventId: string }> {
      const form = new URLSearchParams();
      form.set("From", params.from);
      form.set("To", params.to);
      form.set("Body", params.body);

      const credentials = Buffer.from(`${params.accountSid}:${params.authToken}`, "utf8").toString("base64");
      const response = await fetchImpl(
        `https://api.twilio.com/2010-04-01/Accounts/${params.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        },
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Twilio messaging request failed (${response.status}): ${text}`);
      }

      const parsed = TwilioMessageResponseSchema.parse(await response.json());
      return {
        providerEventId: parsed.sid,
      };
    },
  };
}
