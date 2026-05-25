import { z } from "zod";

import { defineHarwickTool, type HarwickToolDefinition, type HarwickToolDeps } from "../registry";

/**
 * Briefings — Harwick acts like a chief of staff by surfacing daily rhythms.
 *
 *   - generate_morning_briefing  Today-ahead snapshot: hot leads, routing,
 *                                team load, calendar pressure
 *   - generate_end_of_day        What shipped + tomorrow's top priorities
 *   - generate_handoff_brief     Operator-OOO bundle: outstanding items
 *                                packaged for delegation
 *
 * These tools gather structured data; the model writes the narrative.
 */

async function gatherHotLeads(deps: HarwickToolDeps, limit: number) {
  const { data } = await deps.supabase
    .from("leads")
    .select("id, full_name, status, score, target_area, last_message_at, assigned_agent_id, qualification_summary")
    .eq("workspace_id", deps.workspaceId)
    .in("status", ["hot", "qualified", "appointment_booked", "engaged"])
    .gte("score", 60)
    .order("score", { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

async function gatherUnassignedLeads(deps: HarwickToolDeps, limit: number) {
  const { data } = await deps.supabase
    .from("leads")
    .select("id, full_name, status, score, target_area, last_message_at, source_channel")
    .eq("workspace_id", deps.workspaceId)
    .is("assigned_agent_id", null)
    .not("status", "in", "(closed_won,closed_lost,archived)")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return data ?? [];
}

async function gatherRoutingDecisions(deps: HarwickToolDeps, limit: number) {
  const { data } = await deps.supabase
    .from("harwick_routing_decisions")
    .select("id, lead_id, recommended_member_id, status, summary, reason, created_at")
    .eq("workspace_id", deps.workspaceId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function gatherTeamLoad(deps: HarwickToolDeps) {
  const { data: members } = await deps.supabase
    .from("workspace_members")
    .select("id, display_name, role, is_active")
    .eq("workspace_id", deps.workspaceId)
    .eq("is_active", true);

  if (members === null) return [];

  const counts = await Promise.all(
    members.map(async (member) => {
      const { count } = await deps.supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", deps.workspaceId)
        .eq("assigned_agent_id", member.id)
        .not("status", "in", "(closed_won,closed_lost,archived)");
      return {
        memberId: member.id,
        name: member.display_name,
        role: member.role,
        activeLeadCount: count ?? 0,
      };
    }),
  );
  return counts;
}

async function gatherSubagentResults(deps: HarwickToolDeps, sinceIso: string) {
  const { data } = await deps.supabase
    .from("harwick_subagent_tasks")
    .select("id, subagent_type, status, title, instructions, result, updated_at")
    .eq("workspace_id", deps.workspaceId)
    .gte("updated_at", sinceIso)
    .order("updated_at", { ascending: false })
    .limit(10);
  return data ?? [];
}

export const generateMorningBriefingTool = defineHarwickTool({
  name: "generate_morning_briefing",
  description: "Gather the today-ahead state of the workspace so you can write the morning briefing. Returns hot leads (score ≥ 60), unassigned leads waiting, pending routing decisions, team load by member, and overnight subagent results. Use this when the operator opens Harwick first thing, asks 'what's the day looking like?', or as the body of a scheduled morning loop.",
  scopes: ["operator_chat", "scheduled_loop"],
  approval: "internal_safe",
  inputSchema: z.object({
    includeOvernightAgenticResults: z.boolean().default(true),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const [hotLeads, unassigned, routing, teamLoad, overnight] = await Promise.all([
      gatherHotLeads(deps, 8),
      gatherUnassignedLeads(deps, 5),
      gatherRoutingDecisions(deps, 5),
      gatherTeamLoad(deps),
      input.includeOvernightAgenticResults
        ? gatherSubagentResults(deps, new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString())
        : Promise.resolve([]),
    ]);

    return {
      kind: "morning_briefing",
      generatedAt: new Date().toISOString(),
      hotLeadCount: hotLeads.length,
      hotLeads,
      unassignedLeadCount: unassigned.length,
      unassigned,
      routingDeskCount: routing.length,
      routingDesk: routing,
      teamLoad,
      overnightSubagentResults: overnight,
    };
  },
});

export const generateEndOfDayTool = defineHarwickTool({
  name: "generate_end_of_day",
  description: "Gather what happened today + what's pending for tomorrow. Returns stage changes (audit_logs), subagent results, and tomorrow's open lead tasks. Use this for an end-of-day wrap or a scheduled evening loop.",
  scopes: ["operator_chat", "scheduled_loop"],
  approval: "internal_safe",
  inputSchema: z.object({
    sinceHoursAgo: z.number().int().min(1).max(48).default(12),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const sinceIso = new Date(Date.now() - input.sinceHoursAgo * 60 * 60 * 1000).toISOString();
    const tomorrowIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const [stageChanges, subagentResults, openTasks] = await Promise.all([
      deps.supabase
        .from("audit_logs")
        .select("id, action, resource_id, metadata, created_at")
        .eq("workspace_id", deps.workspaceId)
        .in("action", ["lead_stage_change", "lead_marked_lost", "lead_note_recorded"])
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(20),
      gatherSubagentResults(deps, sinceIso),
      deps.supabase
        .from("lead_tasks")
        .select("id, lead_id, title, due_at, priority, task_type")
        .eq("workspace_id", deps.workspaceId)
        .eq("status", "open")
        .lte("due_at", tomorrowIso)
        .order("due_at", { ascending: true })
        .limit(15),
    ]);

    return {
      kind: "end_of_day",
      generatedAt: new Date().toISOString(),
      sinceIso,
      stageChanges: stageChanges.data ?? [],
      subagentResults,
      tomorrowOpenTasks: openTasks.data ?? [],
    };
  },
});

export const generateHandoffBriefTool = defineHarwickTool({
  name: "generate_handoff_brief",
  description: "Bundle the workspace state for someone covering the operator. Use when the operator says they're going OOO, leaving for the day, or handing off to a teammate. Returns hot leads + open tasks + team online status.",
  scopes: ["operator_chat"],
  approval: "internal_safe",
  inputSchema: z.object({
    coverageNote: z.string().max(800).optional(),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const [hotLeads, unassigned, routing, teamLoad, openTasks] = await Promise.all([
      gatherHotLeads(deps, 10),
      gatherUnassignedLeads(deps, 10),
      gatherRoutingDecisions(deps, 10),
      gatherTeamLoad(deps),
      deps.supabase
        .from("lead_tasks")
        .select("id, lead_id, title, due_at, priority, assigned_member_id, task_type")
        .eq("workspace_id", deps.workspaceId)
        .eq("status", "open")
        .order("due_at", { ascending: true, nullsFirst: false })
        .limit(25),
    ]);

    return {
      kind: "handoff_brief",
      generatedAt: new Date().toISOString(),
      coverageNote: input.coverageNote ?? null,
      hotLeads,
      unassignedLeads: unassigned,
      pendingRoutingDecisions: routing,
      teamLoad,
      openTasks: openTasks.data ?? [],
    };
  },
});

export const BRIEFING_TOOLS: HarwickToolDefinition[] = [
  generateMorningBriefingTool,
  generateEndOfDayTool,
  generateHandoffBriefTool,
];
