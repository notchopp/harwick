import {
  CreateLeadHandoffArgsSchema,
  EndCallArgsSchema,
  LookupListingArgsSchema,
  RealtyVoiceToolRequestSchema,
  RealtyVoiceToolResponseSchema,
  TransferCallArgsSchema,
  type RealtyVoiceToolName,
  type RealtyVoiceToolResponse,
} from "@realty-ops/core";
import {
  persistVoiceLeadHandoff,
  type VoiceLeadHandoffRepository,
} from "../../lib/supabase/voice-handoffs";
import type { ListingFactRow, ListingLookupRepository } from "../../lib/supabase/listings";
import { DEFAULT_LISTING_STALE_AFTER_MS, isListingFactFresh } from "../listings/listing-lookup";
import {
  createOrRefreshVerifyListingTask,
  type VerifyListingTaskRepository,
} from "../tasks/verify-listing-task";
import type { WorkflowJobEnqueuer } from "../../lib/supabase/workflow-jobs";

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (typeof entryValue === "string") {
        return [[key, entryValue]];
      }
      if (typeof entryValue === "number" || typeof entryValue === "boolean") {
        return [[key, String(entryValue)]];
      }
      return [];
    }),
  );
}

function normalizeDynamicVariables(params: {
  callVariables?: Record<string, unknown>;
  bodyVariables?: Record<string, unknown>;
}): Record<string, string> {
  return {
    ...asStringRecord(params.callVariables),
    ...asStringRecord(params.bodyVariables),
  };
}

function isListingUsableForVoice(listing: ListingFactRow | null): boolean {
  if (listing === null) {
    return false;
  }

  if (listing.source === "manual") {
    return true;
  }

  return isListingFactFresh({
    verifiedAt: listing.verified_at,
    now: new Date(),
    staleAfterMs: DEFAULT_LISTING_STALE_AFTER_MS,
  });
}

function readManualListingDetails(rawFacts: Record<string, unknown>): string[] {
  const details: string[] = [];
  const notes = rawFacts["notes"];
  if (typeof notes === "string" && notes.trim().length > 0) {
    details.push(`Notes: ${notes.trim()}.`);
  }

  const incentives = rawFacts["incentives"];
  if (Array.isArray(incentives)) {
    const normalized = incentives
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim());
    if (normalized.length > 0) {
      details.push(`Incentives: ${normalized.join(", ")}.`);
    }
  }

  const publicUrl = rawFacts["publicUrl"];
  if (typeof publicUrl === "string" && publicUrl.trim().length > 0) {
    details.push(`Listing link: ${publicUrl.trim()}.`);
  }

  return details;
}

type ToolCallContext = {
  callId: string | null;
  retellAgentId: string | null;
  workspaceId: string | null;
  fromNumber: string | null;
  leadId: string | null;
};

async function executeCreateLeadHandoff(params: {
  args: unknown;
  context: ToolCallContext;
  repository?: VoiceLeadHandoffRepository;
  enqueueWorkflowJob?: WorkflowJobEnqueuer;
}): Promise<RealtyVoiceToolResponse> {
  const parsed = CreateLeadHandoffArgsSchema.parse(params.args);
  const leadType = parsed.lead_type === "unknown" ? "lead" : parsed.lead_type;
  const areaText = parsed.target_area ? ` in ${parsed.target_area}` : "";
  let persistedIds: Pick<RealtyVoiceToolResponse, "lead_id" | "handoff_id"> = {};

  if (params.repository !== undefined && params.context.workspaceId !== null) {
    const persisted = await persistVoiceLeadHandoff({
      input: {
        workspaceId: params.context.workspaceId,
        callId: params.context.callId,
        retellAgentId: params.context.retellAgentId,
        fallbackPhone: params.context.fromNumber,
        args: parsed,
      },
      repository: params.repository,
      ...(params.enqueueWorkflowJob === undefined ? {} : { enqueueWorkflowJob: params.enqueueWorkflowJob }),
    });
    persistedIds = {
      lead_id: persisted.leadId,
      handoff_id: persisted.handoffId,
    };
  }

  return RealtyVoiceToolResponseSchema.parse({
    result: `I have enough detail to hand this ${leadType}${areaText} to the team after the call. Keep the caller focused on the next best contact step.`,
    handoff_summary: parsed.summary,
    ...persistedIds,
  });
}

async function executeLookupListing(params: {
  args: unknown;
  context: ToolCallContext;
  repository?: ListingLookupRepository;
  verifyListingTaskRepository?: VerifyListingTaskRepository;
}): Promise<RealtyVoiceToolResponse> {
  const parsed = LookupListingArgsSchema.parse(params.args);
  const listingReference = parsed.mls_number ?? parsed.address ?? parsed.query;
  let listing: ListingFactRow | null = null;
  let listingIsFresh = false;

  if (params.repository !== undefined && params.context.workspaceId !== null) {
    const lookupParams: {
      workspaceId: string;
      query: string;
      mlsNumber?: string | null;
      address?: string | null;
    } = {
      workspaceId: params.context.workspaceId,
      query: parsed.query,
    };
    if (parsed.mls_number !== undefined) {
      lookupParams.mlsNumber = parsed.mls_number;
    }
    if (parsed.address !== undefined) {
      lookupParams.address = parsed.address;
    }
    listing = await params.repository.lookupListing(lookupParams);
    listingIsFresh = isListingUsableForVoice(listing);
  }

  if (
    params.verifyListingTaskRepository !== undefined
    && params.context.workspaceId !== null
    && params.context.leadId !== null
    && (!listingIsFresh || listing === null)
  ) {
    await createOrRefreshVerifyListingTask({
      workspaceId: params.context.workspaceId,
      leadId: params.context.leadId,
      listingReference,
      question: readString(parsed.question),
      verifiedAt: listing?.verified_at ?? null,
      repository: params.verifyListingTaskRepository,
    });
  }

  if (listing !== null) {
    return RealtyVoiceToolResponseSchema.parse({
      result: [
        `${listing.address} is ${listing.status ?? "status unknown"}.`,
        listing.price === null ? "" : `Price: ${listing.price}.`,
        listing.beds === null && listing.baths === null ? "" : `Beds/Baths: ${listing.beds ?? "unknown"}/${listing.baths ?? "unknown"}.`,
        listing.has_pool === null ? "" : `Pool: ${listing.has_pool ? "yes" : "no"}.`,
        ...(listing.source === "manual" ? readManualListingDetails(listing.raw_facts) : []),
        listing.verified_at === null
          ? "Tell the caller the team should verify current details before relying on them."
          : listing.source === "manual"
            ? `Workspace listing notes were last updated at ${listing.verified_at}.`
            : listingIsFresh
            ? `Verified at ${listing.verified_at}.`
            : `Last verified at ${listing.verified_at}. Tell the caller the team should verify current details before relying on them.`,
      ].filter((part) => part.length > 0).join(" "),
    });
  }

  return RealtyVoiceToolResponseSchema.parse({
    result: `I could not verify current listing details for "${listingReference}". Do not guess status, pool, price, or availability. Tell the caller the team will verify the current listing details and follow up.`,
  });
}

function executeTransferCall(args: unknown, dynamicVariables: Record<string, string>): RealtyVoiceToolResponse {
  const parsed = TransferCallArgsSchema.parse(args);
  const transferNumber = readString(dynamicVariables["transfer_number"]);

  if (transferNumber === null) {
    return RealtyVoiceToolResponseSchema.parse({
      result: "I cannot transfer this call yet because no human handoff number is configured. Create a lead handoff instead.",
    });
  }

  return RealtyVoiceToolResponseSchema.parse({
    result: "I am transferring you now so the team can help directly.",
    transfer_number: transferNumber,
    transfer_target: parsed.transfer_to ?? "team",
    handoff_summary: parsed.summary ?? parsed.reason,
  });
}

function executeEndCall(args: unknown): RealtyVoiceToolResponse {
  EndCallArgsSchema.parse(args);

  return RealtyVoiceToolResponseSchema.parse({
    result: "Call ended.",
    end_call: true,
  });
}

export function executeRealtyVoiceTool(params: {
  toolName: RealtyVoiceToolName;
  args: unknown;
  dynamicVariables: Record<string, string>;
  context: ToolCallContext;
  repository?: VoiceLeadHandoffRepository;
  listingRepository?: ListingLookupRepository;
  verifyListingTaskRepository?: VerifyListingTaskRepository;
  enqueueWorkflowJob?: WorkflowJobEnqueuer;
}): Promise<RealtyVoiceToolResponse> | RealtyVoiceToolResponse {
  switch (params.toolName) {
    case "create_lead_handoff":
      return executeCreateLeadHandoff(Object.assign({
        args: params.args,
        context: params.context,
      }, params.repository === undefined ? {} : { repository: params.repository }, params.enqueueWorkflowJob === undefined ? {} : { enqueueWorkflowJob: params.enqueueWorkflowJob }));
    case "lookup_listing":
      return executeLookupListing({
        args: params.args,
        context: params.context,
        ...(params.listingRepository === undefined ? {} : { repository: params.listingRepository }),
        ...(params.verifyListingTaskRepository === undefined ? {} : { verifyListingTaskRepository: params.verifyListingTaskRepository }),
      });
    case "transfer_call":
      return executeTransferCall(params.args, params.dynamicVariables);
    case "end_call":
      return executeEndCall(params.args);
  }
}

type ExecuteRealtyVoiceToolInput = Parameters<typeof executeRealtyVoiceTool>[0];

export type RetellToolsResult =
  | {
      status: 200;
      body: RealtyVoiceToolResponse;
    }
  | {
      status: 400;
      body: {
        result: string;
      };
    };

function buildToolCallContext(params: {
  body: unknown;
  call?: {
    call_id?: string | undefined;
    agent_id?: string | undefined;
  } | undefined;
  dynamicVariables: Record<string, string>;
}): ToolCallContext {
  const bodyRecord = params.body && typeof params.body === "object" && !Array.isArray(params.body)
    ? params.body as Record<string, unknown>
    : {};

  return {
    callId: readString(bodyRecord["call_id"]) ?? readString(params.call?.call_id),
    retellAgentId: readString(bodyRecord["agent_id"]) ?? readString(params.call?.agent_id)
      ?? readString(params.dynamicVariables["retell_agent_id"]),
    workspaceId: readString(params.dynamicVariables["workspace_id"]),
    fromNumber: readString(params.dynamicVariables["from_number"]),
    leadId: readString(params.dynamicVariables["lead_id"]),
  };
}

export async function handleRetellToolCall(params: {
  body: unknown;
  repository?: VoiceLeadHandoffRepository;
  listingRepository?: ListingLookupRepository;
  verifyListingTaskRepository?: VerifyListingTaskRepository;
  enqueueWorkflowJob?: WorkflowJobEnqueuer;
}): Promise<RetellToolsResult> {
  const parsed = RealtyVoiceToolRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      status: 400,
      body: {
        result: "That tool request was malformed. Continue the call without using a tool.",
      },
    };
  }

  const toolName = parsed.data.name ?? parsed.data.tool_name;
  if (toolName === undefined) {
    return {
      status: 400,
      body: {
        result: "That tool request was malformed. Continue the call without using a tool.",
      },
    };
  }

  const dynamicVariableInput: {
    callVariables?: Record<string, unknown>;
    bodyVariables?: Record<string, unknown>;
  } = {};
  if (parsed.data.call?.retell_llm_dynamic_variables !== undefined) {
    dynamicVariableInput.callVariables = parsed.data.call.retell_llm_dynamic_variables;
  }
  if (parsed.data.retell_llm_dynamic_variables !== undefined) {
    dynamicVariableInput.bodyVariables = parsed.data.retell_llm_dynamic_variables;
  }
  const dynamicVariables = normalizeDynamicVariables(dynamicVariableInput);
  const contextParams: Parameters<typeof buildToolCallContext>[0] = {
    body: params.body,
    dynamicVariables,
    ...(parsed.data.call === undefined ? {} : { call: parsed.data.call }),
  };
  const context = buildToolCallContext(contextParams);
  const executionInput: ExecuteRealtyVoiceToolInput = {
    toolName,
    args: parsed.data.args ?? parsed.data.arguments ?? {},
    dynamicVariables,
    context,
    ...(params.repository === undefined ? {} : { repository: params.repository }),
    ...(params.listingRepository === undefined ? {} : { listingRepository: params.listingRepository }),
    ...(params.verifyListingTaskRepository === undefined ? {} : { verifyListingTaskRepository: params.verifyListingTaskRepository }),
    ...(params.enqueueWorkflowJob === undefined ? {} : { enqueueWorkflowJob: params.enqueueWorkflowJob }),
  };

  try {
    return {
      status: 200,
      body: await executeRealtyVoiceTool(executionInput),
    };
  } catch {
    return {
      status: 400,
      body: {
        result: `The ${toolName} tool did not have the required details. Ask one focused follow-up question, then try again.`,
      },
    };
  }
}
