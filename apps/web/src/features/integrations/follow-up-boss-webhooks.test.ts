import { describe, expect, it, vi } from "vitest";
import { encryptCredential } from "../../lib/credentials";
import { registerFollowUpBossWebhooks } from "./follow-up-boss-webhooks";

const workspaceId = "123e4567-e89b-12d3-a456-426614174020";
const integrationAccountId = "123e4567-e89b-12d3-a456-426614174021";
const credentialSecret = "change-me-to-a-long-random-secret";

describe("registerFollowUpBossWebhooks", () => {
  it("seeds and registers the default Follow Up Boss webhook set", async () => {
    const subscriptions: Array<{
      subscriptionId: string;
      integrationAccountId: string;
      eventType: "peopleUpdated" | "peopleStageUpdated" | "notesCreated" | "tasksCreated" | "textMessagesCreated" | "callsCreated";
      providerWebhookId: string | null;
      callbackToken: string;
      systemName: string;
      encryptedSystemKeyRef: string;
    }> = [];
    const fetchImpl = vi.fn().mockImplementation(() => Promise.resolve(new Response(
      JSON.stringify({ id: 77 }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      },
    )));

    const result = await registerFollowUpBossWebhooks({
      workspaceId,
      appBaseUrl: "https://app.example.com",
      credentialSecret,
      findConnectedCredential: () => Promise.resolve({
        integrationAccountId,
        encryptedCredentialRef: encryptCredential({ apiKey: "fub-key" }, credentialSecret),
      }),
      subscriptionStore: {
        listSubscriptionsByWorkspace() {
          return Promise.resolve([...subscriptions]);
        },
        upsertRegistrationSeeds(params) {
          subscriptions.push(...params.subscriptions.map((subscription, index) => ({
            subscriptionId: `subscription-${index + 1}`,
            integrationAccountId: params.integrationAccountId,
            eventType: subscription.eventType,
            providerWebhookId: null,
            callbackToken: subscription.callbackToken,
            systemName: subscription.systemName,
            encryptedSystemKeyRef: subscription.encryptedSystemKeyRef,
          })));
          return Promise.resolve([...subscriptions]);
        },
        markSubscriptionActive(params) {
          const subscription = subscriptions.find((candidate) => candidate.subscriptionId === params.subscriptionId);
          if (subscription !== undefined) {
            subscription.providerWebhookId = params.providerWebhookId;
          }
          return Promise.resolve();
        },
        markSubscriptionError() {
          return Promise.resolve();
        },
      },
      fetchImpl,
    });

    expect(result.registeredCount).toBe(6);
    expect(result.activeSubscriptionCount).toBe(6);
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });
});
