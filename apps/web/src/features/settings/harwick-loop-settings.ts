import {
  HarwickLoopCreateRequestSchema,
  type HarwickLoopApprovalMode,
  type HarwickLoopCreateRequest,
  type HarwickLoopOutputMode,
  type HarwickLoopTriggerType,
} from "@realty-ops/core";

export const HARWICK_LOOP_EVENT_TYPE_OPTIONS = [{
  value: "lead_closed_won",
  label: "Lead closed won",
}] as const;

export type HarwickLoopSettingsDraft = {
  name: string;
  instruction: string;
  triggerType: HarwickLoopTriggerType;
  scheduleSpec: string;
  eventType: string;
  approvalMode: HarwickLoopApprovalMode;
  outputMode: HarwickLoopOutputMode;
  toolAllowlistText: string;
};

export type HarwickLoopSettingsBuildResult =
  | { ok: true; request: HarwickLoopCreateRequest }
  | { ok: false; error: string };

export function parseHarwickLoopToolAllowlist(value: string): string[] {
  return Array.from(new Set(
    value
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0),
  ));
}

export function buildHarwickLoopCreateRequest(
  draft: HarwickLoopSettingsDraft,
): HarwickLoopSettingsBuildResult {
  const parsed = HarwickLoopCreateRequestSchema.safeParse({
    name: draft.name,
    instruction: draft.instruction,
    triggerType: draft.triggerType,
    scheduleSpec: draft.triggerType === "schedule" ? draft.scheduleSpec : null,
    eventType: draft.triggerType === "event" ? draft.eventType : null,
    approvalMode: draft.approvalMode,
    outputMode: draft.outputMode,
    toolAllowlist: parseHarwickLoopToolAllowlist(draft.toolAllowlistText),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: draft.triggerType === "event"
        ? "Loop needs a name, event trigger, and instruction."
        : "Loop needs a name, schedule, and instruction.",
    };
  }

  return { ok: true, request: parsed.data };
}

export function formatHarwickLoopDate(value: string | null): string {
  if (value === null) {
    return "not scheduled";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
