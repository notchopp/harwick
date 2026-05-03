import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

type LiveContextPanelProps = {
  lead: {
    id: string;
    full_name: string | null;
    source_channel: string;
    score: number;
    status: string;
    lead_type: string;
    intent: string;
    budget_min: number | null;
    budget_max: number | null;
    timeline: string | null;
    assigned_agent_id: string | null;
    created_at: string;
    [key: string]: unknown;
  };
};

export function LiveContextPanel({ lead }: LiveContextPanelProps) {
  const statusTone = (status: string): "neutral" | "hot" | "warm" | "qualified" | "syncing" => {
    switch (status) {
      case "hot":
        return "hot";
      case "qualified":
        return "qualified";
      case "engaged":
      case "assigned":
        return "warm";
      case "nurture":
        return "syncing";
      default:
        return "neutral";
    }
  };

  const intentTone = (intent: string): "neutral" | "hot" | "warm" | "qualified" | "syncing" => {
    switch (intent) {
      case "high":
        return "hot";
      case "medium":
        return "warm";
      case "low":
        return "neutral";
      default:
        return "neutral";
    }
  };

  const budgetDisplay = lead.budget_min || lead.budget_max
    ? `$${lead.budget_min?.toLocaleString() || "?"}-${lead.budget_max?.toLocaleString() || "?"}`
    : "Not specified";

  return (
    <div className="flex flex-col gap-4 border-l border-border p-4 text-sm">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-foreground">{lead.full_name || "Unknown Lead"}</h3>
        <p className="text-xs text-muted">{lead.id}</p>
      </div>

      {/* Status & Scoring */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Status</span>
          <Badge tone={statusTone(lead.status)}>
            {lead.status}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Score</span>
          <div className="flex items-center gap-2">
            <div className="w-16 bg-gray-200 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-yellow-400 to-green-500 h-2 rounded-full"
                style={{ width: `${Math.min(lead.score, 100)}%` }}
              />
            </div>
            <span className="text-xs font-semibold">{lead.score}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted">Intent</span>
          <Badge tone={intentTone(lead.intent)}>
            {lead.intent}
          </Badge>
        </div>
      </div>

      {/* Budget & Timeline */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <div className="flex justify-between">
          <span className="text-xs font-medium text-muted">Budget</span>
          <span className="text-xs text-foreground">{budgetDisplay}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-xs font-medium text-muted">Timeline</span>
          <span className="text-xs text-foreground">{lead.timeline || "Not specified"}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-xs font-medium text-muted">Lead Type</span>
          <span className="capitalize text-xs text-foreground">{lead.lead_type}</span>
        </div>
      </div>

      {/* Source & Assignment */}
      <div className="flex flex-col gap-2 border-t border-border pt-2">
        <div className="flex justify-between">
          <span className="text-xs font-medium text-muted">Source</span>
          <span className="capitalize text-xs text-foreground">{lead.source_channel}</span>
        </div>

        <div className="flex justify-between">
          <span className="text-xs font-medium text-muted">Assigned</span>
          <span className="text-xs text-foreground">
            {lead.assigned_agent_id ? "Yes" : "Unassigned"}
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-xs font-medium text-muted">Created</span>
          <span className="text-xs text-foreground">
            {format(new Date(lead.created_at), "MMM d, h:mm a")}
          </span>
        </div>
      </div>
    </div>
  );
}
