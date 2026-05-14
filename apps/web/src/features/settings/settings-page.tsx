"use client";

import {
  HarwickLoopListResponseSchema,
  HarwickLoopSchema,
  WorkspaceMemoryReviewListResponseSchema,
  WorkspaceMemoryReviewUpdateResponseSchema,
  type BillingInterval,
  type BillingPlanTier,
  type HarwickLoop,
  type HarwickLoopApprovalMode,
  type HarwickLoopOutputMode,
  type HarwickLoopTriggerType,
  type SubscriptionStatus,
  type WorkspaceMemoryDocument,
  type WorkspaceMemoryReviewStatus,
  type WorkspaceRole,
} from "@realty-ops/core";
import { useEffect, useState } from "react";

import { Button } from "../../components/ui/button";
import { WorkspaceTopbar } from "../../components/workspace-topbar";
import { cn } from "../../lib/utils";
import {
  buildHarwickLoopCreateRequest,
  formatHarwickLoopDate,
  HARWICK_LOOP_EVENT_TYPE_OPTIONS,
  type HarwickLoopSettingsDraft,
} from "./harwick-loop-settings";
import { Switch } from "../../components/ui/switch";
import {
  buildWorkspaceMemoryReviewRequest,
  formatWorkspaceMemoryConfidence,
  formatWorkspaceMemoryDate,
  workspaceMemoryStatusLabel,
} from "./workspace-memory-settings";

function ToggleRow(props: {
  checked: boolean;
  description: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-4 border-b border-border py-3 last:border-b-0 last:pb-0">
      <div className="flex-1">
        <div className="text-[13px] font-medium text-foreground">{props.label}</div>
        <div className="mt-1 text-[11.5px] text-muted-subtle">{props.description}</div>
      </div>
      <Switch checked={props.checked} onCheckedChange={() => props.onToggle()} />
    </div>
  );
}

function SettingsSection(props: { children: React.ReactNode; title: string; danger?: boolean }) {
  return (
    <section
      className={cn(
        "harwick-card px-[18px] py-[18px]",
        props.danger && "border-oxblood-soft",
      )}
    >
      <div className={cn("mb-[14px] font-display text-[15px] font-medium", props.danger && "text-hot")}>
        {props.title}
      </div>
      {props.children}
    </section>
  );
}

function InfoRow(props: { label: string; value: string }) {
  return (
    <div className="mb-[7px] flex gap-2 text-[12.5px] last:mb-0">
      <span className="w-[68px] shrink-0 text-muted-subtle">{props.label}</span>
      <span className="font-medium text-foreground">{props.value}</span>
    </div>
  );
}

type BillingSummary = {
  planTier: BillingPlanTier;
  billingInterval: BillingInterval;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  providerCustomerId: string | null;
} | null;

function planLabel(planTier: BillingPlanTier): string {
  if (planTier === "solo") return "Solo";
  if (planTier === "team") return "Team";
  return "Brokerage";
}

function intervalLabel(interval: BillingInterval): string {
  return interval === "year" ? "annual" : "monthly";
}

function statusLabel(status: SubscriptionStatus): string {
  return status.replace(/_/g, " ");
}

function roleLabel(role: WorkspaceRole): string {
  if (role === "team_lead") return "Team Lead";
  if (role === "lead_manager") return "Lead Manager";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function initialsForName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "WM";
  const first = parts[0]?.charAt(0) ?? "";
  const second = parts.length > 1 ? parts[1]?.charAt(0) ?? "" : parts[0]?.charAt(1) ?? "";
  return `${first}${second}`.toUpperCase();
}

function formatPeriodEnd(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function BillingPanel(props: {
  billing: BillingSummary;
  canManageBilling: boolean;
  workspaceId: string;
}) {
  const [busyAction, setBusyAction] = useState<"portal" | "solo" | "team" | "brokerage" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentPlan = props.billing === null ? "No active plan" : `${planLabel(props.billing.planTier)} / ${intervalLabel(props.billing.billingInterval)}`;
  const currentStatus = props.billing === null ? "not configured" : statusLabel(props.billing.status);

  async function startCheckout(planTier: BillingPlanTier) {
    if (!props.canManageBilling) return;
    setBusyAction(planTier);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planTier, billingInterval: "month" }),
      });
      const body = (await response.json().catch(() => null)) as { checkoutUrl?: string; error?: string } | null;
      if (!response.ok || body?.checkoutUrl === undefined) {
        throw new Error(body?.error ?? "checkout_failed");
      }
      window.location.assign(body.checkoutUrl);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "checkout_failed");
      setBusyAction(null);
    }
  }

  async function openPortal() {
    if (!props.canManageBilling || props.billing?.providerCustomerId === null || props.billing?.providerCustomerId === undefined) {
      return;
    }

    setBusyAction("portal");
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/billing/portal`, {
        method: "POST",
      });
      const body = (await response.json().catch(() => null)) as { portalUrl?: string; error?: string } | null;
      if (!response.ok || body?.portalUrl === undefined) {
        throw new Error(body?.error ?? "portal_failed");
      }
      window.location.assign(body.portalUrl);
    } catch (portalError) {
      setError(portalError instanceof Error ? portalError.message : "portal_failed");
      setBusyAction(null);
    }
  }

  return (
    <div className="rounded-[12px] border border-border bg-surface-muted/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-subtle">Billing</div>
          <div className="mt-1 font-display text-[18px] font-medium text-foreground">{currentPlan}</div>
          <div className="mt-1 text-[11.5px] text-muted">
            {props.billing === null
              ? "Choose a plan to unlock production usage gates."
              : `${currentStatus}${props.billing.cancelAtPeriodEnd ? " / cancels at period end" : ""} / renews ${formatPeriodEnd(props.billing.currentPeriodEnd)}`}
          </div>
        </div>
        <Button
          className="text-[11px]"
          disabled={!props.canManageBilling || props.billing?.providerCustomerId === null || props.billing?.providerCustomerId === undefined || busyAction !== null}
          onClick={() => void openPortal()}
          size="sm"
          type="button"
          variant="outline"
        >
          {busyAction === "portal" ? "Opening..." : "Manage in Stripe"}
        </Button>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {(["solo", "team", "brokerage"] as const).map((planTier) => (
          <Button
            className="justify-center text-[11px]"
            disabled={!props.canManageBilling || busyAction !== null || props.billing?.planTier === planTier}
            key={planTier}
            onClick={() => void startCheckout(planTier)}
            size="sm"
            type="button"
            variant={props.billing?.planTier === planTier ? "secondary" : "outline"}
          >
            {busyAction === planTier ? "Starting..." : props.billing?.planTier === planTier ? `${planLabel(planTier)} active` : `Switch to ${planLabel(planTier)}`}
          </Button>
        ))}
      </div>

      {props.canManageBilling ? null : (
        <div className="mt-3 text-[11.5px] text-muted-subtle">Only owners and admins can manage billing.</div>
      )}
      {error === null ? null : (
        <div className="mt-3 rounded-[10px] border border-oxblood-soft bg-oxblood-soft/30 px-3 py-2 text-[11.5px] text-hot">
          {error}
        </div>
      )}
    </div>
  );
}

const defaultLoopDraft: HarwickLoopSettingsDraft = {
  name: "",
  instruction: "",
  triggerType: "schedule",
  scheduleSpec: "",
  eventType: HARWICK_LOOP_EVENT_TYPE_OPTIONS[0]?.value ?? "",
  approvalMode: "approval_required",
  outputMode: "work_item",
  toolAllowlistText: "",
};

function loopOutputModeLabel(value: HarwickLoopOutputMode): string {
  if (value === "draft") return "draft";
  if (value === "agent_loop") return "agent loop";
  return "work item";
}

function loopApprovalModeLabel(value: HarwickLoopApprovalMode): string {
  if (value === "auto_execute") return "auto execute";
  if (value === "suggest_only") return "suggest only";
  return "approval required";
}

function HarwickLoopsPanel(props: {
  canManageLoops: boolean;
  workspaceId: string;
}) {
  const [loops, setLoops] = useState<HarwickLoop[]>([]);
  const [draft, setDraft] = useState<HarwickLoopSettingsDraft>(defaultLoopDraft);
  const [status, setStatus] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyLoopId, setBusyLoopId] = useState<string | null>(null);

  useEffect(() => {
    const loadLoops = async () => {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch(`/api/workspaces/${props.workspaceId}/harwick-loops`);
        if (!response.ok) {
          throw new Error("loops_load_failed");
        }
        const parsed = HarwickLoopListResponseSchema.parse(await response.json());
        setLoops(parsed.loops);
        setStatus("idle");
      } catch (loopError) {
        console.error("Failed to load Harwick loops:", loopError);
        setStatus("error");
        setError("Could not load Harwick loops.");
      }
    };

    void loadLoops();
  }, [props.workspaceId]);

  async function createLoop() {
    if (!props.canManageLoops || status === "saving") return;

    const request = buildHarwickLoopCreateRequest(draft);
    if (!request.ok) {
      setStatus("error");
      setError(request.error);
      return;
    }

    setStatus("saving");
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/harwick-loops`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.request),
      });
      if (!response.ok) {
        throw new Error("loop_create_failed");
      }
      const created = HarwickLoopSchema.parse(await response.json());
      setLoops((current) => [created, ...current]);
      setDraft(defaultLoopDraft);
      setStatus("saved");
    } catch (loopError) {
      console.error("Failed to create Harwick loop:", loopError);
      setStatus("error");
      setError("Could not save this Harwick loop.");
    }
  }

  async function updateLoopStatus(loop: HarwickLoop, nextStatus: "active" | "paused") {
    if (!props.canManageLoops || busyLoopId !== null) return;

    setBusyLoopId(loop.id);
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/harwick-loops/${loop.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        throw new Error("loop_update_failed");
      }
      const updated = HarwickLoopSchema.parse(await response.json());
      setLoops((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (loopError) {
      console.error("Failed to update Harwick loop:", loopError);
      setStatus("error");
      setError("Could not update this Harwick loop.");
    } finally {
      setBusyLoopId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[12px] border border-border bg-surface-muted/55 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-3">
            <input
              className="harwick-control w-full px-[11px] py-[8px] text-[12.5px]"
              disabled={!props.canManageLoops}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Friday queue review"
              value={draft.name}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="harwick-control px-[10px] py-[8px] text-[12px]"
                disabled={!props.canManageLoops}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  triggerType: event.target.value as HarwickLoopTriggerType,
                }))}
                value={draft.triggerType}
              >
                <option value="schedule">Scheduled</option>
                <option value="event">Event-triggered</option>
              </select>
              {draft.triggerType === "schedule" ? (
                <input
                  className="harwick-control w-full px-[11px] py-[8px] text-[12.5px]"
                  disabled={!props.canManageLoops}
                  onChange={(event) => setDraft((current) => ({ ...current, scheduleSpec: event.target.value }))}
                  placeholder="every Friday 4pm"
                  value={draft.scheduleSpec}
                />
              ) : (
                <select
                  className="harwick-control px-[10px] py-[8px] text-[12px]"
                  disabled={!props.canManageLoops}
                  onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))}
                  value={draft.eventType}
                >
                  {HARWICK_LOOP_EVENT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                className="harwick-control px-[10px] py-[8px] text-[12px]"
                disabled={!props.canManageLoops}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  outputMode: event.target.value as HarwickLoopOutputMode,
                }))}
                value={draft.outputMode}
              >
                <option value="work_item">Work item</option>
                <option value="draft">Draft</option>
                <option value="agent_loop">Agent loop</option>
              </select>
              <select
                className="harwick-control px-[10px] py-[8px] text-[12px]"
                disabled={!props.canManageLoops}
                onChange={(event) => setDraft((current) => ({
                  ...current,
                  approvalMode: event.target.value as HarwickLoopApprovalMode,
                }))}
                value={draft.approvalMode}
              >
                <option value="approval_required">Approval required</option>
                <option value="suggest_only">Suggest only</option>
                <option value="auto_execute">Auto execute</option>
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <textarea
              className="harwick-control min-h-[112px] w-full resize-y px-[12px] py-[10px] text-[12.5px] leading-5"
              disabled={!props.canManageLoops}
              maxLength={4000}
              onChange={(event) => setDraft((current) => ({ ...current, instruction: event.target.value }))}
              placeholder="Review the work queue, identify stale leads, and propose who should follow up next."
              value={draft.instruction}
            />
            <input
              className="harwick-control w-full px-[11px] py-[8px] text-[12.5px]"
              disabled={!props.canManageLoops}
              onChange={(event) => setDraft((current) => ({ ...current, toolAllowlistText: event.target.value }))}
              placeholder="dispatch_subagent, workspace_memory.search"
              value={draft.toolAllowlistText}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11.5px] text-muted-subtle">
            {props.canManageLoops
              ? draft.triggerType === "event"
                ? "Event-triggered loops wake on supported workspace events and still surface reviewable Harwick work before external writes."
                : "Scheduled jobs surface as reviewable Harwick work before external writes."
              : "Only owners, admins, and team leads can manage loops."}
          </div>
          <Button
            className="px-4 text-[11px]"
            disabled={!props.canManageLoops || status === "saving"}
            onClick={() => void createLoop()}
            size="sm"
            type="button"
          >
            {status === "saving" ? "Saving..." : "Create Loop"}
          </Button>
        </div>
        {error === null ? null : (
          <div className="mt-3 rounded-[10px] border border-oxblood-soft bg-oxblood-soft/30 px-3 py-2 text-[11.5px] text-hot">
            {error}
          </div>
        )}
        {status === "saved" ? (
          <div className="mt-3 text-[11.5px] text-qualified">Loop saved</div>
        ) : null}
      </div>

      <div className="divide-y divide-border rounded-[12px] border border-border bg-surface">
        {status === "loading" ? (
          <div className="px-4 py-4 text-[12px] text-muted-subtle">Loading loops...</div>
        ) : loops.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-muted-subtle">No Harwick loops are configured yet.</div>
        ) : loops.map((loop) => (
          <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" key={loop.id}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="truncate text-[13px] font-medium text-foreground">{loop.name}</div>
                <span className={cn(
                  "rounded-full border px-2 py-[2px] text-[10px] uppercase",
                  loop.status === "active"
                    ? "border-qualified/25 bg-qualified-soft text-qualified"
                    : "border-border bg-surface-muted text-muted",
                )}>
                  {loop.status}
                </span>
                <span className="rounded-full border border-border bg-surface-muted px-2 py-[2px] text-[10px] text-muted">
                  {loopOutputModeLabel(loop.outputMode)}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 text-[12px] text-muted">{loop.instruction}</div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-subtle">
                <span>{loop.scheduleSpec ?? loop.eventType ?? "manual"}</span>
                <span>next {formatHarwickLoopDate(loop.nextRunAt)}</span>
                <span>last {loop.lastRunStatus ?? "never run"}</span>
                <span>{loopApprovalModeLabel(loop.approvalMode)}</span>
              </div>
            </div>
            <Button
              className="text-[11px]"
              disabled={!props.canManageLoops || busyLoopId !== null}
              onClick={() => void updateLoopStatus(loop, loop.status === "active" ? "paused" : "active")}
              size="sm"
              type="button"
              variant="outline"
            >
              {busyLoopId === loop.id ? "Updating..." : loop.status === "active" ? "Pause" : "Resume"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function workspaceMemoryTypeLabel(value: WorkspaceMemoryDocument["memoryType"]): string {
  return value.replace(/_/g, " ");
}

function summarizeWorkspaceMemoryEvidence(memory: WorkspaceMemoryDocument): string | null {
  const parts: string[] = [];
  const outcomeCount = memory.evidence["outcomeCount"];
  const signalType = memory.evidence["signalType"];
  const sourceChannel = memory.evidence["sourceChannel"];
  const targetArea = memory.evidence["targetArea"];

  if (typeof outcomeCount === "number") {
    parts.push(`${outcomeCount} observed`);
  }
  if (typeof signalType === "string") {
    parts.push(signalType.replace(/_/g, " "));
  }
  if (typeof sourceChannel === "string") {
    parts.push(sourceChannel.replace(/_/g, " "));
  }
  if (typeof targetArea === "string") {
    parts.push(targetArea);
  }

  return parts.length > 0 ? parts.join(" / ") : null;
}

function HarwickMemoryReviewPanel(props: {
  canReviewMemory: boolean;
  workspaceId: string;
}) {
  const [memories, setMemories] = useState<WorkspaceMemoryDocument[]>([]);
  const [filterStatus, setFilterStatus] = useState<WorkspaceMemoryReviewStatus>("pending");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"loading" | "idle" | "saving" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busyMemoryId, setBusyMemoryId] = useState<string | null>(null);

  useEffect(() => {
    const loadMemories = async () => {
      setStatus("loading");
      setError(null);
      try {
        const params = new URLSearchParams({
          reviewStatus: filterStatus,
          limit: "25",
        });
        const response = await fetch(`/api/workspaces/${props.workspaceId}/workspace-memory?${params.toString()}`);
        if (!response.ok) {
          throw new Error("workspace_memory_load_failed");
        }
        const parsed = WorkspaceMemoryReviewListResponseSchema.parse(await response.json());
        setMemories(parsed.memories);
        setReviewNotes(Object.fromEntries(parsed.memories.map((memory) => [memory.id, memory.reviewNote ?? ""])));
        setStatus("idle");
      } catch (memoryError) {
        console.error("Failed to load Harwick workspace memory:", memoryError);
        setStatus("error");
        setError("Could not load workspace memory.");
      }
    };

    void loadMemories();
  }, [filterStatus, props.workspaceId]);

  async function reviewMemory(memory: WorkspaceMemoryDocument, reviewStatus: WorkspaceMemoryReviewStatus) {
    if (!props.canReviewMemory || busyMemoryId !== null) return;

    const request = buildWorkspaceMemoryReviewRequest({
      memoryId: memory.id,
      reviewStatus,
      reviewNote: reviewNotes[memory.id] ?? "",
    });
    if (!request.ok) {
      setStatus("error");
      setError(request.error);
      return;
    }

    setBusyMemoryId(memory.id);
    setStatus("saving");
    setError(null);
    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/workspace-memory`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.request),
      });
      if (!response.ok) {
        throw new Error("workspace_memory_review_failed");
      }
      const parsed = WorkspaceMemoryReviewUpdateResponseSchema.parse(await response.json());
      setMemories((current) => {
        if (parsed.memory.reviewStatus !== filterStatus) {
          return current.filter((item) => item.id !== parsed.memory.id);
        }
        return current.map((item) => (item.id === parsed.memory.id ? parsed.memory : item));
      });
      setReviewNotes((current) => ({ ...current, [parsed.memory.id]: parsed.memory.reviewNote ?? "" }));
      setStatus("idle");
    } catch (memoryError) {
      console.error("Failed to review Harwick workspace memory:", memoryError);
      setStatus("error");
      setError("Could not save this memory review.");
    } finally {
      setBusyMemoryId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-muted/55 p-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.12em] text-muted-subtle">Workspace memory</div>
          <div className="mt-1 text-[12px] text-muted">
            Review the patterns Harwick has learned before they shape future routing and conversation context.
          </div>
        </div>
        <div className="flex rounded-[10px] border border-border bg-surface p-1">
          {(["pending", "approved", "dismissed"] as const).map((reviewStatus) => (
            <button
              className={cn(
                "rounded-[8px] px-3 py-[6px] text-[11px] transition-colors",
                filterStatus === reviewStatus
                  ? "bg-harwick-ink text-white"
                  : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
              key={reviewStatus}
              onClick={() => setFilterStatus(reviewStatus)}
              type="button"
            >
              {workspaceMemoryStatusLabel(reviewStatus)}
            </button>
          ))}
        </div>
      </div>

      {error === null ? null : (
        <div className="rounded-[10px] border border-oxblood-soft bg-oxblood-soft/30 px-3 py-2 text-[11.5px] text-hot">
          {error}
        </div>
      )}

      <div className="divide-y divide-border rounded-[12px] border border-border bg-surface">
        {status === "loading" ? (
          <div className="px-4 py-4 text-[12px] text-muted-subtle">Loading workspace memory...</div>
        ) : memories.length === 0 ? (
          <div className="px-4 py-4 text-[12px] text-muted-subtle">No {workspaceMemoryStatusLabel(filterStatus)} memory is waiting here.</div>
        ) : memories.map((memory) => {
          const evidence = summarizeWorkspaceMemoryEvidence(memory);
          return (
            <div className="px-4 py-4" key={memory.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-[13px] font-medium text-foreground">{memory.title}</div>
                    <span className="rounded-full border border-border bg-surface-muted px-2 py-[2px] text-[10px] uppercase text-muted">
                      {workspaceMemoryTypeLabel(memory.memoryType)}
                    </span>
                    <span className={cn(
                      "rounded-full border px-2 py-[2px] text-[10px] uppercase",
                      memory.reviewStatus === "approved"
                        ? "border-qualified/25 bg-qualified-soft text-qualified"
                        : memory.reviewStatus === "dismissed"
                          ? "border-oxblood-soft bg-oxblood-soft/25 text-hot"
                          : "border-border bg-surface-muted text-muted",
                    )}>
                      {workspaceMemoryStatusLabel(memory.reviewStatus)}
                    </span>
                  </div>
                  <div className="mt-2 text-[12px] leading-5 text-muted">{memory.body}</div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-subtle">
                    <span>{formatWorkspaceMemoryConfidence(memory.confidence)}</span>
                    <span>observed {formatWorkspaceMemoryDate(memory.lastObservedAt)}</span>
                    <span>source {memory.source.replace(/_/g, " ")}</span>
                    {evidence === null ? null : <span>{evidence}</span>}
                  </div>
                </div>
                {memory.reviewedAt === null ? null : (
                  <div className="text-right text-[11px] text-muted-subtle">
                    reviewed {formatWorkspaceMemoryDate(memory.reviewedAt)}
                  </div>
                )}
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <input
                  className="harwick-control w-full px-[11px] py-[8px] text-[12.5px]"
                  disabled={!props.canReviewMemory || busyMemoryId !== null}
                  maxLength={1000}
                  onChange={(event) => setReviewNotes((current) => ({ ...current, [memory.id]: event.target.value }))}
                  placeholder="Optional review note"
                  value={reviewNotes[memory.id] ?? ""}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="text-[11px]"
                    disabled={!props.canReviewMemory || busyMemoryId !== null || memory.reviewStatus === "approved"}
                    onClick={() => void reviewMemory(memory, "approved")}
                    size="sm"
                    type="button"
                  >
                    {busyMemoryId === memory.id && status === "saving" ? "Saving..." : "Approve"}
                  </Button>
                  <Button
                    className="text-[11px]"
                    disabled={!props.canReviewMemory || busyMemoryId !== null || memory.reviewStatus === "dismissed"}
                    onClick={() => void reviewMemory(memory, "dismissed")}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {props.canReviewMemory ? null : (
        <div className="text-[11.5px] text-muted-subtle">Only owners, admins, and team leads can review workspace memory.</div>
      )}
    </div>
  );
}

export function SettingsPageContent(props: {
  billing: BillingSummary;
  memberDisplayName: string;
  memberEmail: string | null;
  memberRole: WorkspaceRole;
  workspaceName: string;
  workspaceId: string;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [policyNarrative, setPolicyNarrative] = useState("");
  const [policyNarrativeSource, setPolicyNarrativeSource] = useState<"generated" | "manual" | null>(null);
  const [policyNarrativeStatus, setPolicyNarrativeStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [automation, setAutomation] = useState({
    autoSendEnabled: false,
    confidenceThreshold: 0.78,
  });
  const [notifications, setNotifications] = useState({
    newLeadAssigned: true,
    replyApprovalNeeded: true,
    missedCallAlerts: true,
    fubSyncErrors: false,
    dailyDigest: false,
  });
  const [preferences, setPreferences] = useState({
    transferQualifiedCalls: true,
  });

  // Load automation settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await fetch(
          `/api/workspaces/${props.workspaceId}/members/automation-settings`,
        );
        if (res.ok) {
          const data = (await res.json()) as Record<string, unknown>;
          setAutomation({
            autoSendEnabled: typeof data["autoSendEnabled"] === "boolean" ? data["autoSendEnabled"] : false,
            confidenceThreshold: typeof data["confidenceThreshold"] === "number" ? data["confidenceThreshold"] : 50,
          });
        }
      } catch (error) {
        console.error("Failed to load automation settings:", error);
      }
    };

    void loadSettings();
  }, [props.workspaceId]);

  useEffect(() => {
    const loadPolicyNarrative = async () => {
      try {
        const res = await fetch(`/api/workspaces/${props.workspaceId}/policy-narrative`);
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          body: string | null;
          source: "generated" | "manual" | null;
        };
        setPolicyNarrative(data.body ?? "");
        setPolicyNarrativeSource(data.source);
      } catch (error) {
        console.error("Failed to load Harwick standing instructions:", error);
      }
    };

    void loadPolicyNarrative();
  }, [props.workspaceId]);

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/workspaces/${props.workspaceId}/members/automation-settings`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autoSendEnabled: automation.autoSendEnabled,
            confidenceThreshold: automation.confidenceThreshold,
          }),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      console.error("Save failed:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePolicyNarrative = async () => {
    setPolicyNarrativeStatus("saving");
    try {
      const res = await fetch(`/api/workspaces/${props.workspaceId}/policy-narrative`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: policyNarrative }),
      });

      if (!res.ok) {
        throw new Error("Failed to save Harwick standing instructions");
      }

      const data = (await res.json()) as {
        body: string | null;
        source: "generated" | "manual" | null;
      };
      setPolicyNarrative(data.body ?? "");
      setPolicyNarrativeSource(data.source);
      setPolicyNarrativeStatus("saved");
    } catch (error) {
      console.error("Policy narrative save failed:", error);
      setPolicyNarrativeStatus("error");
    }
  };

  const canReviewWorkspaceMemory =
    props.memberRole === "owner" || props.memberRole === "admin" || props.memberRole === "team_lead";
  const canViewWorkspaceMemory =
    canReviewWorkspaceMemory || props.memberRole === "lead_manager" || props.memberRole === "operator";
  const memberRoleLabel = roleLabel(props.memberRole);
  const memberEmail = props.memberEmail ?? "Not configured";
  const signaturePreview = `- ${props.memberDisplayName}, ${props.workspaceName}`;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <WorkspaceTopbar context="profile & settings" workspaceName={props.workspaceName}>
        <Button
          className="ml-auto px-4 text-[11px]"
          disabled={isSaving}
          onClick={() => void handleSaveChanges()}
          size="sm"
          type="button"
        >
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </WorkspaceTopbar>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6">
        <div className="grid items-start gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
          <div>
            <div className="harwick-card mb-[14px] p-[22px] text-center">
              <div className="mx-auto mb-3 flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[linear-gradient(135deg,#c9a84c,#8b5e1a)] font-display text-[30px] font-medium text-white">
                {initialsForName(props.memberDisplayName)}
              </div>
              <div className="font-display text-[21px] font-medium">{props.memberDisplayName}</div>
              <div className="mb-[14px] text-[12px] text-muted-subtle">{memberRoleLabel} · {props.workspaceName}</div>

              <Button
                className="w-full text-[12px]"
                disabled
                size="sm"
                type="button"
                variant="outline"
              >
                Profile photo not connected
              </Button>
            </div>

            <div className="harwick-card p-[18px]">
              <div className="mb-[13px] font-display text-[16px] font-medium">Workspace</div>
              <InfoRow label="Name" value={props.workspaceName} />
              <InfoRow label="Plan" value={props.billing === null ? "Not configured" : planLabel(props.billing.planTier)} />
              <InfoRow label="Members" value="Managed by workspace roles" />
              <InfoRow label="Phone" value="Not configured" />
              <div className="mt-[11px]">
                <Button
                  className="text-[11px]"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Workspace Settings
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-[13px]">
            <SettingsSection title="Billing">
              <BillingPanel
                billing={props.billing}
                canManageBilling={props.memberRole === "owner" || props.memberRole === "admin"}
                workspaceId={props.workspaceId}
              />
            </SettingsSection>

            <SettingsSection title="Personal Info">
              <div className="space-y-0">
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Full Name</div>
                  <input className="harwick-control w-[190px] px-[11px] py-[7px] text-[12.5px]" readOnly value={props.memberDisplayName} />
                </div>
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Email</div>
                  <input className="harwick-control w-[220px] px-[11px] py-[7px] text-[12.5px]" readOnly value={memberEmail} />
                </div>
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Phone</div>
                  <input className="harwick-control w-[155px] px-[11px] py-[7px] text-[12.5px]" placeholder="Not configured" readOnly value="" />
                </div>
                <div className="flex items-center gap-4 border-b border-border py-3">
                  <div className="flex-1 text-[13px] font-medium">Role</div>
                  <select className="harwick-control px-[10px] py-[6px] text-[12px]" disabled value={props.memberRole}>
                    <option value={props.memberRole}>{memberRoleLabel}</option>
                  </select>
                </div>
                <div className="flex items-center gap-4 py-3">
                  <div className="flex-1 text-[13px] font-medium">Specialization</div>
                  <select className="harwick-control px-[10px] py-[6px] text-[12px]" disabled value="not_configured">
                    <option value="not_configured">Not configured</option>
                  </select>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title="Notifications">
              <ToggleRow
                checked={notifications.newLeadAssigned}
                description="Alert when a lead is assigned to you"
                label="New lead assigned"
                onToggle={() => setNotifications((current) => ({ ...current, newLeadAssigned: !current.newLeadAssigned }))}
              />
              <ToggleRow
                checked={notifications.replyApprovalNeeded}
                description="Harwick actions waiting on your approval"
                label="Reply approval needed"
                onToggle={() => setNotifications((current) => ({ ...current, replyApprovalNeeded: !current.replyApprovalNeeded }))}
              />
              <ToggleRow
                checked={notifications.missedCallAlerts}
                description="Immediate alert when a call is missed"
                label="Missed call alerts"
                onToggle={() => setNotifications((current) => ({ ...current, missedCallAlerts: !current.missedCallAlerts }))}
              />
              <ToggleRow
                checked={notifications.fubSyncErrors}
                description="Alert on sync failures or conflicts"
                label="FUB sync errors"
                onToggle={() => setNotifications((current) => ({ ...current, fubSyncErrors: !current.fubSyncErrors }))}
              />
              <ToggleRow
                checked={notifications.dailyDigest}
                description="Morning summary of yesterday's activity"
                label="Daily digest"
                onToggle={() => setNotifications((current) => ({ ...current, dailyDigest: !current.dailyDigest }))}
              />
            </SettingsSection>

            <SettingsSection title="Reply Preferences">
              <ToggleRow
                checked={automation.autoSendEnabled}
                description="Send Harwick actions automatically if confidence is high"
                label="Auto-send approved actions"
                onToggle={() => setAutomation((current) => ({ ...current, autoSendEnabled: !current.autoSendEnabled }))}
              />
              <div className="flex items-center gap-4 border-b border-border py-3">
                <div className="flex-1 text-[13px] font-medium">Confidence threshold</div>
                <div className="flex items-center gap-2">
                  <input
                    className="harwick-control w-[80px] px-[11px] py-[7px] text-[12.5px]"
                    max="100"
                    min="0"
                    onChange={(e) =>
                      setAutomation((current) => ({
                        ...current,
                        confidenceThreshold: Number(e.target.value) / 100,
                      }))
                    }
                    step="1"
                    type="number"
                    value={Math.round(automation.confidenceThreshold * 100)}
                  />
                  <span className="text-[12px] text-muted-subtle">%</span>
                </div>
              </div>
              <div className="flex items-center gap-4 border-b border-border py-3">
                <div className="flex-1 text-[13px] font-medium">Reply tone</div>
                <select className="harwick-control px-[10px] py-[6px] text-[12px]">
                  <option>Professional</option>
                  <option selected>Warm & friendly</option>
                  <option>Concise</option>
                </select>
              </div>
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1 text-[13px] font-medium">Signature</div>
                <input className="harwick-control w-[230px] px-[11px] py-[7px] text-[12.5px]" readOnly value={signaturePreview} />
              </div>
            </SettingsSection>

            <SettingsSection title="Harwick Standing Instructions">
              <div className="space-y-3">
                <textarea
                  className="harwick-control min-h-[172px] w-full resize-y px-[12px] py-[10px] text-[12.5px] leading-5"
                  maxLength={8000}
                  onChange={(event) => {
                    setPolicyNarrative(event.target.value);
                    setPolicyNarrativeStatus("idle");
                  }}
                  placeholder="Every closed lead gets a thank-you and a 6-month check-in. Pause automation on legal, lending, or contract advice. Route Katy luxury buyers to Noah when capacity is open."
                  value={policyNarrative}
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11.5px] text-muted-subtle">
                    {policyNarrativeSource === "manual"
                      ? "Manual workspace policy"
                      : policyNarrativeSource === "generated"
                        ? "Generated from automation policy"
                        : "No workspace policy saved"}
                  </div>
                  <div className="flex items-center gap-3">
                    {policyNarrativeStatus === "saved" && (
                      <span className="text-[11.5px] text-qualified">Saved</span>
                    )}
                    {policyNarrativeStatus === "error" && (
                      <span className="text-[11.5px] text-hot">Save failed</span>
                    )}
                    <Button
                      className="px-4 text-[11px]"
                      disabled={policyNarrativeStatus === "saving" || policyNarrative.trim().length === 0}
                      onClick={() => void handleSavePolicyNarrative()}
                      size="sm"
                      type="button"
                    >
                      {policyNarrativeStatus === "saving" ? "Saving..." : "Save Instructions"}
                    </Button>
                  </div>
                </div>
              </div>
            </SettingsSection>

            <SettingsSection title="Harwick Loops">
              <HarwickLoopsPanel
                canManageLoops={props.memberRole === "owner" || props.memberRole === "admin" || props.memberRole === "team_lead"}
                workspaceId={props.workspaceId}
              />
            </SettingsSection>

            {canViewWorkspaceMemory ? (
              <SettingsSection title="Harwick Memory Review">
                <HarwickMemoryReviewPanel
                  canReviewMemory={canReviewWorkspaceMemory}
                  workspaceId={props.workspaceId}
                />
              </SettingsSection>
            ) : null}

            <SettingsSection title="Voice Agent">
              <ToggleRow
                checked={preferences.transferQualifiedCalls}
                description="Voice agent routes matching calls to your line"
                label="Transfer qualified calls to me"
                onToggle={() => setPreferences((current) => ({ ...current, transferQualifiedCalls: !current.transferQualifiedCalls }))}
              />
              <div className="flex items-center gap-4 border-b border-border py-3">
                <div className="flex-1 text-[13px] font-medium">My transfer number</div>
                <input className="harwick-control w-[155px] px-[11px] py-[7px] text-[12.5px]" placeholder="Not configured" readOnly value="" />
              </div>
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1 text-[13px] font-medium">Availability hours</div>
                <select className="harwick-control px-[10px] py-[6px] text-[12px]">
                  <option>9 AM – 6 PM daily</option>
                  <option>Mon–Fri 9–6</option>
                  <option selected>Mon–Sat 9–7</option>
                </select>
              </div>
            </SettingsSection>

            <SettingsSection danger title="Danger Zone">
              <div className="flex items-center gap-4 py-3">
                <div className="flex-1">
                  <div className="text-[13px] font-medium text-foreground">Leave workspace</div>
                  <div className="mt-1 text-[11.5px] text-muted-subtle">Remove yourself from {props.workspaceName}</div>
                </div>
                <Button
                  className="rounded-[8px] border-oxblood-soft bg-transparent px-3 text-[11px] text-hot hover:bg-oxblood-soft/50 hover:text-hot"
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Leave
                </Button>
              </div>
            </SettingsSection>
          </div>
        </div>
      </div>
    </div>
  );
}
