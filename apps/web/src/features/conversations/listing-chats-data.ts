import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";

/**
 * In-progress public-listing-chat sessions for the /conversations surface.
 * Where the existing inbox surfaces lead-based threads (after a lead is
 * captured), this surfaces sessions THAT ARE STILL IN CONVERSATION — the
 * realtor's "watch live qualification happen" view.
 *
 * Each thread carries:
 *   - listing address (what the buyer landed on)
 *   - auto-generated visitor headline (Harwick's one-line profile)
 *   - qualification summary so far
 *   - last 2 visitor turns (so the operator sees what the buyer just said)
 *   - whether this session has promoted to a lead yet
 *   - life context entries (so the operator instantly sees "3 kids middle school")
 *
 * This is the "convos refactor begin" — first surface where buyer-chat
 * sessions are first-class operator objects, not invisible until captured.
 */

export type BuyerChatThread = {
  sessionId: string;
  listingId: string;
  listingAddress: string;
  visitorName: string | null;
  visitorHeadline: string | null;
  qualificationSummary: string | null;
  lifeContext: string[];
  promotedLeadId: string | null;
  lastActiveAt: string;
  createdAt: string;
  turnCount: number;
  recentVisitorTurns: Array<{ body: string; occurredAt: string }>;
};

type SessionRow = {
  id: string;
  listing_id: string;
  qualification: Record<string, unknown> | null;
  promoted_lead_id: string | null;
  last_active_at: string;
  created_at: string;
};

type ListingRow = {
  id: string;
  address: string;
};

type TurnRow = {
  session_id: string;
  actor: "visitor" | "harwick_ai";
  body: string;
  occurred_at: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readString(rec: Record<string, unknown> | null, key: string): string | null {
  if (rec === null) return null;
  const v = rec[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function readStringArray(rec: Record<string, unknown> | null, key: string): string[] {
  if (rec === null) return [];
  const v = rec[key];
  return Array.isArray(v)
    ? v.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export type BuyerChatTranscriptTurn = {
  actor: "visitor" | "harwick_ai";
  body: string;
  occurredAt: string;
};

export type BuyerChatTranscript = {
  sessionId: string;
  listingId: string;
  listingAddress: string;
  visitorName: string | null;
  visitorHeadline: string | null;
  qualificationSummary: string | null;
  lifeContext: string[];
  promotedLeadId: string | null;
  turns: BuyerChatTranscriptTurn[];
};

/**
 * Full transcript for a single buyer chat session — by leadId. Used by the
 * /conversations detail pane when the selected thread is sourced from
 * public_listing_chat. Replaces the Meta-style synthesis/draft chrome with
 * the actual visitor ↔ harwick_ai conversation that happened.
 */
export async function loadBuyerChatTranscriptByLeadId(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  leadId: string;
}): Promise<BuyerChatTranscript | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = params.supabase as any;
  const { data: session } = await untyped
    .from("public_listing_sessions")
    .select("id, listing_id, qualification, promoted_lead_id")
    .eq("workspace_id", params.workspaceId)
    .eq("promoted_lead_id", params.leadId)
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (session === null || session === undefined) return null;

  const { data: listing } = await untyped
    .from("listing_facts")
    .select("id, address")
    .eq("id", session.listing_id)
    .maybeSingle();

  const { data: turns } = await untyped
    .from("public_listing_session_turns")
    .select("actor, body, occurred_at")
    .eq("session_id", session.id)
    .order("occurred_at", { ascending: true });

  const qualification = asRecord(session.qualification);
  return {
    sessionId: session.id as string,
    listingId: session.listing_id as string,
    listingAddress: (listing?.address as string | undefined) ?? "Unknown listing",
    visitorName: readString(qualification, "name"),
    visitorHeadline: readString(qualification, "headline"),
    qualificationSummary: readString(qualification, "qualificationSummary")
      ?? readString(qualification, "summary"),
    lifeContext: readStringArray(qualification, "lifeContext"),
    promotedLeadId: session.promoted_lead_id as string | null,
    turns: ((turns ?? []) as Array<{ actor: "visitor" | "harwick_ai"; body: string; occurred_at: string }>).map((turn) => ({
      actor: turn.actor,
      body: turn.body,
      occurredAt: turn.occurred_at,
    })),
  };
}

export async function loadBuyerChatThreads(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  limit: number;
}): Promise<BuyerChatThread[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = params.supabase as any;

  // 1. Recent sessions for this workspace.
  const { data: sessions } = await untyped
    .from("public_listing_sessions")
    .select("id, listing_id, qualification, promoted_lead_id, last_active_at, created_at")
    .eq("workspace_id", params.workspaceId)
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(params.limit);

  const rows = (sessions ?? []) as SessionRow[];
  if (rows.length === 0) return [];

  // 2. Listing addresses for those sessions.
  const listingIds = Array.from(new Set(rows.map((row) => row.listing_id)));
  const { data: listings } = await untyped
    .from("listing_facts")
    .select("id, address")
    .in("id", listingIds);
  const listingById = new Map<string, ListingRow>(
    ((listings ?? []) as ListingRow[]).map((row) => [row.id, row]),
  );

  // 3. Recent visitor turns for those sessions (last 6 per — we filter to
  // visitor turns and slice to 2 in the mapping step).
  const sessionIds = rows.map((row) => row.id);
  const { data: turns } = await untyped
    .from("public_listing_session_turns")
    .select("session_id, actor, body, occurred_at")
    .in("session_id", sessionIds)
    .order("occurred_at", { ascending: false })
    .limit(params.limit * 6);
  const turnsBySession = new Map<string, TurnRow[]>();
  for (const turn of (turns ?? []) as TurnRow[]) {
    const list = turnsBySession.get(turn.session_id) ?? [];
    list.push(turn);
    turnsBySession.set(turn.session_id, list);
  }

  return rows.map((row): BuyerChatThread => {
    const qualification = asRecord(row.qualification);
    const allTurns = turnsBySession.get(row.id) ?? [];
    const visitorTurns = allTurns
      .filter((turn) => turn.actor === "visitor")
      .slice(0, 2)
      .map((turn) => ({ body: turn.body, occurredAt: turn.occurred_at }));
    return {
      sessionId: row.id,
      listingId: row.listing_id,
      listingAddress: listingById.get(row.listing_id)?.address ?? "Unknown listing",
      visitorName: readString(qualification, "name"),
      visitorHeadline: readString(qualification, "headline"),
      qualificationSummary: readString(qualification, "qualificationSummary")
        ?? readString(qualification, "summary"),
      lifeContext: readStringArray(qualification, "lifeContext"),
      promotedLeadId: row.promoted_lead_id,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
      turnCount: allTurns.length,
      recentVisitorTurns: visitorTurns,
    };
  });
}
