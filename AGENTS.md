# Realty Ops Agent Rules

Before changing code in this repo, read and follow:

- `docs/realty-ops-engineering-grail.md`
- `docs/realty-ops-product-memory.md`
- `docs/security-model.md`
- `docs/environment-model.md`
- `docs/integration-model.md`
- `docs/realty-ops-design-guide.md`
- `docs/paid-launch-map.md`
- `docs/codex-agent-constraints.json`

Use `docs/codex-agent-constraints.json` as the compact rule index. Read it every coding turn, apply the matching rule groups for the files being touched, and do not paste it into chat unless asked.

Use `docs/paid-launch-map.md` as the execution spine from current state to paid launch. At the start of each coding turn, pick the highest-priority incomplete launch item from that map unless the user explicitly redirects. When a slice moves from partial to done, update the map in the same turn.

## North star: AI is the engine, not a feature

Harwick is an AI agent that calls infrastructure when it needs to act. It is not a workflow engine that calls AI when it needs language. Every architectural decision should reinforce that inversion.

- The model owns the loop. Code provides capabilities (tools), not rules about when AI is allowed to speak.
- Policy lives in context, not in functions. Broker preferences become a prose `policy_narrative` injected into the system prompt; tool descriptions carry their own permission semantics. Deterministic policy evaluators are a transitional layer running in shadow mode until model self-gating is validated, then deleted.
- Memory lives in a single living document per lead, not in scattered structured fields fed back through a state machine. Structured columns survive as derived extracts for FUB sync, routing, and filtering — not as the source of truth the model reasons over.
- Retrieval is semantic. Listings, neighborhoods, agent bios, and workspace knowledge are embedded with pgvector and reached through similarity search, not deterministic filters.
- Perception extends beyond text. Social-post images run through a vision pass before the agent sees the lead.
- Multi-step behavior comes from an agentic loop wrapping existing tools, not from new tool infrastructure.
- Operator control is preserved through context and tool design, not imperative logic. Pause, resume, take-over, release, dismiss, approve — all unchanged. They are features, not limitations.
- Progress is measured in lines deleted. Every shadow-mode validation that succeeds shrinks the codebase. The deletion roadmap (`evaluateHarwickAiAutomation`, `HarwickAiStatePatchSchema`, `HarwickAiConversationStateSchema` as runtime input, `deriveHarwickAiTurnPersistenceStatus`, `deriveHarwickAiToolPolicyStatus`, the 9-field `HarwickAiRuntimeInputSchema` assembly) is the milestone, not feature counts.
- The moat is the corpus. Every conversation that runs through Harwick generates training signal for a future fine-tune. Treat `conversation_messages`, `lead_events`, `lead_documents`, and `audit_logs` as long-lived training data. Never delete; always scope by workspace.

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
