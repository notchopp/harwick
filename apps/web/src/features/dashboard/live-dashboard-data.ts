import { AtSign, House, MessageSquareText, PhoneCall } from "lucide-react";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { Lead, Metric, PipelineStage } from "./dashboard-data";

type LeadQueueRow = {
  id: string;
  full_name: string | null;
  instagram_username: string | null;
  source_channel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | "call" | "sms" | "manual" | "csv_import" | "public_listing_chat";
  status: "new" | "engaged" | "qualified" | "hot" | "assigned" | "nurture" | "appointment_booked" | "active_client" | "closed_won" | "closed_lost" | "archived";
  score: number;
  lead_type: "buyer" | "seller" | "renter" | "investor" | "unknown";
  target_area: string | null;
  timeline: string | null;
  assigned_agent_id: string | null;
};

function mapStatus(status: LeadQueueRow["status"]): Lead["status"] {
  if (status === "hot") return "hot";
  if (status === "qualified" || status === "assigned") return "qualified";
  if (status === "nurture" || status === "engaged") return "warm";
  return "syncing";
}

function channelLabel(channel: LeadQueueRow["source_channel"]) {
  switch (channel) {
    case "public_listing_chat": return { label: "Listing chat", icon: House };
    case "instagram_dm": return { label: "Instagram DM", icon: AtSign };
    case "instagram_comment": return { label: "Comment", icon: MessageSquareText };
    case "facebook_dm": return { label: "Facebook DM", icon: AtSign };
    case "facebook_comment": return { label: "FB Comment", icon: MessageSquareText };
    case "call": return { label: "Retell call", icon: PhoneCall };
    case "sms": return { label: "SMS", icon: MessageSquareText };
    case "manual": return { label: "Manual", icon: MessageSquareText };
    case "csv_import": return { label: "Import", icon: MessageSquareText };
    default: return { label: channel, icon: MessageSquareText };
  }
}

export async function loadDashboardData(supabase: RealtyOpsSupabaseClient) {
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id,full_name,instagram_username,source_channel,status,score,lead_type,target_area,timeline,assigned_agent_id")
    .order("updated_at", { ascending: false })
    .limit(8)
    .returns<LeadQueueRow[]>();

  const rows = leadRows ?? [];
  const leads: Lead[] = rows.map((row) => {
    const channel = channelLabel(row.source_channel);
    return {
      name: row.full_name ?? row.instagram_username ?? "Unknown lead",
      channel: channel.label,
      channelIcon: channel.icon,
      intent: row.lead_type === "unknown" ? "needs qualification" : row.lead_type,
      status: mapStatus(row.status),
      score: row.score,
      assignee: row.assigned_agent_id === null ? "Queue" : "Assigned",
      sla: row.status === "hot" ? "now" : row.status,
      summary: [row.target_area, row.timeline].filter(Boolean).join(" | ") || "Needs intake details.",
    };
  });

  const hotCount = rows.filter((row) => row.status === "hot").length;
  const qualifiedCount = rows.filter((row) => ["qualified", "assigned"].includes(row.status)).length;
  const metrics: Metric[] = [
    { label: "Qualified response", value: rows.length > 0 ? "live" : "idle", note: "north-star metric", tone: "qualified" },
    { label: "New inbound", value: String(rows.length), note: "latest leads", tone: "neutral" },
    { label: "Hot leads", value: String(hotCount), note: "needs human handoff", tone: "hot" },
    { label: "CRM sync", value: "queued", note: "Follow Up Boss", tone: "syncing" },
  ];
  const pipelineStages: PipelineStage[] = [
    { label: "Captured", count: rows.filter((row) => row.status === "new").length, detail: "waiting on qualification" },
    { label: "Qualified", count: qualifiedCount, detail: "score and intent confirmed" },
    { label: "Assigned", count: rows.filter((row) => row.status === "assigned").length, detail: "agent accepted handoff" },
    { label: "Nurture", count: rows.filter((row) => row.status === "nurture" || row.status === "engaged").length, detail: "follow-up running" },
  ];

  return { leads, metrics, pipelineStages };
}
