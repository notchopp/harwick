// Sentry edge-runtime bootstrap. Used for middleware + edge routes.
//
// Same no-op-when-DSN-missing-or-SDK-uninstalled contract as the server config.

const dsn = process.env["SENTRY_DSN"];

if (typeof dsn === "string" && dsn.length > 0) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require("@sentry/nextjs") as {
      init: (options: Record<string, unknown>) => void;
    };
    Sentry.init({
      dsn,
      environment: process.env["APP_ENV"] ?? process.env["NODE_ENV"],
      tracesSampleRate: 0,
      sendDefaultPii: false,
    });
  } catch {
    // SDK not installed — silently no-op.
  }
}
