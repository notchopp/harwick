/** Server-safe initials helper. Use this from server components; the
 * `mobile-nav` client module re-exports the same function for client paths. */
export function initialsFor(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "HW";
}
