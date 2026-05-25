// Sentry browser-side bootstrap. Loaded once on the client.
//
// Behavior:
//   - When SENTRY_DSN (exposed via NEXT_PUBLIC_SENTRY_DSN at build time) is
//     undefined / empty, the SDK never initializes and no events are emitted.
//   - We disable session replay & default integrations that send PII.
//
// The dependency is resolved at runtime so this file remains valid even if
// `@sentry/nextjs` has not yet been installed.

const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];

if (typeof dsn === "string" && dsn.length > 0) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as {
      init: (options: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      environment: process.env["NEXT_PUBLIC_APP_ENV"] ?? process.env["NODE_ENV"],
      // Performance tracing off by default — turn on per-route if needed.
      tracesSampleRate: 0,
      // Replay disabled to avoid accidental PII capture (lead phone/email visible on UI).
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      sendDefaultPii: false,
    });
  } catch {
    // SDK not installed — silently no-op.
  }
}
