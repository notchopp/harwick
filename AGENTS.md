# Realty Ops Agent Rules

Before changing code in this repo, read and follow:

- `docs/realty-ops-engineering-grail.md`
- `docs/realty-ops-product-memory.md`
- `docs/security-model.md`
- `docs/environment-model.md`
- `docs/integration-model.md`
- `docs/realty-ops-design-guide.md`
- `docs/codex-agent-constraints.json`

Use `docs/codex-agent-constraints.json` as the compact rule index. Read it every coding turn, apply the matching rule groups for the files being touched, and do not paste it into chat unless asked.

Non-negotiables:

- Product name is not final. Use `Realty Ops` as the repo/internal name only.
- Do not use `Kova`.
- This is a multi-tenant brokerage platform, not a one-off workflow.
- Shared contracts live in `packages/core`.
- Integration-specific normalization and signature helpers live in `packages/integrations`.
- API transport and response validation live in `packages/api-client`.
- Web app code lives in `apps/web`.
- Do not build prototype folders.
- Do not commit real tokens, API keys, access tokens, service-role keys, webhook secrets, or CRM credentials.
- Every structural change should pass `npm run release:check` once dependencies are installed.

Architecture rules:

- Domain schemas and cross-boundary DTOs belong in `packages/core/src/domains/*`.
- Webhook payload parsing, provider-specific mapping, and signature verification belongs in `packages/integrations`.
- Web route handlers should stay thin and call package services.
- Feature UI belongs under `apps/web/src/features/*`.
- Reusable product UI belongs under `apps/web/src/components/*`.
- Supabase migrations are the source of truth for DB changes.
- UI work must follow `docs/realty-ops-design-guide.md`: gray/white, shadcn/Radix primitives, and hand-built product components.

Testing rules:

- Add tests for schema parsing and normalization.
- Add tests for webhook payload classification.
- Add tests for assignment, scoring, nurture enrollment, and Follow Up Boss sync decisions.
- Add tests for API client URL/body behavior when a route contract is introduced.
- Do not skip tests because a screen is visual; keep model logic outside React components.
