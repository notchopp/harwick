import { createFollowUpBossClient, type FollowUpBossLeadEventInput } from "@realty-ops/integrations";
import { z } from "zod";

import { decryptCredential } from "../../lib/credentials";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Synchronous push of a captured Harwick lead into Follow Up Boss.
 *
 * Called from public-facing capture moments (listing inquiry form, public chat
 * phone capture, voice call handoff) where we WANT the lead in the operator's
 * FUB pipeline before the user-facing response returns. The async fub_sync
 * queue is reserved for agent-decided sync moments (Harwick re-evaluating
 * whether to re-sync, status updates, etc.).
 *
 * Failure semantics: this function never throws. FUB outages must not block the
 * user-facing intake response. A failed push returns { pushed: false, error }
 * and is intended to be logged + retried via the queue worker (GTM-2).
 */

const FollowUpBossEncryptedCredentialSchema = z.object({
  apiKey: z.string().trim().min(1),
});

export type FollowUpBossPushSource =
  | "listings_site"
  | "voice"
  | "public_chat"
  | "operator_manual";

const SOURCE_LABEL: Record<FollowUpBossPushSource, string> = {
  listings_site: "Harwick · Listings Site",
  voice: "Harwick · Voice",
  public_chat: "Harwick · Public Chat",
  operator_manual: "Harwick · Operator",
};

type LeadIntent = "general" | "question" | "showing" | "open_house";

function deriveType(intent: LeadIntent, hasListing: boolean): FollowUpBossLeadEventInput["type"] {
  if (intent === "showing" || intent === "open_house") return "Property Inquiry";
  if (hasListing) return "Property Inquiry";
  return "General Inquiry";
}

function splitFullName(fullName: string): { firstName?: string; lastName?: string } {
  const trimmed = fullName.trim();
  if (trimmed.length === 0) return {};
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const result: { firstName?: string; lastName?: string } = {};
  if (firstName !== undefined && firstName.length > 0) {
    result.firstName = firstName;
  }
  if (parts.length > 1) {
    const lastName = parts.slice(1).join(" ");
    if (lastName.length > 0) {
      result.lastName = lastName;
    }
  }
  return result;
}

function buildDefaultMessage(params: {
  intent: LeadIntent;
  listingAddress: string | null;
  visitorMessage: string | null;
}): string {
  const visitor = params.visitorMessage?.trim();
  if (visitor !== undefined && visitor.length > 0) return visitor;

  if (params.intent === "showing" && params.listingAddress !== null) {
    return `Requested a showing at ${params.listingAddress}.`;
  }
  if (params.intent === "open_house" && params.listingAddress !== null) {
    return `Registered for the open house at ${params.listingAddress}.`;
  }
  if (params.intent === "question" && params.listingAddress !== null) {
    return `Asked a question about ${params.listingAddress}.`;
  }
  if (params.listingAddress !== null) {
    return `Inquired about ${params.listingAddress}.`;
  }
  return "Submitted an inquiry through the public listings site.";
}

type ListingContext = {
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  price: number | null;
};

type LeadInput = {
  fullName: string;
  email: string | null;
  phone: string | null;
  intent: LeadIntent;
  message: string | null;
};

export type PushLeadToFollowUpBossInput = {
  supabase: RealtyOpsSupabaseClient;
  credentialSecret: string;
  workspaceId: string;
  leadId: string;
  lead: LeadInput;
  listing: ListingContext | null;
  source: FollowUpBossPushSource;
  fetchImpl?: typeof fetch;
};

export type PushLeadToFollowUpBossResult =
  | { pushed: true; fubPersonId: string | null }
  | { pushed: false; reason: "no_credential" | "decrypt_failed" | "request_failed"; error?: string };

export async function pushLeadToFollowUpBoss(
  input: PushLeadToFollowUpBossInput,
): Promise<PushLeadToFollowUpBossResult> {
  const credentialRow = await loadFollowUpBossCredential({
    supabase: input.supabase,
    workspaceId: input.workspaceId,
  });
  if (credentialRow === null) {
    return { pushed: false, reason: "no_credential" };
  }

  let apiKey: string;
  try {
    const decrypted = decryptCredential<unknown>(
      credentialRow.encrypted_credential_ref!,
      input.credentialSecret,
    );
    apiKey = FollowUpBossEncryptedCredentialSchema.parse(decrypted).apiKey;
  } catch (error) {
    return {
      pushed: false,
      reason: "decrypt_failed",
      error: error instanceof Error ? error.message : "unknown decryption error",
    };
  }

  const client = createFollowUpBossClient(
    input.fetchImpl === undefined ? { apiKey } : { apiKey, fetchImpl: input.fetchImpl },
  );

  const nameParts = splitFullName(input.lead.fullName);
  const personPayload: FollowUpBossLeadEventInput["person"] = {
    ...nameParts,
    name: input.lead.fullName.trim().length > 0 ? input.lead.fullName.trim() : undefined,
    ...(input.lead.email === null ? {} : { emails: [{ value: input.lead.email }] }),
    ...(input.lead.phone === null ? {} : { phones: [{ value: input.lead.phone }] }),
  };

  const propertyPayload: FollowUpBossLeadEventInput["property"] = input.listing === null
    ? undefined
    : {
      street: input.listing.address,
      ...(input.listing.city === null ? {} : { city: input.listing.city }),
      ...(input.listing.state === null ? {} : { state: input.listing.state }),
      ...(input.listing.postalCode === null ? {} : { code: input.listing.postalCode }),
      ...(input.listing.price === null ? {} : { price: input.listing.price }),
    };

  const payload: FollowUpBossLeadEventInput = {
    source: SOURCE_LABEL[input.source],
    system: "Harwick",
    type: deriveType(input.lead.intent, input.listing !== null),
    message: buildDefaultMessage({
      intent: input.lead.intent,
      listingAddress: input.listing?.address ?? null,
      visitorMessage: input.lead.message,
    }),
    person: personPayload,
    ...(propertyPayload === undefined ? {} : { property: propertyPayload }),
  };

  let fubPersonId: string | null;
  try {
    fubPersonId = await client.sendLeadEvent(payload);
  } catch (error) {
    return {
      pushed: false,
      reason: "request_failed",
      error: error instanceof Error ? error.message : "unknown FUB error",
    };
  }

  if (fubPersonId !== null && fubPersonId.length > 0) {
    const { error: updateError } = await input.supabase
      .from("leads")
      .update({ follow_up_boss_contact_id: fubPersonId })
      .eq("id", input.leadId)
      .eq("workspace_id", input.workspaceId);

    if (updateError !== null) {
      // Persistence failure isn't a push failure — FUB already has the lead.
      return { pushed: true, fubPersonId: null };
    }
  }

  return { pushed: true, fubPersonId };
}

type FollowUpBossCredentialRow = {
  encrypted_credential_ref: string | null;
};

async function loadFollowUpBossCredential(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
}): Promise<FollowUpBossCredentialRow | null> {
  const { data, error } = await params.supabase
    .from("integration_accounts")
    .select("encrypted_credential_ref")
    .eq("workspace_id", params.workspaceId)
    .eq("provider", "follow_up_boss")
    .eq("status", "connected")
    .not("encrypted_credential_ref", "is", null)
    .maybeSingle<FollowUpBossCredentialRow>();

  if (error !== null) return null;
  if (data === null) return null;
  if (data.encrypted_credential_ref === null) return null;
  return data;
}
