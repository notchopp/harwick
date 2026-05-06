import {
  WorkspaceMemoryReviewUpdateRequestSchema,
  type WorkspaceMemoryReviewStatus,
  type WorkspaceMemoryReviewUpdateRequest,
} from "@realty-ops/core";

export type WorkspaceMemoryReviewDraft = {
  memoryId: string;
  reviewStatus: WorkspaceMemoryReviewStatus;
  reviewNote: string;
};

export type WorkspaceMemoryReviewBuildResult =
  | { ok: true; request: WorkspaceMemoryReviewUpdateRequest }
  | { ok: false; error: string };

export function buildWorkspaceMemoryReviewRequest(
  draft: WorkspaceMemoryReviewDraft,
): WorkspaceMemoryReviewBuildResult {
  const trimmedNote = draft.reviewNote.trim();
  const parsed = WorkspaceMemoryReviewUpdateRequestSchema.safeParse({
    memoryId: draft.memoryId,
    reviewStatus: draft.reviewStatus,
    reviewNote: trimmedNote.length > 0 ? trimmedNote : null,
  });

  if (!parsed.success) {
    return { ok: false, error: "Memory review could not be saved." };
  }

  return { ok: true, request: parsed.data };
}

export function formatWorkspaceMemoryDate(value: string | null): string {
  if (value === null) {
    return "not observed";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function formatWorkspaceMemoryConfidence(value: number): string {
  return `${Math.round(value * 100)}% confidence`;
}

export function workspaceMemoryStatusLabel(value: WorkspaceMemoryReviewStatus): string {
  if (value === "approved") return "approved";
  if (value === "dismissed") return "dismissed";
  return "pending";
}
