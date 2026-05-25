/**
 * Shared Sentry wrapper. Encapsulates PII-safe tagging conventions and the
 * "Sentry SDK might not be installed" gating so callers don't have to think
 * about it.
 *
 * Rules baked in:
 *   - Never tag raw phone, email, or message body. Hash via SHA-256 if you
 *     need a stable identifier.
 *   - Workspace / lead / job IDs are UUIDs and considered safe.
 *   - When SENTRY_DSN is unset (dev / unconfigured), every call is a no-op.
 *
 * We resolve the SDK via dynamic require so the package stays soft-optional —
 * builds still succeed when the dependency hasn't been installed yet.
 */
import { createHash } from "node:crypto";

export type CriticalScopeContext = {
  workspaceId?: string | null;
  leadId?: string | null;
  jobId?: string | null;
  /** Free-form route or worker tag, e.g. "stripe/webhook". */
  surface: string;
  /** Optional structured extras. Strip any PII before passing. */
  extra?: Record<string, unknown>;
};

/**
 * Stable SHA-256 hash for identifiers that would otherwise be PII (phone,
 * email). Truncated to 16 hex chars — plenty for cardinality, never reversible.
 */
export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

type SentryScope = {
  setTag(key: string, value: string): void;
  setExtra(key: string, value: unknown): void;
};
type SentryModule = {
  withScope(callback: (scope: SentryScope) => void): void;
  captureException(error: unknown): void;
};

let cachedSentry: SentryModule | null | undefined;

function loadSentry(): SentryModule | null {
  if (cachedSentry !== undefined) {
    return cachedSentry;
  }
  const dsn = process.env["SENTRY_DSN"];
  if (typeof dsn !== "string" || dsn.length === 0) {
    cachedSentry = null;
    return null;
  }
  try {
    // Resolve at runtime so the dep stays optional at build time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedSentry = require("@sentry/nextjs") as SentryModule;
  } catch {
    cachedSentry = null;
  }
  return cachedSentry;
}

export function captureCriticalException(error: unknown, ctx: CriticalScopeContext): void {
  const sentry = loadSentry();
  if (sentry === null) return;
  try {
    sentry.withScope((scope) => {
      scope.setTag("surface", ctx.surface);
      if (ctx.workspaceId !== undefined && ctx.workspaceId !== null) {
        scope.setTag("workspace_id", ctx.workspaceId);
      }
      if (ctx.leadId !== undefined && ctx.leadId !== null) {
        scope.setTag("lead_id", ctx.leadId);
      }
      if (ctx.jobId !== undefined && ctx.jobId !== null) {
        scope.setTag("job_id", ctx.jobId);
      }
      if (ctx.extra !== undefined) {
        for (const [key, value] of Object.entries(ctx.extra)) {
          scope.setExtra(key, value);
        }
      }
      sentry.captureException(error);
    });
  } catch {
    // Sentry must never crash the request path. Swallow.
  }
}
