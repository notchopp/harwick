import { createTwilioMessagingClient } from "@realty-ops/integrations";
import { z } from "zod";

import { decryptCredential } from "../../../lib/credentials";
import { getServerEnvironment } from "../../../lib/server-env";
import type { HarwickToolDefinition, HarwickToolDeps } from "../registry";

/**
 * Cross-channel reach — Harwick can talk to leads outside Meta DMs.
 *
 *   - send_sms                  Sends via the workspace's connected Twilio
 *                               number. Falls back to "draft only" if Twilio
 *                               isn't wired yet.
 *   - draft_email               Composes a long-form email reply (subject + body).
 *                               No send infra yet — returns the draft for the
 *                               operator to paste, or for a future email tool to
 *                               consume.
 *   - draft_call_script         Outline for an outbound call. Returns the script.
 *   - summarize_call_recording  Pulls a Retell call summary from agent_steps.
 */

async function readTwilioCredential(deps: HarwickToolDeps): Promise<{
  accountSid: string;
  authToken: string;
  fromNumber: string;
} | null> {
  const env = getServerEnvironment();
  if (env.CREDENTIAL_ENCRYPTION_KEY === undefined) return null;

  const { data } = await deps.supabase
    .from("integration_accounts")
    .select("encrypted_credential_ref, provider_account_id, provider_account_name, status")
    .eq("workspace_id", deps.workspaceId)
    .eq("provider", "twilio" as never)
    .eq("status", "connected")
    .maybeSingle();

  if (data === null || data.encrypted_credential_ref === null) return null;

  try {
    const decrypted = decryptCredential<{ accountSid?: string; authToken?: string; fromNumber?: string }>(
      data.encrypted_credential_ref,
      env.CREDENTIAL_ENCRYPTION_KEY,
    );
    if (decrypted.accountSid === undefined
      || decrypted.authToken === undefined
      || decrypted.fromNumber === undefined) {
      return null;
    }
    return {
      accountSid: decrypted.accountSid,
      authToken: decrypted.authToken,
      fromNumber: decrypted.fromNumber,
    };
  } catch {
    return null;
  }
}

export const sendSmsTool: HarwickToolDefinition = {
  name: "send_sms",
  description: "Send a real SMS to a lead via the workspace's connected Twilio number. Use when the operator says 'text her' or when SMS is the only channel reaching this lead. If Twilio isn't connected for this workspace, returns a draft you can paste into the operator's phone instead.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "approval_required",
  inputSchema: z.object({
    leadId: z.string().uuid().nullable().default(null).describe("Lead to send to. Required for audit; the to-number is read from the lead record."),
    toNumber: z.string().min(7).max(20).optional().describe("Explicit phone number when not tied to a known lead. Use E.164 format ('+15125551234')."),
    body: z.string().min(2).max(600).describe("The SMS text. SMS only — no images. Sub-160 chars stays in one segment."),
  }),
  async execute(input, deps: HarwickToolDeps) {
    let toNumber = input.toNumber;
    if (toNumber === undefined && input.leadId !== null) {
      const { data: lead } = await deps.supabase
        .from("leads")
        .select("phone, full_name")
        .eq("workspace_id", deps.workspaceId)
        .eq("id", input.leadId)
        .maybeSingle();
      if (lead?.phone !== null && lead?.phone !== undefined) {
        toNumber = lead.phone;
      }
    }

    if (toNumber === undefined) {
      return { kind: "sms_action", sent: false, error: "No phone number available for this lead." };
    }

    const twilio = await readTwilioCredential(deps);
    if (twilio === null) {
      return {
        kind: "sms_action",
        sent: false,
        drafted: true,
        toNumber,
        body: input.body,
        note: "Twilio isn't connected for this workspace — returning a draft. Connect Twilio in integrations to send live.",
      };
    }

    try {
      const client = createTwilioMessagingClient();
      const result = await client.sendSms({
        accountSid: twilio.accountSid,
        authToken: twilio.authToken,
        from: twilio.fromNumber,
        to: toNumber,
        body: input.body,
      });
      return {
        kind: "sms_action",
        sent: true,
        toNumber,
        body: input.body,
        providerMessageId: result.providerEventId,
      };
    } catch (error) {
      return { kind: "sms_action", sent: false, error: error instanceof Error ? error.message : "twilio_send_failed" };
    }
  },
};

export const draftEmailTool: HarwickToolDefinition = {
  name: "draft_email",
  description: "Compose an email reply (subject + body) ready to send. Use when an email is the right channel — long-form context, multiple recipients, attachments needed. Returns a structured draft; an email-send tool can pick this up in a follow-up turn.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid().nullable().default(null),
    toEmail: z.string().email().nullable().default(null),
    subject: z.string().min(3).max(160),
    body: z.string().min(20).max(8000).describe("Email body. Multi-line is fine; include greeting + sign-off. Pull the operator name from context for signing."),
    cc: z.array(z.string().email()).max(10).default([]),
  }),
  async execute(input) {
    return {
      kind: "email_draft",
      drafted: true,
      toEmail: input.toEmail,
      subject: input.subject,
      body: input.body,
      cc: input.cc,
    };
  },
};

export const draftCallScriptTool: HarwickToolDefinition = {
  name: "draft_call_script",
  description: "Compose a structured call script for the operator to use on a live or upcoming call. Returns an opener, the 3-4 things to confirm, anticipated objections + responses, and a close. Use BEFORE the operator dials, or attached to a scheduled call task.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "auto_safe",
  inputSchema: z.object({
    leadId: z.string().uuid().nullable().default(null),
    callPurpose: z.string().min(3).max(300).describe("Why is the operator calling? 'Showing follow-up', 'lender check-in', 'reactivate cold lead'."),
    knownContext: z.string().max(2000).optional().describe("Anything Harwick or the operator already knows about this lead that should shape the script."),
  }),
  async execute(input) {
    return {
      kind: "call_script",
      drafted: true,
      leadId: input.leadId,
      purpose: input.callPurpose,
      note: "Use the model's prose output for the actual script — this tool just confirms the draft was produced.",
    };
  },
};

export const summarizeCallRecordingTool: HarwickToolDefinition = {
  name: "summarize_call_recording",
  description: "Pull the Retell call summary for a lead's most recent call. Returns the call's transcript summary + handoff brief + key facts captured. Use when the operator asks 'what did she say on the call' or before doing a follow-up touch.",
  scopes: ["operator_chat", "lead_conversation"],
  approval: "internal_safe",
  inputSchema: z.object({
    leadId: z.string().uuid(),
  }),
  async execute(input, deps: HarwickToolDeps) {
    const { data: events } = await deps.supabase
      .from("lead_events")
      .select("id, provider, event_type, text, occurred_at")
      .eq("workspace_id", deps.workspaceId)
      .eq("lead_id", input.leadId)
      .eq("provider", "retell" as never)
      .order("occurred_at", { ascending: false })
      .limit(3);

    if (events === null || events.length === 0) {
      return { kind: "call_summary", found: false, note: "No Retell call events recorded for this lead." };
    }

    return {
      kind: "call_summary",
      found: true,
      callCount: events.length,
      latest: {
        eventId: events[0]!.id,
        eventType: events[0]!.event_type,
        occurredAt: events[0]!.occurred_at,
        summary: events[0]!.text,
      },
      earlier: events.slice(1).map((event) => ({
        eventId: event.id,
        eventType: event.event_type,
        occurredAt: event.occurred_at,
      })),
    };
  },
};

export const CROSS_CHANNEL_TOOLS: HarwickToolDefinition[] = [
  sendSmsTool,
  draftEmailTool,
  draftCallScriptTool,
  summarizeCallRecordingTool,
];
