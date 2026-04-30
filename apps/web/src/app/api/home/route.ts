import { TeamPresenceResponseSchema, UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";
import { loadTeamPresence } from "../../../features/home/team-presence";
import { loadOperationsQueueSummary, loadWorkspaceReadiness } from "../../../features/operations/workspace-operations";
import { loadSocialReplyQueue, loadVoiceHandoffQueue } from "../../../features/operator-queues/operator-queues";
import { createServerSupabaseClient } from "../../../lib/supabase/server-client";
import { createSupabaseWorkspaceOperationsRepository } from "../../../lib/supabase/operations";
import { createSupabaseSocialReplyQueueRepository, createSupabaseVoiceHandoffQueueRepository } from "../../../lib/supabase/operator-queues";
import { createSupabaseTeamPresenceRepository } from "../../../lib/supabase/team-presence";

export const runtime = "nodejs";

const demoWorkspaceId = "123e4567-e89b-12d3-a456-426614174000";

const fallbackTeamPresence = TeamPresenceResponseSchema.parse({
  workspaceId: demoWorkspaceId,
  members: [
    {
      id: "123e4567-e89b-12d3-a456-426614174010",
      workspaceId: demoWorkspaceId,
      activeLeadCount: 12,
      avatarUrl: null,
      initials: "AD",
      lastSeen: "active now",
      lastSeenAt: new Date().toISOString(),
      name: "Ademola",
      openWork: 3,
      role: "owner",
      roleLabel: "rainmaker",
      status: "online",
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174011",
      workspaceId: demoWorkspaceId,
      activeLeadCount: 4,
      avatarUrl: null,
      initials: "SK",
      lastSeen: "active now",
      lastSeenAt: new Date().toISOString(),
      name: "Sarah K.",
      openWork: 2,
      role: "agent",
      roleLabel: "new construction",
      status: "online",
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174012",
      workspaceId: demoWorkspaceId,
      activeLeadCount: 7,
      avatarUrl: null,
      initials: "AM",
      lastSeen: "on a call",
      lastSeenAt: new Date().toISOString(),
      name: "Ari M.",
      openWork: 1,
      role: "agent",
      roleLabel: "luxury buyers",
      status: "in_call",
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174013",
      workspaceId: demoWorkspaceId,
      activeLeadCount: 10,
      avatarUrl: null,
      initials: "DR",
      lastSeen: "away 8m",
      lastSeenAt: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      name: "Demi R.",
      openWork: 4,
      role: "agent",
      roleLabel: "lease desk",
      status: "away",
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174014",
      workspaceId: demoWorkspaceId,
      activeLeadCount: 5,
      avatarUrl: null,
      initials: "MT",
      lastSeen: "active now",
      lastSeenAt: new Date().toISOString(),
      name: "Marcus T.",
      openWork: 1,
      role: "admin",
      roleLabel: "team ops",
      status: "online",
    },
  ],
});

async function getTeamPresence(workspaceId: string) {
  try {
    const response = await loadTeamPresence({
      workspaceId,
      repository: createSupabaseTeamPresenceRepository(createServerSupabaseClient()),
    });

    if (response.members.length > 0) {
      return response;
    }
  } catch (error) {
    console.error("GET /api/home team presence fallback:", error);
  }

  return {
    ...fallbackTeamPresence,
    workspaceId,
    members: fallbackTeamPresence.members.map((member) => ({ ...member, workspaceId })),
  };
}

export async function GET(request: NextRequest) {
  try {
    const requestedWorkspaceId = UuidSchema.safeParse(request.nextUrl.searchParams.get("workspaceId"));
    const workspaceId = requestedWorkspaceId.success ? requestedWorkspaceId.data : demoWorkspaceId;
    const canUseDevelopmentDataBridge = process.env["NODE_ENV"] === "development";

    if (!canUseDevelopmentDataBridge) {
      return NextResponse.json({
        teamPresence: {
          ...fallbackTeamPresence,
          workspaceId,
          members: fallbackTeamPresence.members.map((member) => ({ ...member, workspaceId })),
        },
        operations: null,
        readiness: null,
        socialQueue: null,
        voiceQueue: null,
      });
    }

    const supabase = createServerSupabaseClient();
    const teamPresence = await getTeamPresence(workspaceId);
    const [operations, readiness, socialQueue, voiceQueue] = await Promise.all([
      loadOperationsQueueSummary({
        workspaceId,
        repository: createSupabaseWorkspaceOperationsRepository(supabase),
      }).catch((error: unknown) => {
        console.error("GET /api/home operations fallback:", error);
        return null;
      }),
      loadWorkspaceReadiness({
        workspaceId,
        repository: createSupabaseWorkspaceOperationsRepository(supabase),
      }).catch((error: unknown) => {
        console.error("GET /api/home readiness fallback:", error);
        return null;
      }),
      loadSocialReplyQueue({
        workspaceId,
        repository: createSupabaseSocialReplyQueueRepository(supabase),
        limit: 10,
      }).catch((error: unknown) => {
        console.error("GET /api/home social queue fallback:", error);
        return null;
      }),
      loadVoiceHandoffQueue({
        workspaceId,
        repository: createSupabaseVoiceHandoffQueueRepository(supabase),
        limit: 10,
      }).catch((error: unknown) => {
        console.error("GET /api/home voice queue fallback:", error);
        return null;
      }),
    ]);

    const homeData = {
      teamPresence,
      operations,
      readiness,
      socialQueue,
      voiceQueue,
      deskSignals: [
        {
          id: "response-time",
          label: "Response time",
          value: "2.1m",
          context: "avg",
          tone: "qualified" as const,
        },
        {
          id: "qualified-count",
          label: "Qualified",
          value: "8",
          context: "this week",
          tone: "hot" as const,
        },
        {
          id: "queue-depth",
          label: "Queue",
          value: "12",
          context: "pending",
          tone: "warm" as const,
        },
      ],
      immediateMoves: [
        {
          id: "lead-1",
          name: "Sarah Chen",
          channel: "Instagram",
          score: 87,
          tone: "qualified" as const,
          action: "Review",
        },
        {
          id: "lead-2",
          name: "Marcus Johnson",
          channel: "Voice",
          score: 91,
          tone: "hot" as const,
          action: "Qualify",
        },
        {
          id: "lead-3",
          name: "Elena Rodriguez",
          channel: "Web form",
          score: 72,
          tone: "warm" as const,
          action: "Follow-up",
        },
      ],
      conversationLane: [
        {
          id: "conv-1",
          name: "Sarah Chen",
          channel: "Instagram",
          summary: "Asking about 3br homes in downtown",
          time: "12m ago",
          tone: "hot" as const,
          icon: "InstagramLogo" as const,
        },
        {
          id: "conv-2",
          name: "Marcus Johnson",
          channel: "Voice callback",
          summary: "Transferred from Retell, discussing timeline",
          time: "34m ago",
          tone: "qualified" as const,
          icon: "Phone" as const,
        },
        {
          id: "conv-3",
          name: "James Liu",
          channel: "FUB sync",
          summary: "Updated lead stage to qualified",
          time: "1h ago",
          tone: "neutral" as const,
          icon: "Check" as const,
        },
        {
          id: "conv-4",
          name: "Lisa Park",
          channel: "Task",
          summary: "Created verification task for listing",
          time: "2h ago",
          tone: "warm" as const,
          icon: "CheckCircle" as const,
        },
      ],
      listingHighlights: [
        {
          id: "listing-1",
          price: "$1,250,000",
          address: "415 Park Ave, San Francisco",
          badge: "Featured",
          meta: "4bd / 3ba",
          note: "Hot market, ready to show",
          tone: "hot" as const,
        },
        {
          id: "listing-2",
          price: "$895,000",
          address: "782 Maple Street, Oakland",
          badge: "Available",
          meta: "3bd / 2ba",
          note: "New listing, high interest",
          tone: "warm" as const,
        },
        {
          id: "listing-3",
          price: "$1,450,000",
          address: "520 California St, SF",
          badge: "Pending",
          meta: "5bd / 3.5ba",
          note: "Buyer under contract",
          tone: "neutral" as const,
        },
      ],
      dayMoments: [
        {
          id: "moment-1",
          time: "2:00 PM",
          title: "Show: 415 Park Ave",
          detail: "Sarah Chen showing",
          tone: "qualified" as const,
        },
        {
          id: "moment-2",
          time: "3:30 PM",
          title: "Follow-up call",
          detail: "Marcus Johnson callback",
          tone: "hot" as const,
        },
        {
          id: "moment-3",
          time: "5:00 PM",
          title: "Team sync",
          detail: "Weekly debrief with team",
          tone: "neutral" as const,
        },
      ],
      briefItems: [
        {
          id: "brief-1",
          label: "Instagram connected",
          detail: "2 accounts active, 14 new DMs today",
          tone: "qualified" as const,
          icon: "InstagramLogo" as const,
        },
        {
          id: "brief-2",
          label: "Voice ready",
          detail: "Retell AI active, 8 calls queued",
          tone: "hot" as const,
          icon: "Phone" as const,
        },
        {
          id: "brief-3",
          label: "FUB sync",
          detail: "Last sync 4m ago, 2 updates pending",
          tone: "neutral" as const,
          icon: "Sync" as const,
        },
        {
          id: "brief-4",
          label: "Nurture drafts",
          detail: "3 sequences ready to send",
          tone: "warm" as const,
          icon: "PencilSimple" as const,
        },
      ],
      teamMembers: [
        {
          initials: "JS",
          name: "Jordan Smith",
          role: "Owner",
          load: "6 tasks",
          status: "online" as const,
        },
        {
          initials: "MC",
          name: "Mia Chen",
          role: "Agent",
          load: "3 tasks",
          status: "reviewing" as const,
        },
        {
          initials: "ES",
          name: "Evan Stone",
          role: "Manager",
          load: "8 tasks",
          status: "online" as const,
        },
        {
          initials: "JD",
          name: "Jamie Davis",
          role: "Agent",
          load: "2 tasks",
          status: "online" as const,
        },
        {
          initials: "LP",
          name: "Lauren Park",
          role: "Agent",
          load: "5 tasks",
          status: "reviewing" as const,
        },
        {
          initials: "RK",
          name: "Riley Kim",
          role: "Agent",
          load: "4 tasks",
          status: "online" as const,
        },
      ],
      homeNarrative: "Your desk is humming. Two qualified leads, ready to hand off. Instagram brought in three fresh conversations.",
      inventoryLink: {
        title: "All listings",
        detail: "12 active in market, 3 ready to send",
        primaryAction: "View all",
        secondaryAction: "Import new",
      },
    };

    return NextResponse.json(homeData);
  } catch (error) {
    console.error("GET /api/home error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
