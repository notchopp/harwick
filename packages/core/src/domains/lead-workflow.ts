import { z } from "zod";
import {
  FinancingStatusSchema,
  LeadIntentSchema,
  LeadSourceChannelSchema,
  LeadStatusSchema,
  LeadTypeSchema,
  type FinancingStatus,
  type LeadIntent,
  type LeadStatus,
} from "./lead.js";

export const LeadWorkflowInputSchema = z.object({
  leadId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sourceChannel: LeadSourceChannelSchema,
  leadType: LeadTypeSchema,
  intent: LeadIntentSchema,
  timeline: z.string().trim().max(120).nullable(),
  budgetMin: z.number().int().nonnegative().nullable(),
  budgetMax: z.number().int().nonnegative().nullable(),
  targetArea: z.string().trim().max(180).nullable(),
  financingStatus: FinancingStatusSchema,
  currentScore: z.number().int().min(0).max(100),
  currentStatus: LeadStatusSchema,
  assignedAgentId: z.string().uuid().nullable(),
  engagementCount: z.number().int().nonnegative(),
  latestText: z.string().trim().max(8000).nullable(),
});

export const LeadWorkflowDecisionSchema = z.object({
  score: z.number().int().min(0).max(100),
  intent: LeadIntentSchema,
  status: LeadStatusSchema,
  shouldAssign: z.boolean(),
  shouldCreateHandoffTask: z.boolean(),
  shouldSyncToFub: z.boolean(),
  shouldEnrollNurture: z.boolean(),
  reasons: z.array(z.string().trim().min(1)).min(1),
});

export type LeadWorkflowInput = z.infer<typeof LeadWorkflowInputSchema>;
export type LeadWorkflowDecision = z.infer<typeof LeadWorkflowDecisionSchema>;

function includesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function scoreTimeline(timeline: string | null, reasons: string[]): number {
  if (timeline === null) {
    return 0;
  }

  const normalized = timeline.toLowerCase();
  if (includesAny(normalized, [/today/, /tomorrow/, /this week/, /weekend/, /asap/, /immediately/, /now/])) {
    reasons.push("urgent timeline");
    return 22;
  }
  if (includesAny(normalized, [/month/, /30 days/, /soon/])) {
    reasons.push("near-term timeline");
    return 14;
  }
  if (includesAny(normalized, [/year/, /someday/, /not sure/])) {
    reasons.push("long-range timeline");
    return 4;
  }

  reasons.push("timeline provided");
  return 8;
}

function scoreFinancing(financingStatus: FinancingStatus, reasons: string[]): number {
  switch (financingStatus) {
    case "cash":
      reasons.push("cash buyer");
      return 18;
    case "preapproved":
      reasons.push("preapproved buyer");
      return 16;
    case "needs_lender":
      reasons.push("needs lender intro");
      return 8;
    case "unknown":
      return 0;
  }
}

function scoreBudget(params: {
  budgetMin: number | null;
  budgetMax: number | null;
}, reasons: string[]): number {
  if (params.budgetMin === null && params.budgetMax === null) {
    return 0;
  }

  if (params.budgetMin !== null && params.budgetMax !== null && params.budgetMin !== params.budgetMax) {
    reasons.push("budget range captured");
    return 14;
  }

  if (params.budgetMin !== null && params.budgetMax !== null) {
    reasons.push("budget target captured");
    return 12;
  }

  reasons.push(params.budgetMin === null ? "budget ceiling captured" : "budget floor captured");
  return 8;
}

function scoreEngagement(engagementCount: number, reasons: string[]): number {
  if (engagementCount >= 4) {
    reasons.push("high repeat engagement");
    return 12;
  }

  if (engagementCount >= 2) {
    reasons.push("repeat engagement");
    return 8;
  }

  return 0;
}

function inferIntent(score: number, latestText: string | null, existingIntent: LeadIntent): LeadIntent {
  const normalized = latestText?.toLowerCase() ?? "";
  if (includesAny(normalized, [/stop\b/, /unsubscribe/, /wrong number/, /not interested/, /\bspam\b/])) {
    return "spam";
  }
  if (score >= 70) {
    return "high";
  }
  if (score >= 45) {
    return "medium";
  }
  if (score >= 18) {
    return "low";
  }
  return existingIntent === "unknown" ? "unknown" : existingIntent;
}

function statusFromDecision(params: {
  intent: LeadIntent;
  score: number;
  assignedAgentId: string | null;
}): LeadStatus {
  if (params.intent === "spam") {
    return "archived";
  }
  if (params.assignedAgentId !== null) {
    return "assigned";
  }
  if (params.score >= 70 || params.intent === "high") {
    return "hot";
  }
  if (params.score >= 45 || params.intent === "medium") {
    return "qualified";
  }
  if (params.score >= 18 || params.intent === "low") {
    return "engaged";
  }
  return "new";
}

export function decideLeadWorkflow(input: LeadWorkflowInput): LeadWorkflowDecision {
  const lead = LeadWorkflowInputSchema.parse(input);
  const reasons: string[] = [];
  let score = 0;

  if (lead.sourceChannel === "call") {
    score += 16;
    reasons.push("inbound call");
  } else if (lead.sourceChannel === "instagram_dm" || lead.sourceChannel === "facebook_dm") {
    score += 12;
    reasons.push(lead.sourceChannel === "instagram_dm" ? "instagram dm" : "facebook dm");
  } else if (lead.sourceChannel === "instagram_comment" || lead.sourceChannel === "facebook_comment") {
    score += 8;
    reasons.push(lead.sourceChannel === "instagram_comment" ? "instagram comment" : "facebook comment");
  }

  if (lead.leadType !== "unknown") {
    score += 12;
    reasons.push(`${lead.leadType} intent identified`);
  }
  if (lead.targetArea !== null) {
    score += 8;
    reasons.push("target area captured");
  }
  score += scoreBudget({
    budgetMin: lead.budgetMin,
    budgetMax: lead.budgetMax,
  }, reasons);

  score += scoreTimeline(lead.timeline, reasons);
  score += scoreFinancing(lead.financingStatus, reasons);
  score += scoreEngagement(lead.engagementCount, reasons);

  const latestText = lead.latestText?.toLowerCase() ?? "";
  if (includesAny(latestText, [/showing/, /tour/, /see (it|the home)/, /open house/])) {
    score += 22;
    reasons.push("showing requested");
  }
  if (includesAny(latestText, [/what'?s my home worth/, /valuation/, /sell my house/, /list my/])) {
    score += 22;
    reasons.push("seller valuation requested");
  }
  if (includesAny(latestText, [/agent/, /realtor/, /call me/, /speak to/, /talk to/])) {
    score += 14;
    reasons.push("human follow-up requested");
  }

  score = Math.max(score, lead.currentScore);
  score = Math.min(score, 100);

  const intent = inferIntent(score, lead.latestText, lead.intent);
  const status = statusFromDecision({
    intent,
    score,
    assignedAgentId: lead.assignedAgentId,
  });
  const shouldCreateHandoffTask = status === "qualified" || status === "hot" || status === "assigned";
  const shouldAssign = lead.assignedAgentId === null && (status === "qualified" || status === "hot");
  const shouldSyncToFub = status === "qualified" || status === "hot" || status === "assigned";
  const shouldEnrollNurture = status === "engaged" && intent !== "spam";

  return LeadWorkflowDecisionSchema.parse({
    score,
    intent,
    status,
    shouldAssign,
    shouldCreateHandoffTask,
    shouldSyncToFub,
    shouldEnrollNurture,
    reasons: reasons.length > 0 ? reasons : ["insufficient qualification data"],
  });
}
