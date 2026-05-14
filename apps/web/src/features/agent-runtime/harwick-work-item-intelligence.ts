import {
  HarwickWorkItemActionPlanSchema,
  HarwickWorkItemCreateSchema,
  HarwickWorkItemIntelligenceSchema,
  HarwickWorkItemNotificationDecisionSchema,
  WorkspaceRoleSchema,
  type HarwickWorkItemActionPlan,
  type HarwickWorkItemCreate,
  type HarwickWorkItemIntelligence,
} from "@realty-ops/core";
import type { SmallModelClient } from "@realty-ops/integrations";
import { z } from "zod";

export type HarwickWorkItemIntelligenceSource =
  | "proactive_insight"
  | "loop"
  | "subagent_result"
  | "policy_shadow";

export type HarwickWorkItemIntelligenceContext = {
  signalKey: string;
  source: HarwickWorkItemIntelligenceSource;
  item: HarwickWorkItemCreate;
};

const WorkItemIntelligenceRefinementSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(1000),
  recommendedAction: z.string().trim().min(1).max(160),
  reason: z.string().trim().min(1).max(1000),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  targetRole: WorkspaceRoleSchema.nullable().optional(),
  notification: HarwickWorkItemNotificationDecisionSchema,
  audienceReason: z.string().trim().min(1).max(500),
});

type WorkItemIntelligenceRefinement = z.infer<typeof WorkItemIntelligenceRefinementSchema>;

export type HarwickWorkItemIntelligenceClient = {
  refineWorkItem(context: HarwickWorkItemIntelligenceContext & {
    deterministicIntelligence: HarwickWorkItemIntelligence;
  }): Promise<WorkItemIntelligenceRefinement>;
};

function readString(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readSignalType(item: HarwickWorkItemCreate): string | null {
  const signalType = item.payload["signalType"];
  return typeof signalType === "string" && signalType.trim().length > 0 ? signalType : null;
}

function audienceReasonForItem(item: HarwickWorkItemCreate): string {
  if (item.targetMemberId !== null) {
    return "This is tied to a specific workspace member, so Harwick should send it directly to that owner first.";
  }

  switch (item.targetRole) {
    case "team_lead":
      return "This needs team-level judgment around assignment, approvals, or queue ownership.";
    case "lead_manager":
      return "This belongs with lead triage and queue management before it reaches an individual agent.";
    case "operator":
      return "This needs operator review because it affects frontline inbox triage or message handling.";
    case "agent":
      return "This belongs with the agent because it concerns direct follow-through on a lead they own.";
    case "owner":
    case "admin":
      return "This requires workspace-level oversight rather than individual follow-through.";
    case "viewer":
      return "This is informational only and should stay visible without assigning action ownership.";
    case null:
      return "Harwick should keep this visible in the shared feed until a clearer owner is known.";
  }
}

function buildNotification(item: HarwickWorkItemCreate): HarwickWorkItemIntelligence["notification"] {
  const signalType = readSignalType(item);
  const score = readNumber(item.payload, "score");
  const leadStatus = readString(item.payload, "leadStatus");
  const outputMode = readString(item.payload, "outputMode");

  if (item.priority === "urgent" || signalType === "harwick_ai_policy_shadow_metrics") {
    return {
      level: "interrupt",
      mode: "interrupt_now",
      reason: "This is urgent enough that Harwick should interrupt the owner instead of waiting for passive review.",
    };
  }

  if (
    item.priority === "high"
    || leadStatus === "hot"
    || (score !== null && score >= 75)
    || outputMode === "agent_loop"
  ) {
    return {
      level: "prompt",
      mode: "feed_and_nudge",
      reason: "This is time-sensitive enough that Harwick should both surface it in the feed and actively nudge the owner.",
    };
  }

  if (item.targetMemberId !== null || signalType === "lead_classification_needs_review") {
    return {
      level: "prompt",
      mode: "feed_and_nudge",
      reason: "This has a clear owner and should not wait for a passive feed-only review.",
    };
  }

  if (signalType === "workspace_memory_pattern" || signalType === "workspace_memory_review_quality") {
    return {
      level: "digest",
      mode: "feed_only",
      reason: "This is important context for the workspace, but it usually belongs in the review feed rather than an interruptive ping.",
    };
  }

  return {
    level: "digest",
    mode: "feed_only",
    reason: "This should be visible in Harwick's feed without creating an interrupt unless a human escalates it.",
  };
}

function parseExistingLoopActionPlan(item: HarwickWorkItemCreate): HarwickWorkItemActionPlan | null {
  const payload = item.payload;
  const executionBrief = readString(payload, "agentLoopBrief");
  const proposedToolCallsRaw = Array.isArray(payload["proposedToolCalls"])
    ? payload["proposedToolCalls"]
    : [];
  if (executionBrief === null && proposedToolCallsRaw.length === 0) {
    return null;
  }

  const parsedCalls = proposedToolCallsRaw.flatMap((candidate) => {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      return [];
    }

    const tool = readString(candidate as Record<string, unknown>, "tool");
    if (tool === null) return [];

    const reason = readString(candidate as Record<string, unknown>, "reason") ?? "proposed Harwick tool step";
    const requiresApproval = (candidate as Record<string, unknown>)["requiresApproval"] === false ? false : true;
    const rawPayload = (candidate as Record<string, unknown>)["payload"];
    const payloadRecord = rawPayload !== null && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? rawPayload as Record<string, unknown>
      : {};

    return [{
      tool,
      reason,
      requiresApproval,
      payload: payloadRecord,
    }];
  });

  return HarwickWorkItemActionPlanSchema.parse({
    executionBrief: executionBrief ?? "Review the proposed Harwick execution steps before anything leaves the system.",
    requiresApproval: true,
    internalSafeOnly: false,
    proposedToolCalls: parsedCalls,
  });
}

function buildActionPlan(item: HarwickWorkItemCreate): HarwickWorkItemActionPlan | null {
  const signalType = readSignalType(item);
  const payload = item.payload;

  if (signalType === "harwick_loop_due") {
    return parseExistingLoopActionPlan(item);
  }

  if (signalType === "unassigned_priority_lead") {
    const targetArea = readString(payload, "targetArea");
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Review the best owner, gather routing context if needed, and keep the final assignment behind approval.",
      requiresApproval: true,
      internalSafeOnly: false,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Gather a routing recommendation before the team lead commits assignment.",
          requiresApproval: true,
          payload: {
            subagentType: "routing",
            title: "Review lead routing fit",
            instructions: targetArea === null
              ? "Review the highest-fit agent for this unassigned priority lead."
              : `Review the highest-fit agent for this unassigned priority lead in ${targetArea}.`,
            priority: item.priority,
          },
        },
        {
          tool: "route_lead",
          reason: "Assign the lead after a human confirms the recommendation.",
          requiresApproval: true,
          payload: {
            reason: item.reason,
            priority: item.priority,
          },
        },
      ],
    });
  }

  if (signalType === "dormant_active_lead") {
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Prepare the next follow-up angle first, then let the human decide whether to send it.",
      requiresApproval: true,
      internalSafeOnly: false,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have the writer specialist prepare the best next follow-up for the quiet lead.",
          requiresApproval: true,
          payload: {
            subagentType: "writer",
            title: "Draft dormant lead follow-up",
            instructions: "Draft the most useful next follow-up based on the dormant-lead context.",
            priority: item.priority,
          },
        },
      ],
    });
  }

  if (signalType === "social_lifecycle_trigger") {
    const trigger = readString(payload, "trigger");
    const sourceChannel = readString(payload, "sourceChannel");
    const instructions = trigger === "post_handoff"
      ? "Review the public-to-private transition, keep continuity with the original comment thread, and plan the next DM step."
      : trigger === "post_idle"
        ? "Review why the social thread went quiet and draft the most useful next follow-up."
        : trigger === "post_milestone"
          ? "Review the milestone, recommend the next owner or route, and outline the next conversation step."
          : "Review the latest social message and propose the next best qualification move.";
    const executionBrief = trigger === "post_handoff"
      ? "Keep the comment-to-DM handoff coherent, then prepare the next private follow-through behind approval."
      : trigger === "post_idle"
        ? "Have Harwick prepare the re-engagement angle first, then let the human decide whether to send it."
        : trigger === "post_milestone"
          ? "Treat this as a live social milestone that may need routing, owner review, or a sharper follow-through plan."
          : "Use Harwick to plan the next social step while the conversation context is still fresh.";

    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief,
      requiresApproval: true,
      internalSafeOnly: false,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have Harwick prepare the next lifecycle step before any human-facing send or routing change happens.",
          requiresApproval: true,
          payload: {
            subagentType: trigger === "post_milestone" ? "routing" : "writer",
            title: "Plan the next social lifecycle step",
            instructions: sourceChannel === null ? instructions : `${instructions} Source: ${sourceChannel}.`,
            priority: item.priority,
          },
        },
        ...(trigger === "post_milestone"
          ? [{
              tool: "route_lead",
              reason: "Keep any routing change behind approval once Harwick has prepared the milestone recommendation.",
              requiresApproval: true,
              payload: {
                reason: item.reason,
                priority: item.priority,
              },
            }]
          : []),
      ],
    });
  }

  if (signalType === "cross_channel_identity_signal") {
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Research the lead's cross-channel history first so Harwick can preserve one opportunity narrative before any downstream changes.",
      requiresApproval: true,
      internalSafeOnly: true,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have the research specialist consolidate the recent channel history into one operator-ready brief.",
          requiresApproval: true,
          payload: {
            subagentType: "research",
            title: "Review cross-channel lead identity",
            instructions: "Summarize how this lead moved across channels, what likely belongs to the same opportunity, and what the team should do next.",
            priority: item.priority,
          },
        },
      ],
    });
  }

  if (signalType === "voice_post_call_cognition") {
    const urgency = readString(payload, "urgency");
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Turn the finished call into a post-call brief, then keep any routing or outbound action behind approval.",
      requiresApproval: true,
      internalSafeOnly: false,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have the writer specialist turn the voice handoff into an owner-ready post-call brief and next-step plan.",
          requiresApproval: true,
          payload: {
            subagentType: "writer",
            title: "Draft post-call owner brief",
            instructions: "Summarize the completed call, extract the next operational actions, and draft the owner brief without claiming any action already ran.",
            priority: item.priority,
          },
        },
        ...(urgency === "urgent" || urgency === "high"
          ? [{
              tool: "route_lead",
              reason: "If the call is urgent, keep any immediate routing move behind approval once the brief is ready.",
              requiresApproval: true,
              payload: {
                reason: item.reason,
                priority: item.priority,
              },
            }]
          : []),
      ],
    });
  }

  if (signalType === "stalled_showing_approval") {
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Review the stalled showing request, line up the next availability check, and keep any outbound or booking move behind approval.",
      requiresApproval: true,
      internalSafeOnly: false,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have the calendar specialist prepare the cleanest next move before a human follows through.",
          requiresApproval: true,
          payload: {
            subagentType: "calendar",
            title: "Review stalled showing approval",
            instructions: "Review the pending showing approval, summarize what is blocked, and suggest the best next owner follow-up.",
            priority: item.priority,
          },
        },
      ],
    });
  }

  if (signalType === "lead_closed_follow_up") {
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Turn the newly closed lead into a post-close follow-up plan, then keep any outbound thank-you or reminder send behind approval.",
      requiresApproval: true,
      internalSafeOnly: false,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have the writer specialist draft the thank-you and future check-in plan before anything is sent.",
          requiresApproval: true,
          payload: {
            subagentType: "writer",
            title: "Draft post-close follow-up",
            instructions: "Prepare the thank-you message and next check-in plan for this newly closed lead without claiming any message already went out.",
            priority: item.priority,
          },
        },
      ],
    });
  }

  if (signalType === "workspace_memory_pattern") {
    return HarwickWorkItemActionPlanSchema.parse({
      executionBrief: "Let Harwick research the pattern more deeply before a team lead changes routing or policy.",
      requiresApproval: true,
      internalSafeOnly: true,
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Have the research specialist pull the strongest evidence behind this workspace pattern.",
          requiresApproval: true,
          payload: {
            subagentType: "research",
            title: "Review workspace pattern evidence",
            instructions: "Summarize the strongest evidence and operator implications for this workspace pattern.",
            priority: item.priority,
          },
        },
      ],
    });
  }

  if (signalType === "harwick_subagent_result") {
    const subagentType = readString(payload, "subagentType");

    if (subagentType === "routing") {
      return HarwickWorkItemActionPlanSchema.parse({
        executionBrief: "Review the routing recommendation, then keep final assignment behind human approval.",
        requiresApproval: true,
        internalSafeOnly: false,
        proposedToolCalls: [
          {
            tool: "route_lead",
            reason: "Apply the routing recommendation after review.",
            requiresApproval: true,
            payload: {
              reason: item.reason,
              priority: item.priority,
            },
          },
        ],
      });
    }

    if (subagentType === "calendar") {
      return HarwickWorkItemActionPlanSchema.parse({
        executionBrief: "Review the calendar recommendation, then let a human approve the showing workflow step.",
        requiresApproval: true,
        internalSafeOnly: false,
        proposedToolCalls: [
          {
            tool: "request_showing_approval",
            reason: "Queue the showing workflow step once a human confirms the recommendation.",
            requiresApproval: true,
            payload: {
              priority: item.priority,
            },
          },
        ],
      });
    }
  }

  return null;
}

function buildDeterministicIntelligence(item: HarwickWorkItemCreate): HarwickWorkItemIntelligence {
  return HarwickWorkItemIntelligenceSchema.parse({
    audience: {
      targetRole: item.targetRole,
      targetMemberId: item.targetMemberId,
      reason: audienceReasonForItem(item),
    },
    notification: buildNotification(item),
    actionPlan: buildActionPlan(item),
    source: "deterministic",
  });
}

export function createSmallModelHarwickWorkItemIntelligenceClient(
  client: SmallModelClient,
): HarwickWorkItemIntelligenceClient {
  return {
    async refineWorkItem(params) {
      return client.classify({
        schema: WorkItemIntelligenceRefinementSchema,
        temperature: 0.2,
        maxTokens: 700,
        instructions: [
          "You refine Harwick work items for a real estate workspace chief of staff.",
          "Keep every field grounded only in the provided deterministic item and intelligence metadata. Do not invent names, prices, approvals, sends, or outcomes.",
          "Your job is to improve the surfacing copy, choose the right workspace role when a direct member target is not already present, and decide how interruptive the notification should be.",
          "If an action plan exists, keep the recommended action aligned with that plan and never claim that any proposed tool already ran.",
          "Prefer operator for inbox triage, team_lead for routing or team-level judgment, lead_manager for queue ownership, and agent only when the item already has a direct member owner or clearly belongs with a single agent.",
          "Return JSON only.",
        ].join("\n"),
        input: JSON.stringify({
          signalKey: params.signalKey,
          source: params.source,
          item: params.item,
          deterministicIntelligence: params.deterministicIntelligence,
        }),
      });
    },
  };
}

export async function intelligizeHarwickWorkItem(params: {
  context: HarwickWorkItemIntelligenceContext;
  client?: HarwickWorkItemIntelligenceClient;
}): Promise<HarwickWorkItemCreate> {
  const deterministicIntelligence = buildDeterministicIntelligence(params.context.item);
  const baseItem = HarwickWorkItemCreateSchema.parse(params.context.item);

  if (params.client === undefined) {
    return HarwickWorkItemCreateSchema.parse({
      ...baseItem,
      type: deterministicIntelligence.actionPlan === null ? baseItem.type : "approval",
      payload: {
        ...baseItem.payload,
        intelligence: deterministicIntelligence,
        ...(deterministicIntelligence.actionPlan === null ? {} : { actionPlan: deterministicIntelligence.actionPlan }),
      },
    });
  }

  try {
    const refinement = await params.client.refineWorkItem({
      ...params.context,
      deterministicIntelligence,
    });
    const targetRole = baseItem.targetMemberId !== null
      ? baseItem.targetRole
      : refinement.targetRole ?? baseItem.targetRole;
    const intelligence = HarwickWorkItemIntelligenceSchema.parse({
      audience: {
        targetRole,
        targetMemberId: baseItem.targetMemberId,
        reason: refinement.audienceReason,
      },
      notification: refinement.notification,
      actionPlan: deterministicIntelligence.actionPlan,
      source: "small_model",
    });

    return HarwickWorkItemCreateSchema.parse({
      ...baseItem,
      type: intelligence.actionPlan === null ? baseItem.type : "approval",
      targetRole,
      priority: refinement.priority ?? baseItem.priority,
      title: refinement.title,
      summary: refinement.summary,
      recommendedAction: refinement.recommendedAction,
      reason: refinement.reason,
      payload: {
        ...baseItem.payload,
        intelligence,
        ...(intelligence.actionPlan === null ? {} : { actionPlan: intelligence.actionPlan }),
      },
    });
  } catch (error) {
    console.warn("[harwick-work-item-intelligence] refinement failed", params.context.signalKey, error);
    return HarwickWorkItemCreateSchema.parse({
      ...baseItem,
      type: deterministicIntelligence.actionPlan === null ? baseItem.type : "approval",
      payload: {
        ...baseItem.payload,
        intelligence: deterministicIntelligence,
        ...(deterministicIntelligence.actionPlan === null ? {} : { actionPlan: deterministicIntelligence.actionPlan }),
      },
    });
  }
}
