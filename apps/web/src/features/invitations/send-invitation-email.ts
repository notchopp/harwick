/**
 * Resend transactional email for workspace invitations.
 *
 * We talk to the Resend REST API directly so we don't add another dependency
 * (the official SDK is just a fetch wrapper). If RESEND_API_KEY is missing
 * the helper is a no-op that warns once and returns `skipped` — invitation
 * creation must NEVER fail because email failed.
 *
 * Brand voice is lowercase: warm, casual, never "the AI". See the project
 * brand-positioning memory.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "Harwick <invites@harwick.lol>";

export type SendInvitationEmailParams = {
  to: string;
  workspaceName: string;
  inviterDisplayName: string | null;
  inviteUrl: string;
  apiKey: string | undefined;
  fromAddress?: string;
  fetchImpl?: typeof fetch;
};

export type SendInvitationEmailResult =
  | { status: "sent"; providerMessageId: string | null }
  | { status: "skipped"; reason: "no_api_key" }
  | { status: "failed"; statusCode: number | null; message: string };

export type InvitationEmailPayload = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildInvitationEmailPayload(params: {
  to: string;
  workspaceName: string;
  inviterDisplayName: string | null;
  inviteUrl: string;
  fromAddress?: string;
}): InvitationEmailPayload {
  const inviterLabel = params.inviterDisplayName !== null && params.inviterDisplayName.trim().length > 0
    ? params.inviterDisplayName.trim()
    : "someone on the team";

  const subject = `${params.workspaceName} invited you to Harwick`;

  const text = [
    `hey — ${inviterLabel} just added you to ${params.workspaceName} on harwick.`,
    "",
    `click this link to set up your account: ${params.inviteUrl}`,
    "",
    "takes about 90 seconds.",
    "",
    "— harwick",
  ].join("\n");

  const safeInviter = escapeHtml(inviterLabel);
  const safeWorkspace = escapeHtml(params.workspaceName);
  const safeUrl = escapeHtml(params.inviteUrl);

  const html = [
    "<!doctype html>",
    "<html><body style=\"margin:0;padding:24px;background:#f5f3ef;font-family:-apple-system,Segoe UI,system-ui,sans-serif;color:#1a1a1a\">",
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" width=\"100%\" style=\"max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e9e6df;border-radius:14px;padding:32px\">",
    "<tr><td>",
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">hey — <strong>${safeInviter}</strong> just added you to <strong>${safeWorkspace}</strong> on harwick.</p>`,
    `<p style="margin:0 0 22px;font-size:15px;line-height:1.55">click this link to set up your account:</p>`,
    `<p style="margin:0 0 22px"><a href="${safeUrl}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px;font-weight:600">set up your account</a></p>`,
    `<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#5b5b5b">or paste this URL in your browser:<br><span style="word-break:break-all;color:#1a1a1a">${safeUrl}</span></p>`,
    `<p style="margin:18px 0 0;font-size:13px;line-height:1.5;color:#5b5b5b">takes about 90 seconds.</p>`,
    `<p style="margin:18px 0 0;font-size:12px;color:#8a8a8a">— harwick</p>`,
    "</td></tr>",
    "</table>",
    "</body></html>",
  ].join("");

  return {
    from: params.fromAddress ?? DEFAULT_FROM,
    to: params.to,
    subject,
    text,
    html,
  };
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams,
): Promise<SendInvitationEmailResult> {
  if (params.apiKey === undefined || params.apiKey.trim().length === 0) {
    console.warn("[invitation-email] RESEND_API_KEY is not set — skipping invitation email");
    return { status: "skipped", reason: "no_api_key" };
  }

  const payload = buildInvitationEmailPayload({
    to: params.to,
    workspaceName: params.workspaceName,
    inviterDisplayName: params.inviterDisplayName,
    inviteUrl: params.inviteUrl,
    ...(params.fromAddress === undefined ? {} : { fromAddress: params.fromAddress }),
  });

  const fetchImpl = params.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${params.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        status: "failed",
        statusCode: response.status,
        message: `Resend returned ${response.status}: ${detail}`,
      };
    }

    const json = (await response.json().catch(() => null)) as { id?: string } | null;
    return { status: "sent", providerMessageId: json?.id ?? null };
  } catch (error) {
    return {
      status: "failed",
      statusCode: null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
