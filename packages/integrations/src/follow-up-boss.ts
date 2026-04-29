import { createHmac, timingSafeEqual } from "node:crypto";
import {
  FollowUpBossWebhookEventTypeSchema,
  type FollowUpBossWebhookEventType,
} from "@realty-ops/core";
import { z } from "zod";

const FOLLOW_UP_BOSS_API_BASE_URL = "https://api.followupboss.com/v1";

export const FollowUpBossLeadEventInputSchema = z.object({
  source: z.string().trim().min(1).max(120),
  system: z.string().trim().min(1).max(120).default("Realty Ops"),
  type: z.enum(["General Inquiry", "Property Inquiry", "Seller Inquiry", "Incoming Call"]),
  message: z.string().trim().min(1).max(4000),
  description: z.string().trim().min(1).max(4000).optional(),
  person: z.object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(160).optional(),
    emails: z.array(z.object({ value: z.string().trim().email() })).optional(),
    phones: z.array(z.object({ value: z.string().trim().min(7).max(32) })).optional(),
  }),
  property: z.object({
    street: z.string().trim().min(1).max(180).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    state: z.string().trim().min(1).max(80).optional(),
    code: z.string().trim().min(1).max(20).optional(),
    price: z.number().int().nonnegative().optional(),
  }).optional(),
});

const FollowUpBossEventResponseSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
}).passthrough();

const FollowUpBossWebhookSubscriptionInputSchema = z.object({
  event: FollowUpBossWebhookEventTypeSchema,
  url: z.string().trim().url(),
  system: z.string().trim().min(1).max(160),
  systemKey: z.string().trim().min(16).max(256),
});

const FollowUpBossWebhookSubscriptionResponseSchema = z.object({
  id: z.union([z.string(), z.number()]),
  status: z.string().trim().min(1).optional(),
  event: FollowUpBossWebhookEventTypeSchema.optional(),
  url: z.string().trim().url().optional(),
}).passthrough();

export type FollowUpBossLeadEventInput = z.input<typeof FollowUpBossLeadEventInputSchema>;
export type FollowUpBossWebhookSubscriptionInput = z.input<typeof FollowUpBossWebhookSubscriptionInputSchema>;
export type FollowUpBossWebhookSubscription = {
  id: string;
  status: string | null;
  event: FollowUpBossWebhookEventType | null;
  url: string | null;
};

export type FollowUpBossClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
};

function buildAuthorizationHeader(apiKey: string): string {
  const token = Buffer.from(`${apiKey}:`, "utf8").toString("base64");
  return `Basic ${token}`;
}

function buildSystemHeaders(input: FollowUpBossWebhookSubscriptionInput) {
  return {
    "X-System": input.system,
    "X-System-Key": input.systemKey,
  };
}

function parseWebhookSubscription(
  value: unknown,
): FollowUpBossWebhookSubscription {
  const parsed = FollowUpBossWebhookSubscriptionResponseSchema.parse(value);

  return {
    id: String(parsed.id),
    status: parsed.status ?? null,
    event: parsed.event ?? null,
    url: parsed.url ?? null,
  };
}

function toAbsoluteFollowUpBossResourceUri(resourceUri: string): string {
  if (/^https?:\/\//i.test(resourceUri)) {
    return resourceUri;
  }

  return `${FOLLOW_UP_BOSS_API_BASE_URL}${resourceUri.startsWith("/") ? "" : "/"}${resourceUri}`;
}

export function verifyFollowUpBossWebhookSignature(params: {
  rawBody: string;
  signature: string | null;
  systemKey: string;
}): boolean {
  if (params.signature === null || params.signature.length === 0) {
    return false;
  }

  const expected = createHmac("sha256", params.systemKey)
    .update(Buffer.from(params.rawBody, "utf8").toString("base64"), "utf8")
    .digest("hex");
  const actual = params.signature.trim();

  if (actual.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(actual, "utf8"),
    Buffer.from(expected, "utf8"),
  );
}

export function createFollowUpBossClient(options: FollowUpBossClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async sendLeadEvent(input: FollowUpBossLeadEventInput): Promise<string | null> {
      const parsed = FollowUpBossLeadEventInputSchema.parse(input);
      const response = await fetchImpl(`${FOLLOW_UP_BOSS_API_BASE_URL}/events`, {
        method: "POST",
        headers: {
          Authorization: buildAuthorizationHeader(options.apiKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parsed),
      });

      if (response.status === 204) {
        return null;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Follow Up Boss event sync failed (${response.status}): ${text}`);
      }

      const body = FollowUpBossEventResponseSchema.parse(await response.json());
      return body.id === undefined ? null : String(body.id);
    },

    async createWebhookSubscription(
      input: FollowUpBossWebhookSubscriptionInput,
    ): Promise<FollowUpBossWebhookSubscription> {
      const parsed = FollowUpBossWebhookSubscriptionInputSchema.parse(input);
      const response = await fetchImpl(`${FOLLOW_UP_BOSS_API_BASE_URL}/webhooks`, {
        method: "POST",
        headers: {
          Authorization: buildAuthorizationHeader(options.apiKey),
          "Content-Type": "application/json",
          ...buildSystemHeaders(parsed),
        },
        body: JSON.stringify({
          event: parsed.event,
          url: parsed.url,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Follow Up Boss webhook registration failed (${response.status}): ${text}`);
      }

      return parseWebhookSubscription(await response.json());
    },

    async fetchResource(resourceUri: string): Promise<unknown> {
      const response = await fetchImpl(toAbsoluteFollowUpBossResourceUri(resourceUri), {
        method: "GET",
        headers: {
          Authorization: buildAuthorizationHeader(options.apiKey),
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Follow Up Boss resource fetch failed (${response.status}): ${text}`);
      }

      return response.json();
    },
  };
}
