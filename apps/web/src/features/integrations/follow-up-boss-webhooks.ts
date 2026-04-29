import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  FollowUpBossWebhookEventTypeSchema,
  type FollowUpBossWebhookEventType,
} from "@realty-ops/core";
import { createFollowUpBossClient } from "@realty-ops/integrations";
import { decryptCredential, encryptCredential } from "../../lib/credentials";

const FollowUpBossCredentialSchema = z.object({
  apiKey: z.string().trim().min(1),
});

const FollowUpBossSystemKeySchema = z.object({
  systemKey: z.string().trim().min(16),
});

const defaultWebhookEvents = FollowUpBossWebhookEventTypeSchema.options;

export type FollowUpBossCredentialResolver = (workspaceId: string) => Promise<{
  integrationAccountId: string;
  encryptedCredentialRef: string;
} | null>;

export type FollowUpBossWebhookSubscriptionStore = {
  listSubscriptionsByWorkspace(workspaceId: string): Promise<Array<{
    subscriptionId: string;
    integrationAccountId: string;
    eventType: FollowUpBossWebhookEventType;
    providerWebhookId: string | null;
    callbackToken: string;
    systemName: string;
    encryptedSystemKeyRef: string;
  }>>;
  upsertRegistrationSeeds(params: {
    workspaceId: string;
    integrationAccountId: string;
    subscriptions: Array<{
      eventType: FollowUpBossWebhookEventType;
      callbackToken: string;
      systemName: string;
      encryptedSystemKeyRef: string;
    }>;
  }): Promise<Array<{
    subscriptionId: string;
    integrationAccountId: string;
    eventType: FollowUpBossWebhookEventType;
    providerWebhookId: string | null;
    callbackToken: string;
    systemName: string;
    encryptedSystemKeyRef: string;
  }>>;
  markSubscriptionActive(params: {
    subscriptionId: string;
    providerWebhookId: string;
  }): Promise<void>;
  markSubscriptionError(params: {
    subscriptionId: string;
    errorCode: string;
    errorMessage: string;
  }): Promise<void>;
};

export async function registerFollowUpBossWebhooks(params: {
  workspaceId: string;
  appBaseUrl: string;
  credentialSecret: string;
  findConnectedCredential: FollowUpBossCredentialResolver;
  subscriptionStore: FollowUpBossWebhookSubscriptionStore;
  fetchImpl?: typeof fetch;
}): Promise<{
  registeredCount: number;
  activeSubscriptionCount: number;
}> {
  const credentialRecord = await params.findConnectedCredential(params.workspaceId);
  if (credentialRecord === null) {
    throw new Error("Follow Up Boss credential is not connected for this workspace.");
  }

  const credential = FollowUpBossCredentialSchema.parse(
    decryptCredential<unknown>(credentialRecord.encryptedCredentialRef, params.credentialSecret),
  );
  const existingSubscriptions = await params.subscriptionStore.listSubscriptionsByWorkspace(params.workspaceId);
  const systemName = `RealtyOps:${params.workspaceId}`;
  const newSeeds = defaultWebhookEvents
    .filter((eventType) => !existingSubscriptions.some((subscription) => subscription.eventType === eventType))
    .map((eventType) => ({
      eventType,
      callbackToken: randomBytes(18).toString("base64url"),
      systemName,
      encryptedSystemKeyRef: encryptCredential({
        systemKey: randomBytes(24).toString("base64url"),
      }, params.credentialSecret),
    }));
  const seededSubscriptions = newSeeds.length === 0
    ? existingSubscriptions
    : await params.subscriptionStore.upsertRegistrationSeeds({
      workspaceId: params.workspaceId,
      integrationAccountId: credentialRecord.integrationAccountId,
      subscriptions: newSeeds,
    });
  const client = createFollowUpBossClient({
    apiKey: credential.apiKey,
    ...(params.fetchImpl === undefined ? {} : { fetchImpl: params.fetchImpl }),
  });

  let registeredCount = 0;
  for (const subscription of seededSubscriptions) {
    if (subscription.providerWebhookId !== null) {
      continue;
    }

    try {
      const systemKey = FollowUpBossSystemKeySchema.parse(
        decryptCredential<unknown>(subscription.encryptedSystemKeyRef, params.credentialSecret),
      ).systemKey;
      const registered = await client.createWebhookSubscription({
        event: subscription.eventType,
        url: `${params.appBaseUrl.replace(/\/+$/, "")}/api/follow-up-boss/webhook/${subscription.callbackToken}`,
        system: subscription.systemName,
        systemKey,
      });
      await params.subscriptionStore.markSubscriptionActive({
        subscriptionId: subscription.subscriptionId,
        providerWebhookId: registered.id,
      });
      registeredCount += 1;
    } catch (error: unknown) {
      await params.subscriptionStore.markSubscriptionError({
        subscriptionId: subscription.subscriptionId,
        errorCode: "registration_failed",
        errorMessage: error instanceof Error ? error.message : "Unknown Follow Up Boss webhook registration error.",
      });
      throw error;
    }
  }

  const refreshedSubscriptions = await params.subscriptionStore.listSubscriptionsByWorkspace(params.workspaceId);
  return {
    registeredCount,
    activeSubscriptionCount: refreshedSubscriptions.filter((subscription) => subscription.providerWebhookId !== null).length,
  };
}
