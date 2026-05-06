import { describe, expect, it } from "vitest";
import {
  HarwickAiAutomationPolicySchema,
  HarwickAiTurnSchema,
  type HarwickAiPersistedTurn,
  type NormalizedLeadEvent,
  type SocialReplyQueueItem,
} from "../../packages/core/src/index";
import type {
  HarwickAiRuntimeClient,
  SmallModelClient,
} from "@realty-ops/integrations";
import { handleMetaWebhookDelivery } from "../../apps/web/src/features/lead-intake/meta-webhook";
import { classifyInboundLead } from "../../apps/web/src/features/lead-intake/lead-classifier";
import { createHarwickAiTurnGeneratorService } from "../../apps/web/src/features/lead-intake/harwick-ai-turn-generator";
import type {
  HarwickAiAutomationPolicyRepository,
  HarwickAiTurnPersistenceRepository,
} from "../../apps/web/src/lib/supabase/harwick-ai-turns";
import {
  actOnSocialReplyReview,
  type SocialReplyQueueRepository,
} from "../../apps/web/src/features/operator-queues/operator-queues";
import {
  handleWorkflowJob,
  parseWorkerJobRows,
  type WorkerJobRow,
  type WorkflowJobServices,
} from "../../apps/worker/src/jobs";
import {
  approveHarwickLoopWorkItem,
  type HarwickLoopApprovalRepository,
} from "../../apps/web/src/features/agent-runtime/approve-harwick-loop-work-item";

const workspaceId = "123e4567-e89b-42d3-a456-426614174000";
const leadId = "123e4567-e89b-42d3-a456-426614174001";
const leadEventId = "123e4567-e89b-42d3-a456-426614174002";
const reviewId = "123e4567-e89b-42d3-a456-426614174003";
const turnId = "123e4567-e89b-42d3-a456-426614174004";
const memberId = "123e4567-e89b-42d3-a456-426614174005";
const assignedAgentId = "123e4567-e89b-42d3-a456-426614174006";
const jobId = "123e4567-e89b-42d3-a456-426614174007";
const loopId = "123e4567-e89b-42d3-a456-426614174008";
const loopWorkItemId = "123e4567-e89b-42d3-a456-426614174009";
const loopSubagentTaskId = "123e4567-e89b-42d3-a456-426614174010";
const aiReply = "Absolutely. What time this weekend works best for you, and what's the best number for the agent?";

function requireFirstEvent(events: NormalizedLeadEvent[]): NormalizedLeadEvent {
  const event = events[0];
  if (event === undefined) {
    throw new Error("expected one normalized launch fixture event");
  }
  return event;
}

function createWorkerRow(): WorkerJobRow {
  return {
    id: jobId,
    workspace_id: workspaceId,
    lead_id: leadId,
    lead_event_id: leadEventId,
    job_type: "lead_qualification",
    status: "processing",
    payload: {
      jobType: "lead_qualification",
      workspaceId,
      leadId,
      reason: "manual_review",
    },
    idempotency_key: `lead_qualification:${leadId}:launch-fixture`,
    attempt_count: 1,
    max_attempts: 5,
    run_after: "2026-05-06T12:00:00.000Z",
    locked_at: "2026-05-06T12:00:01.000Z",
    locked_by: "launch-fixture",
    last_error_code: null,
    last_error_message: null,
    created_at: "2026-05-06T12:00:00.000Z",
    updated_at: "2026-05-06T12:00:01.000Z",
  };
}

function createSocialReview(event: NormalizedLeadEvent, suggestedReply: string): SocialReplyQueueItem {
  if (event.providerAccountId === null) {
    throw new Error("launch fixture event must include provider account id");
  }

  return {
    id: reviewId,
    workspaceId,
    leadId,
    leadEventId,
    providerAccountId: event.providerAccountId,
    recipientUserId: event.providerUserId,
    channel: "instagram_comment",
    sourcePostId: event.sourcePostId,
    sourceCommentId: event.sourceCommentId,
    inboundText: event.text,
    suggestedReply,
    status: "pending",
    automationMode: "ai_on",
    automationReason: null,
    aiDecision: null,
    providerEventId: null,
    createdAt: "2026-05-06T12:00:00.000Z",
    updatedAt: "2026-05-06T12:00:00.000Z",
  };
}

describe("launch full-funnel fixture", () => {
  it("proves inbound event -> AI -> queue/send -> lead route -> FUB sync without real providers", async () => {
    const stages: string[] = [];
    const normalizedEvents: NormalizedLeadEvent[] = [];

    stages.push("meta_inbound");
    const delivery = await handleMetaWebhookDelivery({
      payload: {
        object: "instagram",
        entry: [
          {
            id: "ig-business-1",
            changes: [
              {
                field: "comments",
                value: {
                  comment_id: "comment-launch-1",
                  media_id: "listing-post-1",
                  text: "Can I tour this home this weekend? I'm preapproved around 520k in Katy.",
                  from: { id: "ig-user-1", username: "buyer.launch" },
                },
              },
            ],
          },
        ],
      },
      resolveWorkspaceIdByProviderAccountId(providerAccountId) {
        return Promise.resolve(providerAccountId === "ig-business-1" ? workspaceId : null);
      },
      writeLeadEvents(events) {
        normalizedEvents.push(...events);
        stages.push("lead_event_persisted");
        return Promise.resolve({
          persistedCount: events.length,
          duplicateCount: 0,
          leadUpsertCount: 1,
        });
      },
    });

    expect(delivery.status).toBe(200);
    expect(delivery.body).toMatchObject({
      accepted: true,
      normalizedEventCount: 1,
      persistedEventCount: 1,
      leadUpsertCount: 1,
    });

    const event = requireFirstEvent(normalizedEvents);
    const classifierClient: SmallModelClient = {
      classify(params) {
        return Promise.resolve(params.schema.parse({
          classification: "lead",
          reasonCode: "showing_request",
          reasonText: "The sender requested a tour and supplied financing and location context.",
          confidence: 0.94,
          leadHint: "buyer",
        }));
      },
      prompt() {
        return Promise.resolve("unused in launch fixture");
      },
    };

    const classification = await classifyInboundLead({
      client: classifierClient,
      input: {
        inboundText: event.text ?? "",
        channel: event.sourceChannel,
        senderHandle: event.instagramUsername,
        workspaceContext: "Katy buyer-focused real estate workspace",
      },
    });
    stages.push("lead_classified");

    expect(classification).toMatchObject({
      classification: "lead",
      reasonCode: "showing_request",
      leadHint: "buyer",
    });

    let persistedTurn: HarwickAiPersistedTurn | null = null;
    const runtimeClient: HarwickAiRuntimeClient = {
      runTurn(input) {
        expect(input.inboundText).toContain("tour this home");
        return Promise.resolve(HarwickAiTurnSchema.parse({
          intent: "showing_request",
          nextAction: "ask_qualification",
          missingFields: ["phone", "email"],
          confidence: 0.91,
          safetyFlags: ["safe_to_send"],
          reply: aiReply,
          statePatch: {
            leadType: "buyer",
            intent: "high",
            timeline: "this weekend",
            budget: "around 520k",
            targetArea: "Katy",
            financingStatus: "preapproved",
            knownFacts: ["Requested a tour this weekend", "Preapproved around 520k", "Interested in Katy"],
          },
          handoffBrief: "Katy buyer requested a weekend tour and says they are preapproved around 520k.",
          toolCalls: [
            {
              tool: "send_meta_reply",
              reason: "Ask for missing phone/email before routing the showing request.",
              requiresApproval: false,
              payload: {
                reply: aiReply,
              },
            },
          ],
          documentUpdate: "Buyer requested a weekend tour in Katy and stated they are preapproved around 520k.",
          endTurn: true,
        }));
      },
    };
    const turnRepository: HarwickAiTurnPersistenceRepository = {
      insertTurn(turn) {
        persistedTurn = turn;
        stages.push("harwick_turn_persisted");
        return Promise.resolve({ turnId });
      },
      getTurnById() {
        if (persistedTurn === null) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          turn: persistedTurn.turn,
          automationDecision: persistedTurn.automationDecision,
        });
      },
      updateTurnStatus() {
        return Promise.resolve();
      },
    };
    const policyRepository: HarwickAiAutomationPolicyRepository = {
      resolveEffectivePolicy() {
        return Promise.resolve(HarwickAiAutomationPolicySchema.parse({
          workspaceId,
          leadId,
          scope: "conversation",
          automationMode: "ai_on",
          autoSendEnabled: true,
          confidenceThreshold: 0.8,
        }));
      },
    };
    const turnGenerator = createHarwickAiTurnGeneratorService({
      runtimeClient,
      turnRepository,
      policyRepository,
    });

    const generatedTurn = await turnGenerator.generateAndPersistTurn({
      workspaceId,
      leadId,
      socialReplyReviewId: reviewId,
      providerThreadId: event.providerEventId,
      channel: event.sourceChannel,
      inboundText: event.text ?? "",
      context: {
        workspaceName: "Harwick Launch Realty",
        toneProfile: {
          name: "launch fixture",
          voice: "warm, concise, professional, and human",
          bannedPhrases: [],
          preferredPhrases: [],
          emojiPolicy: "none",
          signature: null,
        },
        listingContext: {
          label: "Katy launch listing",
          area: "Katy",
          price: "$520,000",
          facts: ["Weekend showings by approval"],
        },
        calendarContext: [],
        postContext: {
          caption: "Katy family home open for private showings.",
          ctaLabel: "Request a showing",
          areasMentioned: ["Katy"],
          listingHints: ["Katy launch listing"],
          permalink: null,
          visualDescription: null,
        },
        conversationHistory: [
          {
            id: event.providerEventId,
            actor: "lead",
            body: event.text ?? "",
            occurredAt: event.occurredAt,
          },
        ],
      },
    });

    expect(generatedTurn).toEqual({
      turnId,
      persistenceStatus: "drafted",
      shouldExecute: true,
    });
    if (persistedTurn === null) {
      throw new Error("expected Harwick turn to persist before queue send");
    }

    let review = createSocialReview(event, aiReply);
    const queueRepository: SocialReplyQueueRepository = {
      materializePendingSocialReplies() {
        return Promise.resolve(1);
      },
      listSocialReplyReviews() {
        return Promise.resolve([review]);
      },
      listLeadActionabilityInputs() {
        return Promise.resolve([]);
      },
      findSocialReplyReview() {
        return Promise.resolve(review);
      },
      updateSocialReplyReview(params) {
        const values = params.values;
        review = {
          ...review,
          status: values.status,
          automationMode: values.automationMode ?? review.automationMode,
          automationReason: "automationReason" in values ? values.automationReason ?? null : review.automationReason,
          aiDecision: values.aiDecision ?? review.aiDecision,
          suggestedReply: "suggestedReply" in values ? values.suggestedReply ?? null : review.suggestedReply,
          providerEventId: "providerEventId" in values ? values.providerEventId ?? null : review.providerEventId,
          updatedAt: values.reviewedAt ?? review.updatedAt,
        };
        return Promise.resolve(review);
      },
      setConversationAutomationForReview() {
        return Promise.resolve(review);
      },
      listSocialConversationThread() {
        return Promise.resolve([]);
      },
    };

    const sentReview = await actOnSocialReplyReview({
      workspaceId,
      reviewId,
      memberId,
      repository: queueRepository,
      request: {
        action: "send",
        reply: aiReply,
      },
      sendReply(request) {
        expect(request).toMatchObject({
          workspaceId,
          leadId,
          providerAccountId: "ig-business-1",
          channel: "instagram_comment",
          recipientUserId: "ig-user-1",
          sourceCommentId: "comment-launch-1",
          sourcePostId: "listing-post-1",
        });
        stages.push("operator_queue_send");
        return Promise.resolve({
          status: 200,
          body: { providerEventId: "meta-reply-launch-1" },
        });
      },
      now: () => new Date("2026-05-06T12:01:00.000Z"),
    });

    expect(sentReview?.status).toBe("sent");
    expect(sentReview?.providerEventId).toBe("meta-reply-launch-1");

    const [qualificationJob] = parseWorkerJobRows([createWorkerRow()]);
    if (qualificationJob === undefined) {
      throw new Error("expected launch fixture worker job to parse");
    }
    const services: WorkflowJobServices = {
      getLeadWorkflowContext() {
        return Promise.resolve({
          leadId,
          workspaceId,
          sourceChannel: event.sourceChannel,
          leadType: "buyer",
          intent: "high",
          timeline: "this weekend",
          budgetMin: 450000,
          budgetMax: 520000,
          targetArea: "Katy",
          financingStatus: "preapproved",
          currentScore: 0,
          currentStatus: "new",
          assignedAgentId: null,
          engagementCount: 2,
          latestText: event.text,
        });
      },
      updateLeadWorkflowDecision() {
        return Promise.resolve();
      },
      assignLead(params) {
        expect(params).toEqual({ workspaceId, leadId });
        stages.push("lead_routed");
        return Promise.resolve(assignedAgentId);
      },
      createHandoffTask(params) {
        expect(params).toMatchObject({
          workspaceId,
          leadId,
          priority: "urgent",
          assignedMemberId: assignedAgentId,
        });
        return Promise.resolve();
      },
      enqueueFubSync(params) {
        expect(params).toEqual({ workspaceId, leadId });
        stages.push("fub_sync_queued");
        return Promise.resolve();
      },
      enrollNurture() {
        return Promise.resolve();
      },
    };

    await expect(handleWorkflowJob(qualificationJob, services)).resolves.toMatchObject({
      status: "completed",
    });

    const loopApprovalPayload = {
      signalType: "harwick_loop_due",
      signalKey: `harwick_loop_due:${loopId}:2026-05-06T12:00:00.000Z`,
      loopId,
      loopName: "Friday queue review",
      instruction: "Review the work queue and surface stale follow-ups.",
      outputMode: "agent_loop",
      toolAllowlist: [],
      proposedToolCalls: [
        {
          tool: "dispatch_subagent",
          reason: "Summarize stale queue follow-ups before the team lead acts.",
          requiresApproval: true,
          payload: {
            subagentType: "research",
            title: "Research stale queue follow-ups",
            instructions: "Review stale work items and identify owners.",
            priority: "high",
          },
        },
      ],
      agentLoopBrief: "Review stale work items and identify owners.",
    };
    const loopRepository: HarwickLoopApprovalRepository = {
      getLoopWorkItemForApproval(params) {
        expect(params).toEqual({ workspaceId, workItemId: loopWorkItemId });
        return Promise.resolve({
          id: loopWorkItemId,
          workspaceId,
          leadId,
          trajectoryId: null,
          stepId: null,
          type: "approval",
          status: "pending",
          priority: "high",
          payload: loopApprovalPayload,
        });
      },
      enqueueLoopSubagentTask(params) {
        expect(params).toMatchObject({
          workspaceId,
          leadId,
          subagentType: "research",
          priority: "high",
          title: "Research stale queue follow-ups",
          instructions: "Review stale work items and identify owners.",
        });
        expect(params.payload).toMatchObject({
          source: "harwick_loop_approval",
          loopId,
          loopName: "Friday queue review",
          signalKey: loopApprovalPayload.signalKey,
        });
        stages.push("loop_subagent_queued");
        return Promise.resolve({ taskId: loopSubagentTaskId });
      },
      completeLoopWorkItemApproval(params) {
        expect(params).toMatchObject({
          workspaceId,
          workItemId: loopWorkItemId,
          actorMemberId: memberId,
          nowIso: "2026-05-06T12:05:00.000Z",
        });
        expect(params.payload.loopApproval).toMatchObject({
          approvedByMemberId: memberId,
          executionMode: "agent_loop",
          executed: [
            {
              tool: "dispatch_subagent",
              status: "queued",
              taskId: loopSubagentTaskId,
            },
          ],
        });
        stages.push("harwick_loop_plan_approved");
        return Promise.resolve();
      },
    };

    await expect(approveHarwickLoopWorkItem({
      workspaceId,
      workItemId: loopWorkItemId,
      actorMemberId: memberId,
      repository: loopRepository,
      now: () => new Date("2026-05-06T12:05:00.000Z"),
    })).resolves.toMatchObject({
      status: "approved",
      workItemId: loopWorkItemId,
      loopId,
      loopName: "Friday queue review",
      executed: [
        {
          tool: "dispatch_subagent",
          status: "queued",
          taskId: loopSubagentTaskId,
        },
      ],
    });

    expect(stages).toEqual([
      "meta_inbound",
      "lead_event_persisted",
      "lead_classified",
      "harwick_turn_persisted",
      "operator_queue_send",
      "lead_routed",
      "fub_sync_queued",
      "loop_subagent_queued",
      "harwick_loop_plan_approved",
    ]);
  });
});
