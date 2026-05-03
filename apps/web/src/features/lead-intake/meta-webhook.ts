import type { NormalizedLeadEvent } from "@realty-ops/core";
import {
  extractMetaProviderAccountIds,
  normalizeMetaSocialPostContexts,
  normalizeMetaWebhookPayload,
  verifyMetaWebhookChallenge,
} from "@realty-ops/integrations";
import type { SocialPostContext } from "@realty-ops/core";
import { z } from "zod";

export type MetaWebhookVerificationResponse = {
  status: number;
  body: string;
};

export type MetaWorkspaceResolver = (providerAccountId: string) => Promise<string | null>;

export type LeadEventWriterResult = {
  persistedCount: number;
  duplicateCount: number;
  leadUpsertCount: number;
};

export type LeadEventWriter = (events: NormalizedLeadEvent[]) => Promise<LeadEventWriterResult>;

export type SocialPostContextWriter = (contexts: SocialPostContext[]) => Promise<number>;
export type SocialPostContextHydrator = (contexts: SocialPostContext[]) => Promise<SocialPostContext[]>;

export type MetaWebhookDeliveryResponse = {
  status: 200 | 202 | 400;
  body: {
    accepted: boolean;
    normalizedEventCount: number;
    persistedEventCount: number;
    duplicateEventCount: number;
    leadUpsertCount: number;
    unmatchedProviderAccountIds: string[];
    reason?: "malformed_payload";
  };
};

export function handleMetaWebhookVerification(params: {
  query: unknown;
  expectedVerifyToken: string;
}): MetaWebhookVerificationResponse {
  const result = verifyMetaWebhookChallenge(params);

  if (result.ok) {
    return {
      status: 200,
      body: result.challenge,
    };
  }

  return {
    status: result.status,
    body: result.reason,
  };
}

export async function handleMetaWebhookDelivery(params: {
  payload: unknown;
  resolveWorkspaceIdByProviderAccountId: MetaWorkspaceResolver;
  writeLeadEvents: LeadEventWriter;
  writeSocialPostContexts?: SocialPostContextWriter;
  hydrateSocialPostContexts?: SocialPostContextHydrator;
}): Promise<MetaWebhookDeliveryResponse> {
  let providerAccountIds: string[];

  try {
    providerAccountIds = extractMetaProviderAccountIds(params.payload);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return {
        status: 400,
        body: {
        accepted: false,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds: [],
        reason: "malformed_payload",
      },
      };
    }

    throw error;
  }

  const normalizedEvents: NormalizedLeadEvent[] = [];
  const unmatchedProviderAccountIds: string[] = [];
  const workspaceAccountIds = new Map<string, string[]>();

  for (const providerAccountId of providerAccountIds) {
    const workspaceId = await params.resolveWorkspaceIdByProviderAccountId(providerAccountId);
    console.log("[WEBHOOK] Resolved workspace for account", { providerAccountId, workspaceId });
    if (workspaceId === null) {
      console.log("[WEBHOOK] No workspace found for account:", providerAccountId);
      unmatchedProviderAccountIds.push(providerAccountId);
      continue;
    }

    const existingAccountIds = workspaceAccountIds.get(workspaceId) ?? [];
    existingAccountIds.push(providerAccountId);
    workspaceAccountIds.set(workspaceId, existingAccountIds);
  }

  for (const [workspaceId, accountIds] of workspaceAccountIds.entries()) {
    normalizedEvents.push(...normalizeMetaWebhookPayload({
      workspaceId,
      payload: params.payload,
      providerAccountIds: accountIds,
    }));
    if (params.writeSocialPostContexts !== undefined) {
      const postContexts = normalizeMetaSocialPostContexts({
        workspaceId,
        payload: params.payload,
        providerAccountIds: accountIds,
      });
      await params.writeSocialPostContexts(params.hydrateSocialPostContexts === undefined
        ? postContexts
        : await params.hydrateSocialPostContexts(postContexts));
    }
  }

  if (normalizedEvents.length === 0) {
    return {
      status: unmatchedProviderAccountIds.length > 0 ? 202 : 200,
      body: {
        accepted: true,
        normalizedEventCount: 0,
        persistedEventCount: 0,
        duplicateEventCount: 0,
        leadUpsertCount: 0,
        unmatchedProviderAccountIds,
      },
    };
  }

  const writeResult = await params.writeLeadEvents(normalizedEvents);

  return {
    status: unmatchedProviderAccountIds.length > 0 ? 202 : 200,
    body: {
      accepted: true,
      normalizedEventCount: normalizedEvents.length,
      persistedEventCount: writeResult.persistedCount,
      duplicateEventCount: writeResult.duplicateCount,
      leadUpsertCount: writeResult.leadUpsertCount,
      unmatchedProviderAccountIds,
    },
  };
}
