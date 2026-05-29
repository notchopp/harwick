import { createHash } from "node:crypto";

/**
 * Deterministic, order-independent hash for cache keys.
 *
 * Used everywhere a judgment-tool input needs to map to a brief cache row.
 * If the hash matches the cached `state_hash`, the brief is still fresh.
 * If it mismatches, regen is queued.
 *
 * Property order on objects is normalized via sortedJsonStringify so
 * `{a: 1, b: 2}` and `{b: 2, a: 1}` produce the same hash.
 *
 * Returns 16-char hex (64 bits) — collision-resistant enough for
 * per-(workspace, entity) cache keys, short enough to read in logs.
 */
export function stateHash(input: unknown): string {
  const canonical = sortedJsonStringify(input);
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/**
 * Compose an audience+destination hash for cache row keying. The brief row
 * is `(workspace, entity_type, entity_id, audience_hash, destination)` so
 * this gives us the audience part as a stable string.
 */
export function audienceHash(audience: unknown): string {
  return stateHash(audience);
}

function sortedJsonStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "undefined") return "null";
  if (typeof value === "bigint") return JSON.stringify(value.toString());
  if (Array.isArray(value)) {
    return `[${value.map(sortedJsonStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${sortedJsonStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return "null";
}
