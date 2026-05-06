import {
  HarwickLoopCreateRequestSchema,
  type HarwickLoopApprovalMode,
  type HarwickLoopCreateRequest,
  type HarwickLoopOutputMode,
} from "@realty-ops/core";

export type HarwickLoopSettingsDraft = {
  name: string;
  instruction: string;
  scheduleSpec: string;
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
    triggerType: "schedule",
    scheduleSpec: draft.scheduleSpec,
    eventType: null,
    approvalMode: draft.approvalMode,
    outputMode: draft.outputMode,
    toolAllowlist: parseHarwickLoopToolAllowlist(draft.toolAllowlistText),
  });

  if (!parsed.success) {
    return { ok: false, error: "Loop needs a name, schedule, and instruction." };
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
