import type { Reply, Task, WorkItem } from "./home-page";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export type WorkItemActionKind =
  | "reply.approve"
  | "reply.send"
  | "reply.dismiss"
  | "reply.generateDraft"
  | "task.callback"
  | "task.reviewed"
  | "task.dismiss"
  | "task.harwickApprove"
  | "task.harwickDismiss"
  | "task.harwickMarkSeen"
  | "task.fubReplay"
  | "task.fubIgnore"
  | "task.opsRetry"
  | "task.opsDismiss";

async function postJson(url: string, body: unknown, ok: string, fail: string): Promise<ActionResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return { ok: true, message: ok };
    return { ok: false, message: fail };
  } catch {
    return { ok: false, message: fail };
  }
}

async function postDraftJson(url: string, body: unknown): Promise<ActionResult> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, message: "Harwick could not draft right now." };
    }
    const payload = await response.json() as { engine?: unknown; reply?: unknown };
    const engine = payload.engine === "openai" ? "OpenAI" : payload.engine === "local" ? "local runtime" : "Harwick";
    const reply = typeof payload.reply === "string" ? payload.reply.trim() : "";
    return {
      ok: reply.length > 0,
      message: reply.length > 0 ? `Draft generated with ${engine}.` : "Harwick returned an empty draft.",
    };
  } catch {
    return { ok: false, message: "Harwick could not draft right now." };
  }
}

export async function approveReply(reply: Reply): Promise<ActionResult> {
  if (reply.workspaceId === undefined || reply.reviewId === undefined) {
    return { ok: false, message: "Reply is not connected to a backend review row." };
  }
  return postJson(
    `/api/workspaces/${reply.workspaceId}/social-queue/${reply.reviewId}/action`,
    { action: "approve", reply: reply.draft },
    "Reply approved.",
    "The backend rejected this reply action.",
  );
}

export async function sendReply(reply: Reply, draft?: string): Promise<ActionResult> {
  if (reply.workspaceId === undefined || reply.reviewId === undefined) {
    return { ok: false, message: "Reply is not connected to a backend review row." };
  }
  return postJson(
    `/api/workspaces/${reply.workspaceId}/social-queue/${reply.reviewId}/action`,
    { action: "send", reply: draft ?? reply.draft },
    "Reply sent.",
    "The backend rejected this send.",
  );
}

export async function dismissReply(reply: Reply): Promise<ActionResult> {
  if (reply.workspaceId === undefined || reply.reviewId === undefined) {
    return { ok: false, message: "Reply is not connected to a backend review row." };
  }
  return postJson(
    `/api/workspaces/${reply.workspaceId}/social-queue/${reply.reviewId}/action`,
    { action: "dismiss", reason: "operator dismissed from home" },
    "Reply dismissed.",
    "The backend rejected this dismiss.",
  );
}

export async function generateDraft(reply: Reply): Promise<ActionResult> {
  if (reply.workspaceId === undefined || reply.leadId === undefined || reply.reviewId === undefined) {
    return { ok: false, message: "Lead context is missing - cannot draft." };
  }

  return postDraftJson(
    "/api/meta/reply/draft",
    {
      workspaceId: reply.workspaceId,
      leadId: reply.leadId,
      socialReplyReviewId: reply.reviewId,
      providerThreadId: reply.thread?.id,
      channel: reply.channel ?? (reply.source === "facebook" ? "facebook_dm" : "instagram_dm"),
      leadText: reply.message,
      leadContext: reply.thread?.aiSynthesis?.handoffBrief ?? reply.thread?.sourceContext ?? reply.helper,
    },
  );
}

export async function actOnVoiceTask(task: Task, action: "callback" | "reviewed" | "dismiss"): Promise<ActionResult> {
  if (task.workspaceId === undefined || task.handoffId === undefined) {
    return { ok: false, message: "Voice handoff is not connected to a backend row." };
  }
  const body = action === "callback"
    ? { action: "create_callback_task", title: task.title, description: task.detail, priority: "urgent" }
    : action === "dismiss"
      ? { action: "dismiss", reason: "operator dismissed from home" }
      : { action: "mark_reviewed" };
  return postJson(
    `/api/workspaces/${task.workspaceId}/voice-queue/${task.handoffId}/action`,
    body,
    action === "callback" ? "Callback scheduled." : action === "dismiss" ? "Voice handoff dismissed." : "Voice handoff marked reviewed.",
    "The backend rejected this voice action.",
  );
}

export async function actOnHarwickWorkItem(task: Task, action: "approve" | "dismiss" | "mark_seen"): Promise<ActionResult> {
  if (task.workspaceId === undefined || task.workItemId === undefined) {
    return { ok: false, message: "Harwick item is missing its backend row." };
  }
  const body = action === "dismiss"
    ? { action: "dismiss", feedbackLabel: "not_relevant" }
    : action === "approve"
      ? { action: "approve", feedbackLabel: "useful" }
      : { action: "mark_seen", feedbackLabel: "useful" };
  return postJson(
    `/api/workspaces/${task.workspaceId}/harwick-work-items/${task.workItemId}/action`,
    body,
    action === "approve" ? "Harwick item approved." : action === "dismiss" ? "Harwick item dismissed." : "Harwick item acknowledged.",
    "The backend rejected this Harwick action.",
  );
}

export async function actOnFubConflict(task: Task, action: "replay" | "ignore"): Promise<ActionResult> {
  if (task.workspaceId === undefined || task.backsyncEventId === undefined) {
    return { ok: false, message: "FUB conflict row is missing IDs." };
  }
  const body = action === "ignore"
    ? { action: "ignore", reason: "operator ignored from home" }
    : { action: "replay" };
  return postJson(
    `/api/workspaces/${task.workspaceId}/operations/fub-conflicts/${task.backsyncEventId}/action`,
    body,
    action === "ignore" ? "FUB conflict ignored." : "FUB sync replay queued.",
    "The backend rejected this FUB action.",
  );
}

export async function actOnOpsFailure(task: Task, action: "retry" | "dismiss"): Promise<ActionResult> {
  if (
    task.workspaceId === undefined
    || task.operationsFailureItemType === undefined
    || task.operationsFailureResourceId === undefined
  ) {
    return { ok: false, message: "Ops failure row is missing IDs." };
  }
  const endpoint = task.operationsFailureItemType === "workflow_job"
    ? `/api/workspaces/${task.workspaceId}/operations/workflow-jobs/${task.operationsFailureResourceId}/action`
    : `/api/workspaces/${task.workspaceId}/operations/crm-syncs/${task.operationsFailureResourceId}/action`;
  return postJson(
    endpoint,
    action === "dismiss" ? { action: "dismiss" } : { action: "retry_now" },
    action === "dismiss" ? "Ops failure dismissed." : "Ops retry queued.",
    "The backend rejected this ops action.",
  );
}

export type ResolvedAction = {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  run: () => Promise<ActionResult>;
};

export function resolveActions(item: WorkItem, options: { hasRealDraft: boolean }): ResolvedAction[] {
  if (item.kind === "reply") {
    const reply = item.item;
    if (options.hasRealDraft) {
      return [
        { label: "Approve & send", primary: true, run: () => sendReply(reply) },
        { label: "Edit", run: () => Promise.resolve({ ok: true, message: "" }) },
        { label: "Dismiss", run: () => dismissReply(reply) },
      ];
    }
    return [
      { label: "Generate draft", primary: true, run: () => generateDraft(reply) },
      { label: "Dismiss", run: () => dismissReply(reply) },
    ];
  }

  const task = item.item;

  if (task.type === "callback") {
    return [
      { label: "Schedule callback", primary: true, run: () => actOnVoiceTask(task, "callback") },
      { label: "Mark reviewed", run: () => actOnVoiceTask(task, "reviewed") },
      { label: "Dismiss", run: () => actOnVoiceTask(task, "dismiss") },
    ];
  }

  if (task.type === "crm") {
    if (task.operationsFailureItemType !== undefined) {
      return [
        { label: task.operationsFailureRetryable ? "Retry now" : "Mark reviewed", primary: true, run: () => actOnOpsFailure(task, "retry") },
        { label: "Dismiss", run: () => actOnOpsFailure(task, "dismiss") },
      ];
    }
    if (task.backsyncEventId !== undefined) {
      return [
        { label: "Replay sync", primary: true, run: () => actOnFubConflict(task, "replay") },
        { label: "Ignore", run: () => actOnFubConflict(task, "ignore") },
      ];
    }
    return [];
  }

  if (task.type === "insight") {
    return [
      { label: task.workItemType === "approval" ? "Approve" : "Mark seen", primary: true, run: () => actOnHarwickWorkItem(task, task.workItemType === "approval" ? "approve" : "mark_seen") },
      { label: "Dismiss", run: () => actOnHarwickWorkItem(task, "dismiss") },
    ];
  }

  return [];
}
