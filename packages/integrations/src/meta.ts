import {
  NormalizedLeadEventSchema,
  SocialPostContextSchema,
  type NormalizedLeadEvent,
  type SocialPostContext,
} from "@realty-ops/core";
import { normalizeFreeformText, normalizeInstagramUsername } from "@realty-ops/core";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const MetaWebhookChallengeQuerySchema = z.object({
  "hub.mode": z.literal("subscribe"),
  "hub.verify_token": z.string().trim().min(1),
  "hub.challenge": z.string().trim().min(1),
});

export type MetaWebhookChallengeResult =
  | {
      ok: true;
      challenge: string;
    }
  | {
      ok: false;
      status: 400 | 403;
      reason: "malformed_query" | "invalid_verify_token";
    };

const MetaSenderSchema = z.object({
  id: z.string().trim().min(1),
});

const MetaRecipientSchema = z.object({
  id: z.string().trim().min(1),
});

const MetaMessageSchema = z.object({
  mid: z.string().trim().min(1),
  text: z.string().optional(),
}).passthrough();

const MetaMessagingEventSchema = z.object({
  sender: MetaSenderSchema,
  recipient: MetaRecipientSchema,
  timestamp: z.number().int().positive(),
  message: MetaMessageSchema.optional(),
}).passthrough();

const MetaCommentValueSchema = z.object({
  id: z.string().trim().min(1).optional(),
  comment_id: z.string().trim().min(1).optional(),
  media_id: z.string().trim().min(1).optional(),
  post_id: z.string().trim().min(1).optional(),
  item: z.string().trim().min(1).optional(),
  message: z.string().optional(),
  from: z.object({
    id: z.string().trim().min(1).optional(),
    username: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
  }).optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  permalink: z.string().trim().url().optional(),
  media_type: z.string().trim().min(1).optional(),
}).passthrough();

const MetaChangeSchema = z.object({
  field: z.string().trim().min(1),
  value: MetaCommentValueSchema,
}).passthrough();

const MetaEntrySchema = z.object({
  id: z.string().trim().min(1),
  time: z.number().int().positive().optional(),
  messaging: z.array(MetaMessagingEventSchema).optional(),
  changes: z.array(MetaChangeSchema).optional(),
}).passthrough();

export const MetaWebhookPayloadSchema = z.object({
  object: z.string().trim().min(1),
  entry: z.array(MetaEntrySchema).min(1),
}).passthrough();

export type MetaWebhookPayload = z.infer<typeof MetaWebhookPayloadSchema>;

function channelForMessagingObject(objectName: string): "instagram_dm" | "facebook_dm" {
  return objectName === "page" ? "facebook_dm" : "instagram_dm";
}

function channelForCommentObject(objectName: string): "instagram_comment" | "facebook_comment" {
  return objectName === "page" ? "facebook_comment" : "instagram_comment";
}

function readCommentText(value: z.infer<typeof MetaCommentValueSchema>): string | null {
  return normalizeFreeformText(value.text ?? value.message);
}

function readSourcePostId(value: z.infer<typeof MetaCommentValueSchema>): string | null {
  return value.media_id ?? value.post_id ?? null;
}

export function extractMetaAreas(text: string | null): string[] {
  if (text === null) {
    return [];
  }

  const matches = text.match(/\b(Houston|Cypress|Katy|Spring|Tomball|Pearland|Sugar Land|Richmond|The Woodlands)\b/gi) ?? [];
  return [...new Set(matches.map((match) => match.trim()))].slice(0, 20);
}

export function extractMetaListingHints(text: string | null): string[] {
  if (text === null) {
    return [];
  }

  const hints = [
    /\$[0-9][0-9,]*(?:\.\d+)?/g,
    /\b[1-9]\s*(?:bed|beds|bedroom|bedrooms)\b/gi,
    /\b[1-9](?:\.\d)?\s*(?:bath|baths|bathroom|bathrooms)\b/gi,
    /\b(?:pool|garage|game ?room|office|new construction|closing cost|interest rate|builder incentive|down payment assistance)\b/gi,
  ].flatMap((pattern) => text.match(pattern) ?? []);

  return [...new Set(hints.map((hint) => hint.trim()))].slice(0, 30);
}

function shouldIncludeProviderAccount(params: {
  providerAccountId: string;
  providerAccountIds: readonly string[] | undefined;
}): boolean {
  if (params.providerAccountIds === undefined) {
    return true;
  }

  return params.providerAccountIds.includes(params.providerAccountId);
}

export function buildMetaSocialPostContext(params: {
  workspaceId: string;
  providerAccountId: string;
  sourcePostId: string;
  sourceChannel: "instagram_comment" | "facebook_comment";
  caption: string | null;
  text: string | null;
  permalink: string | null;
  mediaType: string | null;
  fetchedAt?: string;
  rawPayload: unknown;
}): SocialPostContext {
  const caption = normalizeFreeformText(params.caption);
  const text = normalizeFreeformText(params.text);
  const combinedText = [caption, text].filter((value): value is string => value !== null).join("\n");

  return SocialPostContextSchema.parse({
    workspaceId: params.workspaceId,
    provider: "meta",
    providerAccountId: params.providerAccountId,
    sourcePostId: params.sourcePostId,
    sourceChannel: params.sourceChannel,
    caption,
    permalink: params.permalink,
    mediaType: params.mediaType,
    ctaLabel: /\bblueprint\b/i.test(combinedText) ? "buyer blueprint" : null,
    areasMentioned: extractMetaAreas(combinedText.length > 0 ? combinedText : null),
    listingHints: extractMetaListingHints(combinedText.length > 0 ? combinedText : null),
    fetchedAt: params.fetchedAt ?? new Date().toISOString(),
    rawPayload: params.rawPayload,
  });
}

export function verifyMetaWebhookChallenge(params: {
  query: unknown;
  expectedVerifyToken: string;
}): MetaWebhookChallengeResult {
  const parsed = MetaWebhookChallengeQuerySchema.safeParse(params.query);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      reason: "malformed_query",
    };
  }

  if (parsed.data["hub.verify_token"] !== params.expectedVerifyToken) {
    return {
      ok: false,
      status: 403,
      reason: "invalid_verify_token",
    };
  }

  return {
    ok: true,
    challenge: parsed.data["hub.challenge"],
  };
}

export function verifyMetaWebhookSignature(params: {
  rawBody: string;
  appSecret: string;
  signatureHeader: string | null;
}): boolean {
  if (params.signatureHeader === null) {
    return false;
  }

  const [scheme, providedSignature] = params.signatureHeader.split("=", 2);
  if (scheme !== "sha256" || providedSignature === undefined || providedSignature.length === 0) {
    return false;
  }

  const expectedSignature = createHmac("sha256", params.appSecret)
    .update(params.rawBody, "utf8")
    .digest("hex");

  const providedBuffer = Buffer.from(providedSignature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");
  if (providedBuffer.length === 0 || providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export function extractMetaProviderAccountIds(payload: unknown): string[] {
  const parsed = MetaWebhookPayloadSchema.parse(payload);
  const accountIds = new Set<string>();

  for (const entry of parsed.entry) {
    accountIds.add(entry.id);

    for (const messagingEvent of entry.messaging ?? []) {
      accountIds.add(messagingEvent.recipient.id);
    }
  }

  return [...accountIds];
}

export function normalizeMetaWebhookPayload(params: {
  workspaceId: string;
  payload: unknown;
  providerAccountIds?: readonly string[];
}): NormalizedLeadEvent[] {
  const parsed = MetaWebhookPayloadSchema.parse(params.payload);
  const events: NormalizedLeadEvent[] = [];
  const objectName = parsed.object.toLowerCase();

  for (const entry of parsed.entry) {
    for (const messagingEvent of entry.messaging ?? []) {
      if (!shouldIncludeProviderAccount({
        providerAccountId: messagingEvent.recipient.id,
        providerAccountIds: params.providerAccountIds,
      })) {
        continue;
      }

      const text = normalizeFreeformText(messagingEvent.message?.text);
      if (messagingEvent.message?.mid === undefined || text === null) {
        continue;
      }

      events.push(NormalizedLeadEventSchema.parse({
        workspaceId: params.workspaceId,
        provider: "meta",
        eventType: "message_received",
        sourceChannel: channelForMessagingObject(objectName),
        providerEventId: messagingEvent.message.mid,
        providerAccountId: messagingEvent.recipient.id,
        providerUserId: messagingEvent.sender.id,
        sourcePostId: null,
        sourceCommentId: null,
        instagramUsername: null,
        phone: null,
        text,
        occurredAt: new Date(messagingEvent.timestamp * 1000).toISOString(),
        rawPayload: messagingEvent,
      }));
    }

    for (const change of entry.changes ?? []) {
      if (!shouldIncludeProviderAccount({
        providerAccountId: entry.id,
        providerAccountIds: params.providerAccountIds,
      })) {
        continue;
      }

      if (change.field !== "comments" && change.field !== "feed") {
        continue;
      }
      if (objectName === "page" && change.value.item !== undefined && change.value.item !== "comment") {
        continue;
      }

      const providerEventId = change.value.comment_id ?? change.value.id;
      const text = readCommentText(change.value);
      if (providerEventId === undefined || text === null) {
        continue;
      }
      const sourcePostId = readSourcePostId(change.value);

      events.push(NormalizedLeadEventSchema.parse({
        workspaceId: params.workspaceId,
        provider: "meta",
        eventType: "comment_received",
        sourceChannel: channelForCommentObject(objectName),
        providerEventId,
        providerAccountId: entry.id,
        providerUserId: change.value.from?.id ?? null,
        sourcePostId,
        sourceCommentId: providerEventId,
        instagramUsername: objectName === "instagram" ? normalizeInstagramUsername(change.value.from?.username) : null,
        phone: null,
        text,
        occurredAt: new Date((entry.time ?? Date.now() / 1000) * 1000).toISOString(),
        rawPayload: change,
      }));
    }
  }

  return events;
}

export function normalizeMetaSocialPostContexts(params: {
  workspaceId: string;
  payload: unknown;
  providerAccountIds?: readonly string[];
}): SocialPostContext[] {
  const parsed = MetaWebhookPayloadSchema.parse(params.payload);
  const contexts: SocialPostContext[] = [];
  const objectName = parsed.object.toLowerCase();

  for (const entry of parsed.entry) {
    if (!shouldIncludeProviderAccount({
      providerAccountId: entry.id,
      providerAccountIds: params.providerAccountIds,
    })) {
      continue;
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments" && change.field !== "feed") {
        continue;
      }

      const sourcePostId = readSourcePostId(change.value);
      if (sourcePostId === null) {
        continue;
      }

      contexts.push(buildMetaSocialPostContext({
        workspaceId: params.workspaceId,
        providerAccountId: entry.id,
        sourcePostId,
        sourceChannel: channelForCommentObject(objectName),
        caption: change.value.caption ?? null,
        text: readCommentText(change.value),
        permalink: change.value.permalink ?? null,
        mediaType: change.value.media_type ?? null,
        rawPayload: change,
      }));
    }
  }

  return contexts;
}
