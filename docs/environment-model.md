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

## Required Variables

Variables are tracked in `.env.example` and `.env.staging.example`. When adding a required variable, update both files and the environment reader.

`SUPABASE_ACCESS_TOKEN` is a local/admin automation secret for Supabase Management API work. It must not be exposed to client code and should not be required by the web runtime.

`RETELL_CONVERSATION_FLOW_TEMPLATE_ID` and `RETELL_VOICE_ID` are provisioning inputs for workspace-owned voice agents. They are environment-specific and must point at staging-safe Retell assets outside production.

`WORKER_ID`, `WORKER_POLL_INTERVAL_MS`, and `WORKER_BATCH_SIZE` configure the Fly-hosted background worker. The worker uses `SUPABASE_SERVICE_ROLE_KEY`; never expose that key to client code.

## Release Gates

- CI runs `npm run release:check`.
- CI runs `npm run build`.
- Database changes require a Supabase migration.
- Security-sensitive provider changes require a staging webhook test before production.
- Rollback notes are required before risky migrations or provider config changes.
