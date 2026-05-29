import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * THREADS-5: when @harwick is mentioned in a channel that has an anchor
 * (lead_thread or listing_thread), the handler resolves the anchor and pulls
 * that entity's state into Harwick's context so the reply is grounded in
 * the lead/listing rather than generic.
 */

export async function resolveChannelAnchor(channelId: string): Promise<{
  anchorEntityType: "lead" | "listing" | null;
  anchorEntityId: string | null;
  contextSnippet: string | null;
}> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;

  const { data: channel } = await untyped
    .from("harwick_channels")
    .select("workspace_id, anchor_entity_type, anchor_entity_id")
    .eq("id", channelId)
    .maybeSingle();
  if (channel === null || channel === undefined) {
    return { anchorEntityType: null, anchorEntityId: null, contextSnippet: null };
  }
  const anchorType = channel.anchor_entity_type as "lead" | "listing" | null;
  const anchorId = channel.anchor_entity_id as string | null;
  if (anchorType === null || anchorId === null) {
    return { anchorEntityType: null, anchorEntityId: null, contextSnippet: null };
  }

  if (anchorType === "lead") {
    const { data: lead } = await untyped
      .from("leads")
      .select("full_name, qualification_summary, status, lead_type, score, target_area")
      .eq("id", anchorId)
      .maybeSingle();
    if (lead === null || lead === undefined) {
      return { anchorEntityType: anchorType, anchorEntityId: anchorId, contextSnippet: null };
    }
    const summary = lead.qualification_summary ?? `${lead.lead_type} lead (score ${lead.score})`;
    const snippet = `Lead ${lead.full_name ?? anchorId.slice(0, 8)}: ${summary}. Target: ${lead.target_area ?? "unknown"}. Status: ${lead.status}.`;
    return { anchorEntityType: anchorType, anchorEntityId: anchorId, contextSnippet: snippet };
  }

  if (anchorType === "listing") {
    const { data: listing } = await untyped
      .from("listing_facts")
      .select("address, price, status, beds, baths")
      .eq("id", anchorId)
      .maybeSingle();
    if (listing === null || listing === undefined) {
      return { anchorEntityType: anchorType, anchorEntityId: anchorId, contextSnippet: null };
    }
    const snippet = `Listing ${listing.address}: \$${listing.price}, ${listing.beds}bd/${listing.baths}ba, status ${listing.status}.`;
    return { anchorEntityType: anchorType, anchorEntityId: anchorId, contextSnippet: snippet };
  }

  return { anchorEntityType: null, anchorEntityId: null, contextSnippet: null };
}
