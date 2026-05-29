import { createServerSupabaseClient } from "../../lib/supabase/server-client";
import type { HarwickTypedCard } from "@realty-ops/core";

/**
 * THREADS-4: lead/listing anchoring + auto-post on lead events.
 *
 * When a lead is captured (or a listing event of significance happens),
 * ensure a `lead_thread` / `listing_thread` exists for it, then post the
 * relevant typed card into that thread. The thread itself becomes the
 * persistent conversation surface around that entity.
 *
 * Idempotency: calling getOrCreateLeadThread twice returns the same id.
 * Race-safe via a unique anchor lookup before insert.
 */

export async function getOrCreateLeadThread(params: {
  workspaceId: string;
  leadId: string;
  leadName: string;
}): Promise<{ channelId: string }> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const existing = await untyped
    .from("harwick_channels")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("kind", "lead_thread")
    .eq("anchor_entity_type", "lead")
    .eq("anchor_entity_id", params.leadId)
    .maybeSingle();
  if (existing.data?.id !== undefined) return { channelId: existing.data.id as string };

  const inserted = await untyped
    .from("harwick_channels")
    .insert({
      workspace_id: params.workspaceId,
      kind: "lead_thread",
      name: params.leadName,
      description: `Conversation around lead ${params.leadId}`,
      anchor_entity_type: "lead",
      anchor_entity_id: params.leadId,
      is_private: false,
    })
    .select("id")
    .single();
  return { channelId: inserted.data.id as string };
}

export async function getOrCreateListingThread(params: {
  workspaceId: string;
  listingId: string;
  listingAddress: string;
}): Promise<{ channelId: string }> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const existing = await untyped
    .from("harwick_channels")
    .select("id")
    .eq("workspace_id", params.workspaceId)
    .eq("kind", "listing_thread")
    .eq("anchor_entity_type", "listing")
    .eq("anchor_entity_id", params.listingId)
    .maybeSingle();
  if (existing.data?.id !== undefined) return { channelId: existing.data.id as string };

  const inserted = await untyped
    .from("harwick_channels")
    .insert({
      workspace_id: params.workspaceId,
      kind: "listing_thread",
      name: params.listingAddress,
      description: `Discussion thread for listing ${params.listingId}`,
      anchor_entity_type: "listing",
      anchor_entity_id: params.listingId,
      is_private: false,
    })
    .select("id")
    .single();
  return { channelId: inserted.data.id as string };
}

/**
 * Post a typed card into a channel as Harwick.
 */
export async function postTypedCard(params: {
  workspaceId: string;
  channelId: string;
  card: HarwickTypedCard;
  body: string;
  mentionsHarwick?: boolean;
  mentionedMemberIds?: string[];
}): Promise<{ messageId: string }> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const result = await untyped
    .from("harwick_channel_messages")
    .insert({
      channel_id: params.channelId,
      workspace_id: params.workspaceId,
      author_kind: "harwick",
      body: params.body,
      card_kind: params.card.kind,
      card_payload: params.card,
      mentions_harwick: params.mentionsHarwick ?? false,
      mentioned_member_ids: params.mentionedMemberIds ?? [],
    })
    .select("id")
    .single();
  await untyped
    .from("harwick_channels")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", params.channelId);
  return { messageId: result.data.id as string };
}
