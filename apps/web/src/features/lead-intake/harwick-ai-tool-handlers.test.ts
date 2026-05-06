import { describe, expect, it, vi } from "vitest";
import type { NormalizedLeadEvent } from "@realty-ops/core";
import type { GoogleCalendarClient, HarwickAiToolHandlers } from "@realty-ops/integrations";
import type { ConversationAutomationRepository } from "../../lib/supabase/conversation-automation";
import type { ConversationMessageRepository } from "../../lib/supabase/conversation-messages";
import type { LeadEventPersistenceRepository } from "../../lib/supabase/lead-events";
import type { LeadRow } from "../../lib/supabase/leads";
import { encryptCredential } from "../../lib/credentials";
import type {
  ActiveMemberCalendarConnection,
  MemberCalendarConnectionRepository,
} from "../../lib/supabase/member-calendar-connections";
import type { MemberRoutingProfileRepository } from "../../lib/supabase/member-routing-profiles";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { TablesInsert } from "../../lib/supabase/database.types";
import {
  createHarwickAiToolHandlers,
  type HarwickAiToolHandlerDependencies,
} from "./harwick-ai-tool-handlers";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";

function createInsertSupabase() {
  const single = vi.fn(() => ({ data: { id: "00000000-0000-0000-0000-000000000003" }, error: null }));
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  const from = vi.fn(() => ({ insert }));
  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    insert,
    select,
    single,
  };
}

function createWorkflowJobUpsertSupabase() {
  const upserts: Array<{
    row: TablesInsert<"workflow_jobs">;
    options: { onConflict: string };
  }> = [];
  const upsert = vi.fn((row: TablesInsert<"workflow_jobs">, options: { onConflict: string }) => {
    upserts.push({ row, options });
    return { error: null };
  });
  const from = vi.fn(() => ({ upsert }));
  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    upsert,
    upserts,
  };
}

function createRouteLeadSupabase() {
  const routingDecisionInserts: Array<TablesInsert<"harwick_routing_decisions">> = [];
  const leadUpdates: Array<Partial<LeadRow>> = [];
  const auditInserts: Array<TablesInsert<"audit_logs">> = [];
  const sourceOwnerMemberId = "00000000-0000-0000-0000-000000000020";
  const members = [
    {
      id: "00000000-0000-0000-0000-000000000020",
      display_name: "Owner",
      role: "owner",
    },
    {
      id: "00000000-0000-0000-0000-000000000009",
      display_name: "Noah",
      role: "agent",
    },
  ];
  const assignedLeads = [
    {
      assigned_agent_id: "00000000-0000-0000-0000-000000000009",
      status: "assigned",
    },
    {
      assigned_agent_id: "00000000-0000-0000-0000-000000000009",
      status: "hot",
    },
  ];
  const calendarConnections = [
    {
      member_id: "00000000-0000-0000-0000-000000000009",
      showing_mode: "request_approve",
    },
  ];
  const membersSelect = {
    eq: vi.fn(() => membersSelect),
    returns: vi.fn(() => Promise.resolve({ data: members, error: null })),
  };
  const leadsSelect = {
    eq: vi.fn(() => leadsSelect),
    not: vi.fn(() => leadsSelect),
    returns: vi.fn(() => Promise.resolve({ data: assignedLeads, error: null })),
  };
  const calendarConnectionsSelect = {
    eq: vi.fn(() => calendarConnectionsSelect),
    returns: vi.fn(() => Promise.resolve({ data: calendarConnections, error: null })),
  };
  const leadsUpdate = {
    error: null,
    eq: vi.fn(() => leadsUpdate),
  };
  const integrationAccountSelect = {
    eq: vi.fn(() => integrationAccountSelect),
    contains: vi.fn(() => integrationAccountSelect),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: { owner_member_id: sourceOwnerMemberId },
      error: null,
    })),
  };
  const routingDecisionSingle = vi.fn(() => Promise.resolve({
    data: { id: "00000000-0000-0000-0000-000000000030" },
    error: null,
  }));
  const routingDecisionInsert = vi.fn((row: TablesInsert<"harwick_routing_decisions">) => {
    routingDecisionInserts.push(row);
    return {
      select: vi.fn(() => ({
        single: routingDecisionSingle,
      })),
    };
  });
  const auditInsert = vi.fn((rows: Array<TablesInsert<"audit_logs">>) => {
    auditInserts.push(...rows);
    return { error: null };
  });
  const from = vi.fn((table: string) => {
    if (table === "workspace_members") {
      return {
        select: vi.fn(() => membersSelect),
      };
    }
    if (table === "leads") {
      return {
        select: vi.fn(() => leadsSelect),
        update: vi.fn((row: Partial<LeadRow>) => {
          leadUpdates.push(row);
          return leadsUpdate;
        }),
      };
    }
    if (table === "harwick_routing_decisions") {
      return {
        insert: routingDecisionInsert,
      };
    }
    if (table === "workspace_member_calendar_connections") {
      return {
        select: vi.fn(() => calendarConnectionsSelect),
      };
    }
    if (table === "integration_accounts") {
      return {
        select: vi.fn(() => integrationAccountSelect),
      };
    }
    if (table === "audit_logs") {
      return {
        insert: auditInsert,
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    routingDecisionInserts,
    leadUpdates,
    auditInserts,
  };
}

function createHandlers(
  supabase: RealtyOpsSupabaseClient,
  overrides: {
    lead?: LeadRow | null;
    memberRoutingRepository?: MemberRoutingProfileRepository;
    calendarConnectionRepository?: MemberCalendarConnectionRepository;
    calendarClient?: Pick<GoogleCalendarClient, "queryFreeBusy"> & Partial<Pick<GoogleCalendarClient, "refreshAccessToken">>;
    googleCalendarOAuth?: {
      clientId: string;
      clientSecret: string;
    };
    now?: () => Date;
  } = {},
): HarwickAiToolHandlers {
  const deps: HarwickAiToolHandlerDependencies = {
    supabase,
    context: {
      workspaceId,
      leadId,
      leadEventId: null,
      event: {
        workspaceId,
        provider: "meta",
        providerEventId: "event-1",
        providerAccountId: "ig-account-1",
        providerUserId: "ig-user-1",
        sourceChannel: "instagram_dm",
        eventType: "message_received",
        text: "Looking in Katy",
        occurredAt: "2026-05-05T12:00:00.000Z",
        sourcePostId: null,
        sourceCommentId: null,
        instagramUsername: null,
        phone: null,
      } as unknown as NormalizedLeadEvent,
      lead: overrides.lead ?? null,
      channel: "instagram_dm",
      providerAccountId: "ig-account-1",
      recipientUserId: "ig-user-1",
      sourcePostId: null,
      sourceCommentId: null,
      automationMode: "ai_on",
      agentTrajectoryId: "00000000-0000-0000-0000-000000000004",
      agentStepId: "00000000-0000-0000-0000-000000000005",
    },
    conversationMessageRepository: {} as ConversationMessageRepository,
    conversationAutomationRepository: {} as ConversationAutomationRepository,
    leadEventRepository: {} as LeadEventPersistenceRepository,
    memberRoutingRepository: overrides.memberRoutingRepository ?? {} as MemberRoutingProfileRepository,
    credentialSecret: "test-secret",
    ...(overrides.calendarConnectionRepository === undefined
      ? {}
      : { calendarConnectionRepository: overrides.calendarConnectionRepository }),
    ...(overrides.calendarClient === undefined ? {} : { calendarClient: overrides.calendarClient }),
    ...(overrides.googleCalendarOAuth === undefined ? {} : { googleCalendarOAuth: overrides.googleCalendarOAuth }),
    ...(overrides.now === undefined ? {} : { now: overrides.now }),
  };
  return createHarwickAiToolHandlers(deps);
}

describe("createHarwickAiToolHandlers", () => {
  it("queues durable subagent tasks from dispatch_subagent tool calls", async () => {
    const supabase = createInsertSupabase();
    const handlers = createHandlers(supabase.client);

    await expect(handlers.dispatch_subagent?.({
      tool: "dispatch_subagent",
      reason: "research similar routing wins",
      requiresApproval: false,
      payload: {
        subagentType: "research",
        title: "Research Katy luxury routing",
        instructions: "Find recent positive routing examples for high-budget Katy buyers.",
        priority: "high",
      },
    })).resolves.toEqual({
      queued: true,
      taskId: "00000000-0000-0000-0000-000000000003",
      subagentType: "research",
      title: "Research Katy luxury routing",
    });

    expect(supabase.from).toHaveBeenCalledWith("harwick_subagent_tasks");
    expect(supabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      workspace_id: workspaceId,
      lead_id: leadId,
      subagent_type: "research",
      priority: "high",
      title: "Research Katy luxury routing",
      instructions: "Find recent positive routing examples for high-budget Katy buyers.",
    }));
  });

  it("upserts FUB sync jobs with the worker contract and a stable idempotency key", async () => {
    const supabase = createWorkflowJobUpsertSupabase();
    const handlers = createHandlers(supabase.client);

    const first = await handlers.sync_follow_up_boss?.({
      tool: "sync_follow_up_boss",
      reason: "qualified buyer is ready for CRM sync",
      requiresApproval: false,
      payload: {},
    });
    const second = await handlers.sync_follow_up_boss?.({
      tool: "sync_follow_up_boss",
      reason: "model retried the same CRM sync",
      requiresApproval: false,
      payload: {},
    });

    expect(first).toEqual({
      enqueued: true,
      jobType: "fub_sync",
      idempotencyKey: `fub_sync:${leadId}`,
    });
    expect(second).toEqual(first);
    expect(supabase.from).toHaveBeenCalledWith("workflow_jobs");
    expect(supabase.upserts).toHaveLength(2);
    for (const upsert of supabase.upserts) {
      expect(upsert.options).toEqual({ onConflict: "workspace_id,idempotency_key" });
      expect(upsert.row).toMatchObject({
        workspace_id: workspaceId,
        lead_id: leadId,
        job_type: "fub_sync",
        idempotency_key: `fub_sync:${leadId}`,
        payload: {
          jobType: "fub_sync",
          workspaceId,
          leadId,
          qualifiedOnly: true,
        },
      });
    }
  });

  it("routes leads with real member names, active counts, routing decision persistence, and audit", async () => {
    const supabase = createRouteLeadSupabase();
    const assignedAgentId = "00000000-0000-0000-0000-000000000009";
    const memberRoutingRepository = {
      listProfilesForWorkspace: vi.fn(() => Promise.resolve([{
        id: "00000000-0000-0000-0000-000000000040",
        workspace_id: workspaceId,
        member_id: assignedAgentId,
        role_label: "Katy buyer specialist",
        areas: ["Katy"],
        property_types: ["single_family", "new_construction"],
        lead_types: ["buyer"],
        budget_min: 250_000,
        budget_max: 900_000,
        max_active_leads: 8,
        accepts_new_leads: true,
        notification_preference: "app",
        created_at: "2026-05-06T00:00:00.000Z",
        updated_at: "2026-05-06T00:00:00.000Z",
      }])),
    } as unknown as MemberRoutingProfileRepository;
    const handlers = createHandlers(supabase.client, {
      lead: {
        id: leadId,
        workspace_id: workspaceId,
        assigned_agent_id: null,
        lead_type: "buyer",
        target_area: "Katy",
        budget_min: 450_000,
        budget_max: 550_000,
        timeline: "60 days",
        financing_status: "preapproved",
        score: 82,
      } as LeadRow,
      memberRoutingRepository,
    });

    const result = await handlers.route_lead?.({
      tool: "route_lead",
      reason: "qualified Katy buyer needs assignment",
      requiresApproval: false,
      payload: {},
    });

    expect(result).toEqual(expect.objectContaining({
      routed: true,
      routingDecisionId: "00000000-0000-0000-0000-000000000030",
      assignedMemberId: assignedAgentId,
      assignedDisplayName: "Noah",
    }));
    expect(supabase.routingDecisionInserts).toMatchObject([{
      workspace_id: workspaceId,
      lead_id: leadId,
      suggested_member_id: assignedAgentId,
      final_member_id: assignedAgentId,
      status: "assigned",
      created_by_actor_type: "ai",
    }]);
    const routingEvidence = supabase.routingDecisionInserts[0]?.evidence as {
      sourceOwnerMemberId: string;
      calendarSignals: Record<string, string>;
      reasons: string[];
    };
    expect(routingEvidence.sourceOwnerMemberId).toBe("00000000-0000-0000-0000-000000000020");
    expect(routingEvidence.calendarSignals).toEqual({
      [assignedAgentId]: "request_approve",
    });
    expect(routingEvidence.reasons).toContain("calendar connected for request + approve showings");
    expect(supabase.leadUpdates).toMatchObject([{
      assigned_agent_id: assignedAgentId,
      status: "assigned",
    }]);
    expect(supabase.auditInserts).toMatchObject([{
      workspace_id: workspaceId,
      actor_type: "ai",
      action: "lead.assigned",
      resource_type: "lead",
      resource_id: leadId,
    }]);
  });

  it("checks connected Google Calendar availability before returning showing windows", async () => {
    const supabase = createInsertSupabase();
    const assignedAgentId = "00000000-0000-0000-0000-000000000009";
    const memberRoutingRepository = {
      findProfileByMemberId: vi.fn(() => Promise.resolve({
        role_label: "Noah",
      })),
    } as unknown as MemberRoutingProfileRepository;
    const activeConnection: ActiveMemberCalendarConnection = {
      id: "00000000-0000-0000-0000-000000000010",
      workspaceId,
      memberId: assignedAgentId,
      provider: "google",
      providerAccountEmail: "noah@example.com",
      calendarId: "primary",
      status: "connected",
      showingMode: "request_approve",
      timezone: "America/New_York",
      encryptedCredentialRef: encryptCredential({
        version: "google_calendar_oauth_v1",
        accessToken: "google-access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        scope: "https://www.googleapis.com/auth/calendar.freebusy",
        expiresAt: "2026-05-06T13:00:00.000Z",
      }, "test-secret"),
      lastSyncedAt: null,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    };
    const calendarConnectionRepository = {
      findActiveConnection: vi.fn(() => Promise.resolve(activeConnection)),
      updateEncryptedCredential: vi.fn(() => Promise.resolve()),
    } satisfies MemberCalendarConnectionRepository;
    const calendarClient = {
      queryFreeBusy: vi.fn(() => Promise.resolve({
        calendars: [{
          calendarId: "primary",
          busy: [{
            start: "2026-05-07T14:00:00.000Z",
            end: "2026-05-07T14:30:00.000Z",
          }],
        }],
      })),
    } satisfies Pick<GoogleCalendarClient, "queryFreeBusy">;
    const handlers = createHandlers(supabase.client, {
      lead: { assigned_agent_id: assignedAgentId } as LeadRow,
      memberRoutingRepository,
      calendarConnectionRepository,
      calendarClient,
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    const calendarResult = await handlers.check_calendar?.({
      tool: "check_calendar",
      reason: "lead asked for a showing",
      requiresApproval: false,
      payload: {
        listing: "123 Main St",
      },
    });
    expect(calendarResult).toEqual(expect.objectContaining({
      assignedAgentId,
      agentName: "Noah",
      requestedListing: "123 Main St",
      source: "google_calendar",
      calendarId: "primary",
      showingMode: "request_approve",
      synthesized: false,
      busyWindows: [{
        start: "2026-05-07T14:00:00.000Z",
        end: "2026-05-07T14:30:00.000Z",
      }],
    }));
    expect(Array.isArray(calendarResult?.["availableWindows"])).toBe(true);

    expect(calendarConnectionRepository.findActiveConnection).toHaveBeenCalledWith({
      workspaceId,
      memberId: assignedAgentId,
    });
    expect(calendarClient.queryFreeBusy).toHaveBeenCalledWith({
      accessToken: "google-access-token",
      calendarIds: ["primary"],
      timeMin: "2026-05-06T12:00:00.000Z",
      timeMax: "2026-05-20T12:00:00.000Z",
      timeZone: "America/New_York",
    });
  });

  it("falls back to synthesized windows when no calendar is connected", async () => {
    const supabase = createInsertSupabase();
    const assignedAgentId = "00000000-0000-0000-0000-000000000009";
    const handlers = createHandlers(supabase.client, {
      lead: { assigned_agent_id: assignedAgentId } as LeadRow,
      memberRoutingRepository: {
        findProfileByMemberId: vi.fn(() => Promise.resolve(null)),
      } as unknown as MemberRoutingProfileRepository,
      calendarConnectionRepository: {
        findActiveConnection: vi.fn(() => Promise.resolve(null)),
        updateEncryptedCredential: vi.fn(() => Promise.resolve()),
      },
      calendarClient: {
        queryFreeBusy: vi.fn(() => Promise.resolve({ calendars: [] })),
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    const fallbackResult = await handlers.check_calendar?.({
      tool: "check_calendar",
      reason: "lead asked for a showing",
      requiresApproval: false,
      payload: {},
    });
    expect(fallbackResult).toEqual(expect.objectContaining({
      assignedAgentId,
      synthesized: true,
    }));
    expect(Array.isArray(fallbackResult?.["availableWindows"])).toBe(true);
  });

  it("refreshes expiring Google Calendar tokens before checking availability", async () => {
    const supabase = createInsertSupabase();
    const assignedAgentId = "00000000-0000-0000-0000-000000000009";
    const activeConnection: ActiveMemberCalendarConnection = {
      id: "00000000-0000-0000-0000-000000000010",
      workspaceId,
      memberId: assignedAgentId,
      provider: "google",
      providerAccountEmail: "noah@example.com",
      calendarId: "primary",
      status: "connected",
      showingMode: "request_approve",
      timezone: "America/New_York",
      encryptedCredentialRef: encryptCredential({
        version: "google_calendar_oauth_v1",
        accessToken: "stale-access-token",
        refreshToken: "refresh-token",
        tokenType: "Bearer",
        scope: "https://www.googleapis.com/auth/calendar.freebusy",
        expiresAt: "2026-05-06T12:01:00.000Z",
      }, "test-secret"),
      lastSyncedAt: null,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    };
    const calendarConnectionRepository = {
      findActiveConnection: vi.fn(() => Promise.resolve(activeConnection)),
      updateEncryptedCredential: vi.fn(() => Promise.resolve()),
    } satisfies MemberCalendarConnectionRepository;
    const calendarClient = {
      refreshAccessToken: vi.fn(() => Promise.resolve({
        access_token: "fresh-access-token",
        expires_in: 3600,
        token_type: "Bearer",
        scope: "https://www.googleapis.com/auth/calendar.freebusy",
      })),
      queryFreeBusy: vi.fn(() => Promise.resolve({
        calendars: [{
          calendarId: "primary",
          busy: [],
        }],
      })),
    } satisfies Pick<GoogleCalendarClient, "queryFreeBusy" | "refreshAccessToken">;
    const handlers = createHandlers(supabase.client, {
      lead: { assigned_agent_id: assignedAgentId } as LeadRow,
      memberRoutingRepository: {
        findProfileByMemberId: vi.fn(() => Promise.resolve(null)),
      } as unknown as MemberRoutingProfileRepository,
      calendarConnectionRepository,
      calendarClient,
      googleCalendarOAuth: {
        clientId: "google-client-id",
        clientSecret: "google-client-secret",
      },
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    });

    const result = await handlers.check_calendar?.({
      tool: "check_calendar",
      reason: "lead asked for a showing",
      requiresApproval: false,
      payload: {},
    });

    expect(result).toEqual(expect.objectContaining({
      synthesized: false,
    }));
    expect(calendarClient.refreshAccessToken).toHaveBeenCalledWith({
      clientId: "google-client-id",
      clientSecret: "google-client-secret",
      refreshToken: "refresh-token",
    });
    expect(calendarClient.queryFreeBusy).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "fresh-access-token",
    }));
    expect(calendarConnectionRepository.updateEncryptedCredential).toHaveBeenCalledWith({
      connectionId: activeConnection.id,
      encryptedCredentialRef: expect.any(String) as string,
      syncedAt: "2026-05-06T12:00:00.000Z",
    });
  });
});
