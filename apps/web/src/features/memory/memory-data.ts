import type { WorkspaceMemoryRuntimeDocument } from "../../lib/supabase/workspace-memory";

/**
 * The five memory types Harwick currently distills into
 * workspace_memory_documents. Anything outside this list still renders, but
 * falls into the "other" bucket so a future memory_type doesn't disappear.
 */
export const MEMORY_TYPE_ORDER = [
  "pattern",
  "routing",
  "objection",
  "market",
  "policy_signal",
] as const;

export type MemoryTypeKey = (typeof MEMORY_TYPE_ORDER)[number];

export type MemoryGroup = {
  key: MemoryTypeKey | "other";
  label: string;
  description: string;
  documents: WorkspaceMemoryRuntimeDocument[];
};

const MEMORY_TYPE_META: Record<MemoryTypeKey, { label: string; description: string }> = {
  pattern: {
    label: "patterns",
    description: "recurring shapes harwick noticed in your leads and conversations.",
  },
  routing: {
    label: "routing",
    description: "who tends to own which leads, and when operators override harwick.",
  },
  objection: {
    label: "objections",
    description: "the worries buyers keep raising — financing, timing, location, partners.",
  },
  market: {
    label: "market",
    description: "where leads are coming from, what they want, what they can pay.",
  },
  policy_signal: {
    label: "policy",
    description: "guardrails and house rules harwick is following until you change them.",
  },
};

const OTHER_META = {
  label: "other",
  description: "memory types harwick is still learning to categorize.",
};

/**
 * Group a flat list of runtime memory documents by memory_type, in display
 * order. Empty groups are dropped so the page can render only what exists.
 */
export function groupMemoriesByType(
  documents: WorkspaceMemoryRuntimeDocument[],
): MemoryGroup[] {
  const byType = new Map<string, WorkspaceMemoryRuntimeDocument[]>();
  for (const doc of documents) {
    const bucket = byType.get(doc.memoryType) ?? [];
    bucket.push(doc);
    byType.set(doc.memoryType, bucket);
  }

  const groups: MemoryGroup[] = [];

  for (const key of MEMORY_TYPE_ORDER) {
    const docs = byType.get(key);
    if (docs === undefined || docs.length === 0) continue;
    groups.push({
      key,
      label: MEMORY_TYPE_META[key].label,
      description: MEMORY_TYPE_META[key].description,
      documents: docs,
    });
    byType.delete(key);
  }

  const otherDocs: WorkspaceMemoryRuntimeDocument[] = [];
  for (const docs of byType.values()) {
    otherDocs.push(...docs);
  }
  if (otherDocs.length > 0) {
    groups.push({
      key: "other",
      label: OTHER_META.label,
      description: OTHER_META.description,
      documents: otherDocs,
    });
  }

  return groups;
}

/** Format a 0–1 confidence as a 0–100% integer string. */
export function formatConfidence(value: number): string {
  if (Number.isNaN(value)) return "0%";
  const clamped = Math.max(0, Math.min(1, value));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Relative "observed N ago" label, anchored at `now` so tests are deterministic.
 * Returns "just now" for <1m and "never" if no timestamp was recorded.
 */
export function formatLastObserved(value: string | null, now: Date): string {
  if (value === null) return "never";
  const observed = new Date(value);
  const observedMs = observed.getTime();
  if (Number.isNaN(observedMs)) return "never";
  const diffMs = now.getTime() - observedMs;
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}
