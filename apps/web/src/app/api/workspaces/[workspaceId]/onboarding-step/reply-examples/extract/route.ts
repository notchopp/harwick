import { UuidSchema } from "@realty-ops/core";
import { NextResponse, type NextRequest } from "next/server";

import { authorizeWorkspaceRequest } from "../../../../../../../lib/api/workspace-auth";
import { getServerEnvironment } from "../../../../../../../lib/server-env";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Extract message text from an uploaded screenshot or text/PDF dump so the
 * operator doesn't have to retype every past reply by hand.
 *
 *  image/*      → OpenAI gpt-4o-mini vision parses the conversation, returns
 *                 only the operator-sent messages
 *  application/pdf → first-pass text extraction (server-side, no model)
 *  text/plain   → split on blank lines
 *
 * Returns `{ messages: string[] }` — the client wires each entry into a new
 * reply-example textarea so the operator can sanity-check before saving.
 */

const ALLOWED_ROLES = new Set(["owner", "admin", "team_lead", "lead_manager"] as const);
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB hard cap on a single upload
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const { workspaceId: rawWorkspaceId } = await context.params;
  const parsedWorkspaceId = UuidSchema.safeParse(rawWorkspaceId);
  if (!parsedWorkspaceId.success) {
    return NextResponse.json({ error: "invalid_workspace" }, { status: 400 });
  }

  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId: parsedWorkspaceId.data,
    allowedRoles: ALLOWED_ROLES,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let environment: ReturnType<typeof getServerEnvironment>;
  try {
    environment = getServerEnvironment();
  } catch {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file_required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "file_too_large", limit: MAX_BYTES }, { status: 413 });
  }

  const mimeType = file.type.toLowerCase();

  try {
    if (ALLOWED_IMAGE_TYPES.has(mimeType)) {
      if (environment.OPENAI_API_KEY === undefined) {
        return NextResponse.json({ error: "vision_unavailable" }, { status: 503 });
      }
      const messages = await extractFromImage(file, mimeType, environment.OPENAI_API_KEY);
      return NextResponse.json({ messages });
    }

    if (mimeType === "text/plain") {
      const text = await file.text();
      return NextResponse.json({ messages: splitTextIntoMessages(text) });
    }

    if (mimeType === "application/pdf") {
      // PDF support intentionally deferred — pdf-parse adds ~500KB and we
      // want to ship the image path first. Return a typed error so the
      // client can surface a friendly "PDF coming soon" hint.
      return NextResponse.json(
        { error: "pdf_not_yet_supported", message: "PDF extraction is coming soon. Paste the text for now." },
        { status: 415 },
      );
    }

    return NextResponse.json(
      { error: "unsupported_type", mimeType },
      { status: 415 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "extract_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

async function extractFromImage(
  file: File,
  mimeType: string,
  apiKey: string,
): Promise<string[]> {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const dataUri = `data:${mimeType};base64,${base64}`;

  const systemPrompt = [
    "You are parsing a screenshot of a real-estate agent's messaging conversation with a lead (Instagram DM, SMS, FB Messenger, WhatsApp, etc.).",
    "Identify which messages were sent BY THE AGENT (typically right-aligned, often the one asking qualification questions, scheduling tours, or sending follow-ups).",
    "Skip messages from the lead. Skip system/timestamp lines, read receipts, typing indicators.",
    "Return strict JSON in this shape: { \"messages\": [{ \"body\": string }] }",
    "Each `body` is the verbatim message text as the agent wrote it, including casing, punctuation, and emoji.",
    "If you cannot tell who is the agent, return BOTH sides and we will let a human filter.",
    "Return between 0 and 12 messages.",
  ].join(" ");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: systemPrompt },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1600,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenAI vision request failed: ${response.status} ${detail}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = json.choices?.[0]?.message?.content ?? "";

  try {
    const parsed = JSON.parse(content) as { messages?: Array<{ body?: unknown }> };
    const list = Array.isArray(parsed.messages) ? parsed.messages : [];
    return list
      .map((entry) => (typeof entry.body === "string" ? entry.body.trim() : ""))
      .filter((body): body is string => body.length >= 4)
      .slice(0, 12);
  } catch {
    // Fallback: split content into lines if the model returned plain text.
    return splitTextIntoMessages(content).slice(0, 12);
  }
}

function splitTextIntoMessages(text: string): string[] {
  return text
    .split(/\n{2,}|^\s*[-•]\s+/m)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 4)
    .slice(0, 20);
}
