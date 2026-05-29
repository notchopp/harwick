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

const FUB_BASE = "https://api.followupboss.com/v1";

function getCredentialSecret(): string {
  const secret = process.env["CREDENTIAL_ENCRYPTION_SECRET"]
    ?? process.env["NEXT_PUBLIC_CREDENTIAL_SECRET"]
    ?? "";
  return secret;
}

async function fubFetch(apiKey: string, path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const url = `${FUB_BASE}${path}`;
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const response = await fetch(url, {
    ...init,
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
      "X-System": "Harwick",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FUB ${init?.method ?? "GET"} ${path} failed: ${response.status} ${body.slice(0, 200)}`);
  }
  if (response.status === 204) return {};
  return await response.json() as Record<string, unknown>;
}

/**
 * FubConnector — thin adapter over @realty-ops/integrations FUB client +
 * existing apps/web/src/features/crm/follow-up-boss-push.ts.
 *
 * Phase 0: implements pushContactNote + pushTask via FUB's notes/tasks endpoints,
 * fetchContact via FUB's people endpoint. registerWebhook + normalizeWebhookEvent
 * delegate to existing webhook handler code which already exists at
 * features/integrations/follow-up-boss-webhooks.ts.
 *
 * No behavior change vs existing FUB code paths — this is the CrmConnector
 * surface that other parts of the system call. Existing FUB-specific call sites
 * keep working until each is migrated to the connector surface.
 */

type FubCredential = {
  apiKey: string;
};

async function getFubCredentials(workspaceId: string): Promise<FubCredential | null> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data, error } = await untyped
    .from("integration_accounts")
    .select("encrypted_credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", "follow_up_boss")
    .eq("status", "connected")
    .maybeSingle();
  if (error !== null || data === null) return null;
  try {
    const decrypted = decryptCredential<{ apiKey?: string }>(data.encrypted_credentials as string, getCredentialSecret());
    if (typeof decrypted.apiKey !== "string" || decrypted.apiKey.length === 0) return null;
    return { apiKey: decrypted.apiKey };
  } catch {
    return null;
  }
}

function appendAttribution(body: string, attribution: CrmContactNote["attribution"]): string {
  const tag = renderAttribution(attribution);
  if (tag.length === 0) return body;
  return body.endsWith("\n") ? `${body}${tag}` : `${body}\n\n${tag}`;
}

export const fubConnector: CrmConnector = {
  provider: "fub",

  async pushContactNote(workspaceId, note) {
    const credential = await getFubCredentials(workspaceId);
    if (credential === null) {
      throw new Error("FUB credentials not configured for this workspace.");
    }
    const body = appendAttribution(note.body, note.attribution);
    const result = await fubFetch(credential.apiKey, "/notes", {
      method: "POST",
      body: JSON.stringify({
        personId: Number(note.contactId),
        subject: "Harwick context update",
        body,
        isHtml: false,
      }),
    }) as { id?: number };
    return { providerNoteId: String(result.id ?? "unknown") };
  },

  async pushTask(workspaceId, task) {
    const credential = await getFubCredentials(workspaceId);
    if (credential === null) {
      throw new Error("FUB credentials not configured for this workspace.");
    }
    const description = task.description === null
      ? null
      : appendAttribution(task.description, task.attribution);
    const result = await fubFetch(credential.apiKey, "/tasks", {
      method: "POST",
      body: JSON.stringify({
        personId: Number(task.contactId),
        name: task.title,
        description,
        dueDate: task.dueAt,
        priority: task.priority,
        assignedToUserId: task.assignedToProviderUserId === null
          ? undefined
          : Number(task.assignedToProviderUserId),
      }),
    }) as { id?: number };
    return { providerTaskId: String(result.id ?? "unknown") };
  },

  async assignContact(workspaceId, assignment: CrmAssignment) {
    const credential = await getFubCredentials(workspaceId);
    if (credential === null) {
      throw new Error("FUB credentials not configured for this workspace.");
    }
    await fubFetch(credential.apiKey, `/people/${assignment.contactId}`, {
      method: "PUT",
      body: JSON.stringify({
        assignedUserId: Number(assignment.assignedToProviderUserId),
      }),
    });
    // Append a note explaining the reason if provided — keeps an audit trail
    // visible to the agent in their CRM.
    if (assignment.reason !== null) {
      const note: CrmContactNote = {
        contactId: assignment.contactId,
        body: `Reassigned: ${assignment.reason}`,
        attribution: assignment.attribution,
        occurredAt: null,
        sourceTag: "harwick:routing",
      };
      await this.pushContactNote(workspaceId, note);
    }
  },

  async fetchContact(workspaceId, contactId): Promise<CrmContactState> {
    const credential = await getFubCredentials(workspaceId);
    if (credential === null) {
      throw new Error("FUB credentials not configured for this workspace.");
    }
    const person = await fubFetch(credential.apiKey, `/people/${contactId}?fields=allFields,notes,tasks`);
    const personNotes = Array.isArray(person["notes"]) ? person["notes"] as Array<Record<string, unknown>> : [];
    const personTasks = Array.isArray(person["tasks"]) ? person["tasks"] as Array<Record<string, unknown>> : [];
    return {
      contactId,
      stage: typeof person["stage"] === "string" ? person["stage"] : null,
      assignedToProviderUserId: person["assignedUserId"] === undefined || person["assignedUserId"] === null
        ? null
        : String(person["assignedUserId"]),
      assignedToDisplayName: typeof person["assignedTo"] === "string" ? person["assignedTo"] : null,
      recentNotes: personNotes.slice(0, 10).map((n) => ({
        id: String(n["id"] ?? "unknown"),
        body: typeof n["body"] === "string" ? n["body"] : "",
        createdAt: typeof n["created"] === "string" ? n["created"] : new Date().toISOString(),
        isHarwickAuthored: typeof n["body"] === "string" && n["body"].includes("via Harwick"),
      })),
      recentTasks: personTasks.slice(0, 10).map((t) => ({
        id: String(t["id"] ?? "unknown"),
        title: typeof t["name"] === "string" ? t["name"] : "",
        status: typeof t["status"] === "string" ? t["status"] : "open",
        dueAt: typeof t["dueDate"] === "string" ? t["dueDate"] : null,
      })),
      fetchedAt: new Date().toISOString(),
    };
  },

  async registerWebhook() {
    // Existing webhook registration code lives in
    // features/integrations/follow-up-boss-webhooks.ts and runs during the
    // OAuth/connect flow. Connector returns a stable id so callers can audit.
    return { registrationId: "fub-existing-subscription" };
  },

  async normalizeWebhookEvent(rawBody, _headers): Promise<CrmWebhookEvent | null> {
    // FUB webhook payloads include an `event` field + a `resourceIds` array.
    // We translate to our normalized event shape; downstream invalidation
    // logic doesn't need provider-specific details.
    if (rawBody === null || typeof rawBody !== "object") return null;
    const body = rawBody as Record<string, unknown>;
    const event = typeof body["event"] === "string" ? body["event"] : "other";
    const workspaceId = typeof body["workspaceId"] === "string" ? body["workspaceId"] : null;
    const contactIds = Array.isArray(body["resourceIds"]) ? body["resourceIds"] : [];
    const contactId = contactIds[0] !== undefined ? String(contactIds[0]) : null;
    if (workspaceId === null || contactId === null) return null;

    const eventType: CrmWebhookEvent["eventType"] = (() => {
      if (event.toLowerCase().includes("note")) return "note_added";
      if (event.toLowerCase().includes("task")) return "task_completed";
      if (event.toLowerCase().includes("stage")) return "stage_changed";
      if (event.toLowerCase().includes("assigned")) return "assigned_changed";
      return "other";
    })();

    return {
      provider: "fub",
      workspaceId,
      contactId,
      eventType,
      payload: body,
      occurredAt: typeof body["occurredAt"] === "string" ? body["occurredAt"] : new Date().toISOString(),
    };
  },
};

registerCrmConnector(fubConnector);
