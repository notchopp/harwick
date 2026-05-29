import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * GTM-5: Twilio SMS dispatch from public + Harwick flows.
 *
 * Workspaces configure a Twilio account + a sending phone number in
 * workspace_voice_agents (already exists from the Retell wiring). This module
 * adds the SMS-send call against that same Twilio account.
 *
 * Usage: sendSms({ workspaceId, toPhone, body }) — looks up the workspace's
 * Twilio credentials + from-number, posts to the Twilio Messages API. Returns
 * { sid } on success or { error } on failure.
 *
 * Failure semantics: best-effort. Failed sends DO NOT throw — they log and
 * return error so the caller (Schedule popover, nurture worker, etc.) keeps
 * working. The lead_task row stays as-is; the SMS just doesn't fire.
 */

type TwilioCredentials = {
  accountSid: string;
  authToken: string;
  fromPhone: string;
};

async function getTwilioCredentials(workspaceId: string): Promise<TwilioCredentials | null> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  // workspace_phone_numbers + integration_accounts both hold parts of this;
  // we pull from integration_accounts (provider = 'twilio') for the credentials
  // and workspace_phone_numbers for the sending number.
  const { data: integration } = await untyped
    .from("integration_accounts")
    .select("encrypted_credentials")
    .eq("workspace_id", workspaceId)
    .eq("provider", "twilio")
    .eq("status", "connected")
    .maybeSingle();
  if (integration === null || integration === undefined) return null;

  const { data: phoneRow } = await untyped
    .from("workspace_phone_numbers")
    .select("phone_number")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true)
    .maybeSingle();
  if (phoneRow === null || phoneRow === undefined) return null;

  try {
    // decryptCredential is async; using dynamic import keeps the boundary clean.
    const { decryptCredential } = await import("../../lib/credentials");
    const secret = process.env["CREDENTIAL_ENCRYPTION_SECRET"] ?? "";
    const decrypted = decryptCredential<{ accountSid?: string; authToken?: string }>(
      integration.encrypted_credentials as string,
      secret,
    );
    if (typeof decrypted.accountSid !== "string" || typeof decrypted.authToken !== "string") return null;
    return {
      accountSid: decrypted.accountSid,
      authToken: decrypted.authToken,
      fromPhone: phoneRow.phone_number as string,
    };
  } catch {
    return null;
  }
}

export async function sendSms(params: {
  workspaceId: string;
  toPhone: string;
  body: string;
}): Promise<{ ok: true; sid: string } | { ok: false; error: string }> {
  const creds = await getTwilioCredentials(params.workspaceId);
  if (creds === null) return { ok: false, error: "twilio_not_configured" };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const auth = Buffer.from(`${creds.accountSid}:${creds.authToken}`).toString("base64");

  const formBody = new URLSearchParams({
    From: creds.fromPhone,
    To: params.toPhone,
    Body: params.body,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });
    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `twilio_${response.status}: ${text.slice(0, 120)}` };
    }
    const result = await response.json() as { sid?: string };
    return { ok: true, sid: result.sid ?? "unknown" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "send_failed" };
  }
}
