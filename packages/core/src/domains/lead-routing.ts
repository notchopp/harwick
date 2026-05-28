import { z } from "zod";
import { ShowingModeSchema } from "./calendar.js";
import { UuidSchema } from "./common.js";
import { LeadTypeSchema } from "./lead.js";

export const RoutingPropertyTypeSchema = z.enum([
  "single_family",
  "condo",
  "townhome",
  "new_construction",
  "luxury",
  "investment",
  "lease",
  "land",
]);

export const RoutingDecisionStatusSchema = z.enum([
  "assigned",
  "unrouted",
  "hold_for_qualification",
]);

export const RoutingCalendarStatusSchema = z.enum(["connected", "missing", "unknown"]);

export const LeadRoutingQualificationSchema = z.object({
  leadId: UuidSchema,
  workspaceId: UuidSchema,
  leadType: LeadTypeSchema,
  targetArea: z.string().trim().min(1).max(180).nullable(),
  propertyType: RoutingPropertyTypeSchema.nullable(),
  budgetMin: z.number().int().nonnegative().nullable(),
  budgetMax: z.number().int().nonnegative().nullable(),
  timeline: z.string().trim().min(1).max(120).nullable(),
  financingStatus: z.enum(["preapproved", "cash", "needs_lender", "unknown"]),
  score: z.number().int().min(0).max(100),
  sourceOwnerMemberId: UuidSchema.nullable(),
});

export const AgentRoutingProfileSchema = z.object({
  memberId: UuidSchema,
  displayName: z.string().trim().min(1).max(120),
  roleLabel: z.string().trim().min(1).max(80),
  areas: z.array(z.string().trim().min(1).max(120)).min(1),
  propertyTypes: z.array(RoutingPropertyTypeSchema).min(1),
  leadTypes: z.array(LeadTypeSchema.exclude(["unknown"])).min(1),
  budgetMin: z.number().int().nonnegative().nullable(),
  budgetMax: z.number().int().nonnegative().nullable(),
  activeLeadCount: z.number().int().nonnegative(),
  maxActiveLeads: z.number().int().positive(),
  acceptsNewLeads: z.boolean().default(true),
  notificationPreference: z.enum(["sms", "email", "app"]).default("app"),
  calendarStatus: RoutingCalendarStatusSchema.default("unknown"),
  showingMode: ShowingModeSchema.nullable().default(null),
});

export const LeadRoutingInputSchema = z.object({
  qualification: LeadRoutingQualificationSchema,
  agents: z.array(AgentRoutingProfileSchema),
  escalationMemberId: UuidSchema.nullable(),
  roundRobinCursorMemberId: UuidSchema.nullable().default(null),
});

/**
 * Candidate = a scored agent suggestion the operator can one-tap into.
 * Even when status=unrouted, candidates contains the best-fit partial
 * matches so the desk can render assignable rows instead of dead text.
 */
export const LeadRoutingCandidateSchema = z.object({
  memberId: UuidSchema,
  displayName: z.string().trim().min(1).max(120),
  matchScore: z.number().int().min(0).max(100),
  reasons: z.array(z.string().trim().min(1)).default([]),
});

export const LeadRoutingDecisionSchema = z.object({
  status: RoutingDecisionStatusSchema,
  assignedMemberId: UuidSchema.nullable(),
  assignedDisplayName: z.string().trim().min(1).max(120).nullable(),
  sourceOwnerMemberId: UuidSchema.nullable(),
  escalationMemberId: UuidSchema.nullable(),
  matchScore: z.number().int().min(0).max(100),
  taskLabel: z.string().trim().min(1).max(160),
  reasons: z.array(z.string().trim().min(1)).min(1),
  // Top-3 sorted candidates (best fit first). Populated for both assigned and
  // unrouted decisions so the UI can offer one-tap fallbacks even when nobody
  // crossed the auto-assign threshold.
  candidates: z.array(LeadRoutingCandidateSchema).max(5).default([]),
});

export type RoutingPropertyType = z.infer<typeof RoutingPropertyTypeSchema>;
export type RoutingCalendarStatus = z.infer<typeof RoutingCalendarStatusSchema>;
export type LeadRoutingQualification = z.infer<typeof LeadRoutingQualificationSchema>;
export type AgentRoutingProfile = z.infer<typeof AgentRoutingProfileSchema>;
export type LeadRoutingInput = z.infer<typeof LeadRoutingInputSchema>;
export type LeadRoutingDecision = z.infer<typeof LeadRoutingDecisionSchema>;
export type LeadRoutingCandidate = z.infer<typeof LeadRoutingCandidateSchema>;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function hasAreaMatch(leadArea: string, agentAreas: readonly string[]): boolean {
  const normalizedLeadArea = normalize(leadArea);

  return agentAreas.some((area) => {
    const normalizedArea = normalize(area);
    return normalizedLeadArea === normalizedArea
      || normalizedLeadArea.includes(normalizedArea)
      || normalizedArea.includes(normalizedLeadArea);
  });
}

function hasBudgetMatch(params: {
  leadBudgetMin: number | null;
  leadBudgetMax: number | null;
  agentBudgetMin: number | null;
  agentBudgetMax: number | null;
}): boolean {
  const leadMin = params.leadBudgetMin ?? params.leadBudgetMax;
  const leadMax = params.leadBudgetMax ?? params.leadBudgetMin;

  if (leadMin === null || leadMax === null) {
    return true;
  }

  if (params.agentBudgetMin !== null && leadMax < params.agentBudgetMin) {
    return false;
  }

  if (params.agentBudgetMax !== null && leadMin > params.agentBudgetMax) {
    return false;
  }

  return true;
}

function hasEnoughQualification(qualification: LeadRoutingQualification): boolean {
  // Public-chat leads often have a clear lead_type + intent + score but
  // no explicit targetArea (they came in on a SPECIFIC listing, so the
  // listing's geography IS the implicit area). Don't strand them in
  // "hold_for_qualification" just because targetArea is null — let the
  // caller backfill targetArea from the listing's city/neighborhood.
  return qualification.leadType !== "unknown"
    && qualification.score >= 45;
}

function capacityScore(agent: AgentRoutingProfile): number {
  const remaining = Math.max(agent.maxActiveLeads - agent.activeLeadCount, 0);
  return Math.round((remaining / agent.maxActiveLeads) * 20);
}

function calendarReadinessScore(agent: AgentRoutingProfile): number {
  if (agent.calendarStatus !== "connected") {
    return 0;
  }

  if (agent.showingMode === "auto_book") {
    return 6;
  }

  if (agent.showingMode === "request_approve") {
    return 5;
  }

  return 2;
}

function calendarReadinessReason(agent: AgentRoutingProfile): string | null {
  if (agent.calendarStatus !== "connected") {
    return null;
  }

  switch (agent.showingMode) {
    case "auto_book":
      return "calendar connected for qualified auto-booking";
    case "request_approve":
      return "calendar connected for request + approve showings";
    case "collect_only":
      return "calendar connected for collect-only showing follow-up";
    case null:
      return "calendar connected";
  }
}

function rotateMatchedAgents(
  agents: AgentRoutingProfile[],
  cursorMemberId: string | null,
): AgentRoutingProfile[] {
  if (cursorMemberId === null) {
    return agents;
  }

  const index = agents.findIndex((agent) => agent.memberId === cursorMemberId);
  if (index === -1 || index === agents.length - 1) {
    return agents;
  }

  return [...agents.slice(index + 1), ...agents.slice(0, index + 1)];
}

export function decideLeadRouting(input: LeadRoutingInput): LeadRoutingDecision {
  const parsed = LeadRoutingInputSchema.parse(input);
  const { qualification } = parsed;

  if (!hasEnoughQualification(qualification)) {
    return LeadRoutingDecisionSchema.parse({
      status: "hold_for_qualification",
      assignedMemberId: null,
      assignedDisplayName: null,
      sourceOwnerMemberId: qualification.sourceOwnerMemberId,
      escalationMemberId: null,
      matchScore: 0,
      taskLabel: "keep qualifying before assignment",
      reasons: ["intent, area, and qualification score are required before routing"],
    });
  }

  const scoredAgents = parsed.agents
    .filter((agent) => agent.acceptsNewLeads)
    .filter((agent) => agent.activeLeadCount < agent.maxActiveLeads)
    .map((agent) => {
      let matchScore = 0;
      const reasons: string[] = [];

      if (qualification.targetArea !== null && hasAreaMatch(qualification.targetArea, agent.areas)) {
        matchScore += 36;
        reasons.push(`area match: ${qualification.targetArea}`);
      }

      if (qualification.leadType !== "unknown" && agent.leadTypes.includes(qualification.leadType)) {
        matchScore += 20;
        reasons.push(`${qualification.leadType} lead accepted`);
      }

      if (qualification.propertyType !== null && agent.propertyTypes.includes(qualification.propertyType)) {
        matchScore += 18;
        reasons.push(`${qualification.propertyType.replace(/_/g, " ")} specialist`);
      }

      if (hasBudgetMatch({
        leadBudgetMin: qualification.budgetMin,
        leadBudgetMax: qualification.budgetMax,
        agentBudgetMin: agent.budgetMin,
        agentBudgetMax: agent.budgetMax,
      })) {
        matchScore += 12;
        reasons.push("budget fits profile");
      }

      const agentCapacityScore = capacityScore(agent);
      matchScore += agentCapacityScore;
      if (agentCapacityScore > 0) {
        reasons.push(`${agent.maxActiveLeads - agent.activeLeadCount} lead capacity open`);
      }

      const agentCalendarReadinessScore = calendarReadinessScore(agent);
      matchScore += agentCalendarReadinessScore;
      const calendarReason = calendarReadinessReason(agent);
      if (calendarReason !== null) {
        reasons.push(calendarReason);
      }

      return {
        agent,
        matchScore: Math.min(matchScore, 100),
        reasons,
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.agent.activeLeadCount - b.agent.activeLeadCount);

  // Build candidates list from the top-3 scored agents regardless of threshold.
  // This is what powers the routing-desk "Assign to X" one-tap fallback rows
  // when nobody crossed the auto-assign threshold but partial matches exist.
  const topCandidates = scoredAgents.slice(0, 3).map((entry) => ({
    memberId: entry.agent.memberId,
    displayName: entry.agent.displayName,
    matchScore: entry.matchScore,
    reasons: entry.reasons,
  }));

  // Auto-assign threshold lowered from 56 to 40 so leads with a missing field
  // (e.g. no target_area) but a clear buyer/budget signal still route to a
  // matching agent automatically. The desk also shows top candidates either
  // way, so the operator can override.
  const autoEligible = scoredAgents.filter((entry) => entry.matchScore >= 40);

  if (autoEligible.length === 0) {
    return LeadRoutingDecisionSchema.parse({
      status: "unrouted",
      assignedMemberId: null,
      assignedDisplayName: null,
      sourceOwnerMemberId: qualification.sourceOwnerMemberId,
      escalationMemberId: parsed.escalationMemberId,
      matchScore: scoredAgents[0]?.matchScore ?? 0,
      taskLabel: topCandidates.length === 0
        ? "no available agents — review workspace setup"
        : "pick the best fit from the suggested agents",
      reasons: topCandidates.length === 0
        ? ["no available agent matched area, lead type, property type, budget, and capacity"]
        : [`partial fit: top candidate is ${topCandidates[0]!.displayName} at ${topCandidates[0]!.matchScore}/100`],
      candidates: topCandidates,
    });
  }

  const firstMatch = autoEligible[0];
  if (firstMatch === undefined) {
    return LeadRoutingDecisionSchema.parse({
      status: "unrouted",
      assignedMemberId: null,
      assignedDisplayName: null,
      sourceOwnerMemberId: qualification.sourceOwnerMemberId,
      escalationMemberId: parsed.escalationMemberId,
      matchScore: 0,
      taskLabel: "owner review needed",
      reasons: ["no available agent matched area, lead type, property type, budget, and capacity"],
      candidates: topCandidates,
    });
  }

  const topScore = firstMatch.matchScore;
  const topMatches = autoEligible
    .filter((entry) => entry.matchScore === topScore)
    .map((entry) => entry.agent);
  const rotatedTopMatches = rotateMatchedAgents(topMatches, parsed.roundRobinCursorMemberId);
  const assignedAgent = rotatedTopMatches[0] ?? firstMatch.agent;
  const winningEntry = scoredAgents.find((entry) => entry.agent.memberId === assignedAgent.memberId) ?? firstMatch;

  return LeadRoutingDecisionSchema.parse({
    status: "assigned",
    assignedMemberId: assignedAgent.memberId,
    assignedDisplayName: assignedAgent.displayName,
    sourceOwnerMemberId: qualification.sourceOwnerMemberId,
    escalationMemberId: null,
    matchScore: winningEntry.matchScore,
    taskLabel: `new qualified lead for ${assignedAgent.displayName}`,
    reasons: winningEntry.reasons,
    candidates: topCandidates,
  });
}
