import { NextResponse, type NextRequest } from "next/server";
import { authorizeWorkspaceRequest } from "../../../../../../lib/api/workspace-auth";
import { createServerSupabaseClient } from "../../../../../../lib/supabase/server-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    workspaceId: string;
  }>;
};

const listingMediaAllowedRoles = new Set(["owner", "admin", "team_lead", "lead_manager", "operator", "agent"] as const);
const bucketName = "listing-media";
const maxFileBytes = 50 * 1024 * 1024;

function safeFileName(fileName: string) {
  const cleaned = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.length === 0 ? "listing-media" : cleaned;
}

function mediaKindForFile(file: File): "image" | "video" | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return null;
}

async function ensureListingMediaBucket() {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase.storage.getBucket(bucketName);
  if (data !== null) {
    return supabase;
  }

  const { error } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: `${maxFileBytes}`,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"],
  });
  if (error !== null && !/already exists/i.test(error.message)) {
    throw error;
  }

  return supabase;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { workspaceId } = await context.params;
  const membership = await authorizeWorkspaceRequest({
    request,
    workspaceId,
    allowedRoles: listingMediaAllowedRoles,
  });
  if (membership === null) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (formData === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const files = formData.getAll("files").filter((value): value is File => value instanceof File);
  if (files.length === 0 || files.length > 12) {
    return NextResponse.json({ error: "invalid_file_count" }, { status: 400 });
  }

  const supabase = await ensureListingMediaBucket();
  const uploaded: Array<{ kind: "image" | "video"; name: string; path: string; url: string }> = [];

  for (const file of files) {
    const kind = mediaKindForFile(file);
    if (kind === null) {
      return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
    }
    if (file.size > maxFileBytes) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }

    const path = `${workspaceId}/${kind}s/${crypto.randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage
      .from(bucketName)
      .upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
    if (error !== null) {
      throw error;
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
    uploaded.push({
      kind,
      name: file.name,
      path,
      url: data.publicUrl,
    });
  }

  return NextResponse.json({ media: uploaded }, { status: 200 });
}
