import {
  registerCrmConnector,
  renderAttribution,
  type CrmAssignment,
  type CrmConnector,
  type CrmContactNote,
  type CrmContactState,
  type CrmTask,
  type CrmWebhookEvent,
} from "@realty-ops/core";

import { decryptCredential } from "../../lib/credentials";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * KvCoreConnector — implementation against kvCore Public API V2
 * (apidocs.kvcore.com). Powers Inside Real Estate / Keller Williams TAM
 * (~150K agents).
 *
 * Auth: API token via Bearer. Native webhooks for new_lead + campaign_action.
 *
 * Implementation status: Phase 8.1 scope. All methods present with the
 * correct shape; endpoints stubbed pending workspace-level kvCore credentials
 * for live testing. Marked production-ready when at least one workspace has
 * connected a kvCore integration.
 *
 * The architectural point: registering this connector is enough for the
 * 13-tool judgment registry + the rest of the operator surface to start
 * working against kvCore workspaces — no judgment-tool changes needed.
 * Same upstream tools, different downstream pipe.
 */

const KVCORE_BASE = "https://api.kvcore.com/v2";

function getCredentialSecret(): string {
  return process.env["CREDENTIAL_ENCRYPTION_SECRET"] ?? process.env["NEXT_PUBLIC_CREDENTIAL_SECRET"] ?? "";
}

async function getKvCoreCredentials(workspaceId: string): Promise<{ apiToken: string } | null> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data } = await untyped
    .from("integration_accounts")
    .select("encrypted_credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", "kvcore")
    .eq("status", "connected")
    .maybeSingle();
  if (data === null || data === undefined) return null;
  try {
    const decrypted = decryptCredential<{ apiToken?: string }>(data.encrypted_credentials as string, getCredentialSecret());
    if (typeof decrypted.apiToken !== "string" || decrypted.apiToken.length === 0) return null;
    return { apiToken: decrypted.apiToken };
  } catch {
    return null;
  }
}

async function kvFetch(apiToken: string, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${KVCORE_BASE}${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      "X-Source": "Harwick",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`kvCore ${init?.method ?? "GET"} ${path} failed: ${response.status} ${body.slice(0, 200)}`);
  }
  if (response.status === 204) return {};
  return await response.json() as Record<string, unknown>;
}

function appendAttribution(body: string, attribution: CrmContactNote["attribution"]): string {
  const tag = renderAttribution(attribution);
  return tag.length === 0 ? body : `${body}\n\n${tag}`;
}

export const kvCoreConnector: CrmConnector = {
  provider: "kvcore",

  async pushContactNote(workspaceId, note) {
    const creds = await getKvCoreCredentials(workspaceId);
    if (creds === null) throw new Error("kvCore credentials not configured.");
    const result = await kvFetch(creds.apiToken, `/contacts/${note.contactId}/notes`, {
      method: "POST",
      body: JSON.stringify({
        content: appendAttribution(note.body, note.attribution),
        source: note.sourceTag,
      }),
    }) as { id?: string | number };
    return { providerNoteId: String(result.id ?? "unknown") };
  },

  async pushTask(workspaceId, task) {
    const creds = await getKvCoreCredentials(workspaceId);
    if (creds === null) throw new Error("kvCore credentials not configured.");
    const description = task.description === null ? null : appendAttribution(task.description, task.attribution);
    const result = await kvFetch(creds.apiToken, "/tasks", {
      method: "POST",
      body: JSON.stringify({
        contact_id: task.contactId,
        title: task.title,
        description,
        due_at: task.dueAt,
        priority: task.priority,
        assigned_user_id: task.assignedToProviderUserId,
      }),
    }) as { id?: string | number };
    return { providerTaskId: String(result.id ?? "unknown") };
  },

  async assignContact(workspaceId, assignment: CrmAssignment) {
    const creds = await getKvCoreCredentials(workspaceId);
    if (creds === null) throw new Error("kvCore credentials not configured.");
    await kvFetch(creds.apiToken, `/contacts/${assignment.contactId}`, {
      method: "PATCH",
      body: JSON.stringify({
        assigned_user_id: assignment.assignedToProviderUserId,
      }),
    });
    if (assignment.reason !== null) {
      await this.pushContactNote(workspaceId, {
        contactId: assignment.contactId,
        body: `Reassigned: ${assignment.reason}`,
        attribution: assignment.attribution,
        occurredAt: null,
        sourceTag: "harwick:routing",
      });
    }
  },

  async fetchContact(workspaceId, contactId): Promise<CrmContactState> {
    const creds = await getKvCoreCredentials(workspaceId);
    if (creds === null) throw new Error("kvCore credentials not configured.");
    const contact = await kvFetch(creds.apiToken, `/contacts/${contactId}?include=notes,tasks`);
    const notes = Array.isArray(contact["notes"]) ? contact["notes"] as Array<Record<string, unknown>> : [];
    const tasks = Array.isArray(contact["tasks"]) ? contact["tasks"] as Array<Record<string, unknown>> : [];
    return {
      contactId,
      stage: typeof contact["stage"] === "string" ? contact["stage"] : null,
      assignedToProviderUserId: contact["assigned_user_id"] === undefined || contact["assigned_user_id"] === null
        ? null
        : String(contact["assigned_user_id"]),
      assignedToDisplayName: typeof contact["assigned_to"] === "string" ? contact["assigned_to"] : null,
      recentNotes: notes.slice(0, 10).map((n) => ({
        id: String(n["id"] ?? "unknown"),
        body: typeof n["content"] === "string" ? n["content"] : "",
        createdAt: typeof n["created_at"] === "string" ? n["created_at"] : new Date().toISOString(),
        isHarwickAuthored: typeof n["content"] === "string" && n["content"].includes("via Harwick"),
      })),
      recentTasks: tasks.slice(0, 10).map((t) => ({
        id: String(t["id"] ?? "unknown"),
        title: typeof t["title"] === "string" ? t["title"] : "",
        status: typeof t["status"] === "string" ? t["status"] : "open",
        dueAt: typeof t["due_at"] === "string" ? t["due_at"] : null,
      })),
      fetchedAt: new Date().toISOString(),
    };
  },

  async registerWebhook(params) {
    const creds = await getKvCoreCredentials(params.workspaceId);
    if (creds === null) throw new Error("kvCore credentials not configured.");
    const result = await kvFetch(creds.apiToken, "/webhooks", {
      method: "POST",
      body: JSON.stringify({
        url: params.callbackUrl,
        secret: params.secret,
        events: ["new_lead", "stage_changed", "task_completed", "note_added", "assigned_changed"],
      }),
    }) as { id?: string | number };
    return { registrationId: String(result.id ?? "unknown") };
  },

  async normalizeWebhookEvent(rawBody, _headers): Promise<CrmWebhookEvent | null> {
    if (rawBody === null || typeof rawBody !== "object") return null;
    const body = rawBody as Record<string, unknown>;
    const event = typeof body["event"] === "string" ? body["event"] : "other";
    const workspaceId = typeof body["workspace_id"] === "string" ? body["workspace_id"] : null;
    const contactId = typeof body["contact_id"] === "string" ? body["contact_id"]
      : typeof body["contact_id"] === "number" ? String(body["contact_id"])
      : null;
    if (workspaceId === null || contactId === null) return null;

    const eventType: CrmWebhookEvent["eventType"] = (() => {
      if (event.includes("note")) return "note_added";
      if (event.includes("task")) return "task_completed";
      if (event.includes("stage")) return "stage_changed";
      if (event.includes("assigned")) return "assigned_changed";
      if (event.includes("new_lead")) return "other";
      return "other";
    })();

    return {
      provider: "kvcore",
      workspaceId,
      contactId,
      eventType,
      payload: body,
      occurredAt: typeof body["occurred_at"] === "string" ? body["occurred_at"] : new Date().toISOString(),
    };
  },
};

registerCrmConnector(kvCoreConnector);
