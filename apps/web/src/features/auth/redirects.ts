export function normalizeAuthRedirect(input: string | null, fallback = "/home"): string {
  if (input === null || input.trim().length === 0) {
    return fallback;
  }

  if (!input.startsWith("/") || input.startsWith("//")) {
    return fallback;
  }

  if (input.startsWith("/auth/") || input.startsWith("/api/")) {
    return fallback;
  }

  return input;
}
