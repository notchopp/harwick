// Sentry server-side bootstrap. Initialized on every Node lambda / RSC.
//
// `SENTRY_DSN` is read from the server-only env. When undefined or the SDK
// isn't installed, this file is a no-op.

const dsn = process.env["SENTRY_DSN"];

type SentryEvent = { user?: { id?: string | undefined } | undefined };

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
      // Strip user PII proactively: even if a downstream caller forgets and
      // attaches an email/phone via setUser, drop everything except an `id`.
      beforeSend(event: SentryEvent) {
        if (event.user !== undefined) {
          const id = event.user.id;
          event.user = id === undefined ? undefined : { id };
        }
        return event;
      },
    });
  } catch {
    // SDK not installed — silently no-op.
  }
}
