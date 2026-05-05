import type { WorkspaceMemoryRuntimeDocument } from "../../lib/supabase/workspace-memory";

export function buildWorkspaceMemoryRuntimeContext(
  memories: WorkspaceMemoryRuntimeDocument[],
): string | null {
  const rendered = memories
    .map((memory, index) => {
      const confidence = Math.round(memory.confidence * 100);
      const observed = memory.lastObservedAt === null
        ? "observed date unknown"
        : `last observed ${memory.lastObservedAt.slice(0, 10)}`;
      return [
        `Memory ${index + 1}: ${memory.title}`,
        `Type: ${memory.memoryType}; confidence: ${confidence}%; ${observed}.`,
        memory.body.trim(),
      ].join("\n");
    })
    .filter((entry) => entry.trim().length > 0);

  if (rendered.length === 0) {
    return null;
  }

  return rendered.join("\n\n").slice(0, 8000);
}
