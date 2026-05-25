# Environment Model

## Environments

- `development`: local app, local or sandbox providers, fake data allowed.
- `staging`: real deployed app with staging Supabase, staging webhook URLs, and provider test numbers/accounts where available.
- `production`: real customers, production provider credentials, production CRM writes.

## Rules

- Staging must not write to production Follow Up Boss accounts.
- Staging must not send SMS from production customer numbers unless explicitly testing a verified number.
- Staging must use a separate Meta app or clearly separated webhook configuration before customer onboarding.
- Production builds must fail on missing required secrets.
- Local development may use safe dummy fallbacks only for non-secret optional values.
- `.env.local` fallback is development/test-only. Staging and production readiness must come from deployed environment variables, not local files bundled or present on disk.

## Required Variables

Variables are tracked in `.env.example` and `.env.staging.example`. When adding a required variable, update both files and the environment reader.

`SUPABASE_ACCESS_TOKEN` is a local/admin automation secret for Supabase Management API work. It must not be exposed to client code and should not be required by the web runtime.

`RETELL_VOICE_ID` is required for provisioning workspace-owned voice agents. `RETELL_CONVERSATION_FLOW_TEMPLATE_ID` is an optional template override; when it is unset, Realty Ops creates the realty-specific conversation flow directly from code. Any configured Retell asset must be environment-specific and point at staging-safe assets outside production.

`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` configure the worker-side SMS sender used for approved nurture and open-house reminder deliveries. Staging must use Twilio test credentials or a staging-safe sender; production must use the customer-approved production sender.

`WORKER_ID`, `WORKER_POLL_INTERVAL_MS`, and `WORKER_BATCH_SIZE` configure the Fly-hosted background worker. The worker uses `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to client code.

`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the `STRIPE_*_PRICE_ID` variables are server-only billing configuration. Staging must use Stripe test-mode keys and test price IDs; production must use production Stripe assets. Stripe must deliver subscription webhooks to `/api/stripe/webhook`; the route verifies the raw `Stripe-Signature` header before reconciling `workspace_subscriptions`.

`RESEND_API_KEY` is optional and server-only. When present, workspace invitation creation sends invite email through Resend; when absent, the invite URL is still created and returned.

`SENTRY_DSN` is optional and server-only for API routes, workers, and server rendering. `NEXT_PUBLIC_SENTRY_DSN` is optional for browser-side error capture. Both must be environment-specific and must not be reused across staging and production if separate telemetry projects exist.

`GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, and `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI` configure member-scoped Google Calendar OAuth. The default redirect path is `/api/integrations/google-calendar/callback`. Calendar credentials are encrypted server-side and used for FreeBusy availability checks before Harwick proposes showing windows.

`AGENT_RECONCILE_CRON_SECRET` or `CRON_SECRET` must be configured in staging and production so scheduled agent-runtime routes can run without exposing unauthenticated cron endpoints.

`LAUNCH_PROVIDER_SMOKE_BASE_URL` points the provider smoke fixture at the deployed staging app. `LAUNCH_PROVIDER_SMOKE_REQUIRED=true` makes `npm run test:staging-provider-smoke` fail instead of skip when the deployed target is missing. `LAUNCH_PROVIDER_SMOKE_BYPASS_SECRET` can carry the Vercel deployment-protection automation bypass secret for protected preview/staging deployments. The fixture verifies public readiness, public system health, Meta webhook challenge, and a Retell signed no-op webhook path without writing provider data.

`LAUNCH_ENV_AUDIT_REQUIRED=true` makes `npm run launch:check` require `npm run launch:env:audit`, which inspects deployed Vercel environment variable names and fails on missing required launch configuration without printing secret values.

The launch readiness validator rejects staging when `STRIPE_SECRET_KEY` is not a Stripe test-mode key and rejects production when it is not a live-mode key. Staging and production must also configure Meta/Google OAuth redirect URIs and every plan price ID before launch.

## Release Gates

- CI runs `npm run release:check`.
- CI runs `npm run build`.
- `npm run launch:check` runs launch readiness fixtures, including runtime environment readiness checks.
- Database changes require a Supabase migration.
- Security-sensitive provider changes require a staging webhook test before production.
- Rollback notes are required before risky migrations or provider config changes.
