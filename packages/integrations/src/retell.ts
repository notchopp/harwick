import {
  normalizeFreeformText,
  normalizeUsPhoneNumber,
  ExtractedLeadFieldsSchema,
  type ExtractedLeadFields,
  NormalizedLeadEventSchema,
  type FinancingStatus,
  type LeadIntent,
  type LeadType,
  type NormalizedLeadEvent,
} from "@realty-ops/core";
import { verify as verifyRetellSignature } from "retell-sdk";
import { z } from "zod";

const RetellTranscriptEntrySchema = z.object({
  role: z.string().trim().min(1),
  content: z.string().trim().min(1),
}).passthrough();

const RetellCallAnalysisSchema = z.object({
  call_summary: z.string().optional().nullable(),
  custom_analysis_data: z.record(z.string(), z.unknown()).optional().nullable(),
}).passthrough();

const RetellWebhookCallSchema = z.object({
  call_id: z.string().trim().min(1),
  agent_id: z.string().trim().min(1),
  call_type: z.string().trim().min(1).optional().nullable(),
  call_status: z.string().trim().min(1).optional().nullable(),
  direction: z.enum(["inbound", "outbound"]).optional().nullable(),
  from_number: z.string().trim().min(1).optional().nullable(),
  to_number: z.string().trim().min(1).optional().nullable(),
  start_timestamp: z.number().int().positive().optional().nullable(),
  end_timestamp: z.number().int().positive().optional().nullable(),
  duration_ms: z.number().int().nonnegative().optional().nullable(),
  transcript: z.string().optional().nullable(),
  transcript_object: z.array(RetellTranscriptEntrySchema).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
  retell_llm_dynamic_variables: z.record(z.string(), z.unknown()).optional().nullable(),
  call_analysis: RetellCallAnalysisSchema.optional().nullable(),
}).passthrough();

export const RetellWebhookPayloadSchema = z.object({
  event: z.enum(["call_started", "call_ended", "call_analyzed", "transcript_updated"]),
  call: RetellWebhookCallSchema,
}).passthrough();

export type RetellWebhookPayload = z.infer<typeof RetellWebhookPayloadSchema>;

export type SanitizedRetellPostCallAnalysis = ExtractedLeadFields;

export async function verifyRetellWebhookSignature(params: {
  rawBody: string;
  signature: string | null | undefined;
  apiKey: string;
}): Promise<boolean> {
  if (params.signature === null || params.signature === undefined || params.signature.trim().length === 0) {
    return false;
  }

  return verifyRetellSignature(params.rawBody, params.apiKey, params.signature);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function normalizeBoundedText(value: unknown, maxLength: number): string | null {
  const normalized = normalizeFreeformText(readString(value));
  if (normalized === null) {
    return null;
  }

  return normalized.slice(0, maxLength);
}

function normalizeLeadType(value: unknown): LeadType {
  const normalized = readString(value)?.toLowerCase();

  switch (normalized) {
    case "buyer":
    case "seller":
    case "renter":
    case "investor":
      return normalized;
    default:
      return "unknown";
  }
}

function normalizeIntent(value: unknown): LeadIntent {
  const normalized = readString(value)?.toLowerCase();

  switch (normalized) {
    case "high":
    case "medium":
    case "low":
    case "spam":
      return normalized;
    default:
      return "unknown";
  }
}

function normalizeFinancingStatus(value: unknown): FinancingStatus {
  const normalized = readString(value)?.toLowerCase();

  switch (normalized) {
    case "preapproved":
    case "cash":
    case "needs_lender":
      return normalized;
    default:
      return "unknown";
  }
}

export function sanitizeRetellPostCallAnalysisData(input: unknown): SanitizedRetellPostCallAnalysis {
  const source = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};

  return ExtractedLeadFieldsSchema.parse({
    callSummary: normalizeBoundedText(source["call_summary"], 1000),
    leadSummary: normalizeBoundedText(source["lead_summary"] ?? source["summary"], 1000),
    leadType: normalizeLeadType(source["lead_type"]),
    intent: normalizeIntent(source["intent"]),
    targetArea: normalizeBoundedText(source["target_area"], 180),
    timeline: normalizeBoundedText(source["timeline"], 120),
    budget: normalizeBoundedText(source["budget"], 120),
    financingStatus: normalizeFinancingStatus(source["financing_status"]),
    callOutcome: normalizeBoundedText(source["call_outcome"], 120),
    callerName: normalizeBoundedText(source["caller_name"], 160),
  });
}

function deriveRetellEventText(call: RetellWebhookPayload["call"]): string | null {
  const analysis = call.call_analysis ?? null;
  const customData = analysis?.custom_analysis_data ?? null;
  const sanitizedAnalysis = sanitizeRetellPostCallAnalysisData({
    ...customData,
    call_summary: analysis?.call_summary,
  });

  return normalizeFreeformText(
    sanitizedAnalysis.callSummary
      ?? sanitizedAnalysis.leadSummary
      ?? sanitizedAnalysis.callOutcome,
  );
}

function deriveOccurredAt(call: RetellWebhookPayload["call"]): string {
  return new Date(call.end_timestamp ?? call.start_timestamp ?? Date.now()).toISOString();
}

export function sanitizeRetellWebhookPayloadForStorage(payload: RetellWebhookPayload) {
  const analysis = payload.call.call_analysis ?? null;
  const sanitizedAnalysis = sanitizeRetellPostCallAnalysisData({
    ...(analysis?.custom_analysis_data ?? {}),
    call_summary: analysis?.call_summary,
  });

  return {
    event: payload.event,
    call: {
      call_id: payload.call.call_id,
      agent_id: payload.call.agent_id,
      call_type: payload.call.call_type ?? null,
      call_status: payload.call.call_status ?? null,
      direction: payload.call.direction ?? null,
      from_number: normalizeUsPhoneNumber(payload.call.from_number) ?? null,
      to_number: normalizeUsPhoneNumber(payload.call.to_number) ?? null,
      start_timestamp: payload.call.start_timestamp ?? null,
      end_timestamp: payload.call.end_timestamp ?? null,
      duration_ms: payload.call.duration_ms ?? null,
      call_analysis: sanitizedAnalysis,
    },
  };
}

export function normalizeRetellWebhookPayload(params: {
  workspaceId: string;
  payload: unknown;
}): NormalizedLeadEvent[] {
  const parsed = RetellWebhookPayloadSchema.parse(params.payload);

  if (parsed.event !== "call_ended" && parsed.event !== "call_analyzed") {
    return [];
  }

  const phone = normalizeUsPhoneNumber(parsed.call.from_number);
  const text = deriveRetellEventText(parsed.call);

  const analysis = sanitizeRetellPostCallAnalysisData({
    ...(parsed.call.call_analysis?.custom_analysis_data ?? {}),
    call_summary: parsed.call.call_analysis?.call_summary,
  });

  return [
    NormalizedLeadEventSchema.parse({
      workspaceId: params.workspaceId,
      provider: "retell",
      eventType: "call_completed",
      sourceChannel: "call",
      providerEventId: `${parsed.call.call_id}:${parsed.event}`,
      providerAccountId: parsed.call.agent_id,
      providerUserId: phone ?? parsed.call.from_number ?? null,
      sourcePostId: null,
      sourceCommentId: null,
      instagramUsername: null,
      phone,
      text,
      occurredAt: deriveOccurredAt(parsed.call),
      rawPayload: {
        ...sanitizeRetellWebhookPayloadForStorage(parsed),
        extractedLead: analysis,
      },
    }),
  ];
}
