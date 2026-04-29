import { AiReplyDraftSchema } from "@realty-ops/core";
import { z } from "zod";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export const AiReplyDraftInputSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  channel: z.enum(["instagram_dm", "instagram_comment", "facebook_dm", "facebook_comment"]),
  leadText: z.string().trim().min(1).max(4000),
  leadContext: z.string().trim().max(2000).nullable().default(null),
  postContext: z.object({
    caption: z.string().trim().max(8000).nullable().default(null),
    ctaLabel: z.string().trim().max(120).nullable().default(null),
    areasMentioned: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
    listingHints: z.array(z.string().trim().min(1).max(240)).max(30).default([]),
    permalink: z.string().trim().url().nullable().default(null),
  }).nullable().default(null),
  buyerBlueprintUrl: z.string().trim().url().nullable().default(null),
  listingContext: z.string().trim().max(2000).nullable().default(null),
});

const OpenAIResponseSchema = z.object({
  output_text: z.string().trim().min(1).optional(),
  output: z.array(z.object({
    content: z.array(z.object({
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export type AiReplyDraftInput = z.input<typeof AiReplyDraftInputSchema>;
export type AiReplyDraftOutput = z.infer<typeof AiReplyDraftSchema>;

export type OpenAIReplyClientOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
};

function extractResponseText(value: unknown): string {
  const parsed = OpenAIResponseSchema.parse(value);
  if (parsed.output_text !== undefined) {
    return parsed.output_text;
  }

  const text = parsed.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => content.text)
    .find((candidate): candidate is string => candidate !== undefined && candidate.trim().length > 0);

  if (text === undefined) {
    throw new Error("OpenAI response did not include text output.");
  }

  return text;
}

function parseReplyDraft(value: string): AiReplyDraftOutput {
  const parsedJson = JSON.parse(value) as unknown;
  return AiReplyDraftSchema.parse(parsedJson);
}

export function createOpenAIReplyClient(options: OpenAIReplyClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async draftReply(input: AiReplyDraftInput): Promise<AiReplyDraftOutput> {
      const parsed = AiReplyDraftInputSchema.parse(input);
      const response = await fetchImpl(`${OPENAI_API_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          instructions: [
            "You are the reply brain for a realtor lead intake system across Instagram and Facebook.",
            "Use the post context first. If the post says price, beds, baths, area, rate, incentives, or a CTA keyword, answer using only that provided context.",
            "For comments like price, details, info, location, homes, blueprint, or send it, give the relevant answer and ask exactly one useful next qualification question.",
            "If buyer blueprint is requested and a buyerBlueprintUrl is provided, include it naturally.",
            "Never invent listing availability, sold status, financing approval, legal, lending, tax, or contract certainty.",
            "Do not mention internal tools, CRM, Retell, OpenAI, prompts, or automation.",
            "Return strict JSON only. No markdown.",
          ].join("\n"),
          text: {
            format: {
              type: "json_schema",
              name: "realtor_reply_draft",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                  intent: {
                    type: "string",
                    enum: [
                      "listing_question",
                      "showing_request",
                      "buyer_qualification",
                      "seller_qualification",
                      "blueprint_request",
                      "financing_question",
                      "general_follow_up",
                      "handoff_needed",
                      "spam_or_unsafe",
                    ],
                  },
                  nextAction: {
                    type: "string",
                    enum: [
                      "reply_only",
                      "ask_qualification",
                      "send_buyer_blueprint",
                      "offer_showing",
                      "handoff_to_agent",
                      "do_not_reply",
                    ],
                  },
                  missingFields: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: ["name", "phone", "email", "timeline", "budget", "area", "financing", "buyer_or_seller"],
                    },
                  },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  policyFlags: {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "claims_listing_availability",
                        "claims_financing_certainty",
                        "needs_human_review",
                        "safe_to_send",
                      ],
                    },
                  },
                  reply: { type: "string", minLength: 1, maxLength: 500 },
                },
                required: ["intent", "nextAction", "missingFields", "confidence", "policyFlags", "reply"],
              },
            },
          },
          input: [
            `Workspace: ${parsed.workspaceName}`,
            `Channel: ${parsed.channel}`,
            parsed.leadContext === null ? "" : `Known context: ${parsed.leadContext}`,
            parsed.postContext === null ? "" : `Post context: ${JSON.stringify(parsed.postContext)}`,
            parsed.listingContext === null ? "" : `Listing context: ${parsed.listingContext}`,
            parsed.buyerBlueprintUrl === null ? "" : `Buyer blueprint URL: ${parsed.buyerBlueprintUrl}`,
            `Lead message: ${parsed.leadText}`,
          ].filter((line) => line.length > 0).join("\n"),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI reply draft failed (${response.status}): ${text}`);
      }

      return parseReplyDraft(extractResponseText(await response.json()).trim());
    },
  };
}
