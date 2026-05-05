# Paid Launch Map

This is the operating map from current state to paid Harwick launch. Use it at the start of every Codex turn after reading `AGENTS.md` and `docs/codex-agent-constraints.json`.

The goal is not to build isolated screens or isolated APIs. The goal is a paid, multi-tenant operating system where a real estate workspace can connect channels, let Harwick handle inbound demand, see every active conversation and task, step in when needed, and trust qualified leads to sync to Follow Up Boss.

## How To Use This Map

At the start of each coding turn:

1. Read this file.
2. Check the Current Build State section.
3. Choose the highest-priority incomplete item from the Execution Spine unless the user explicitly redirects.
4. Keep changes inside repo boundaries:
   - shared contracts in `packages/core`
   - provider and AI adapters in `packages/integrations`
   - route handlers thin under `apps/web/src/app`
   - feature services/UI under `apps/web/src/features`
   - reusable UI under `apps/web/src/components`
   - database changes under `supabase/migrations`
5. Update this file when a slice moves from `partial` to `done`.
6. Run targeted tests during iteration and `npm run release:check` plus `npm run build` after structural changes.

## Launch Definition

Paid launch means:

- a workspace can sign in and has protected tenant boundaries
- owner/admin/agent roles are enforced in routes, APIs, and UI
- Meta intake can receive comments/DMs, create or update leads, run Harwick AI, and send or queue replies based on policy
- Harwick AI state, policy decisions, tool calls, and human takeover are persisted per conversation
- work queue, leads, conversations, listings, integrations, and health surfaces are backed by real records
- internal listings and public listings feed the same lead intake system
- Follow Up Boss sync is connected, observable, retryable, and failure-safe
- calendar/showing flows work if they are sold as part of the launch package
- billing and plan gates prevent overuse and make upgrading clear
- reliability controls exist for idempotency, rate limits, audit logs, provider errors, and staging/prod separation

## Current Build State

Status values:

- `done`: implemented and backed by tests or direct verification
- `partial`: exists but needs persistence, auth/RLS, production path, or UI/API closure
- `not started`: no real implementation yet

| Area | Status | Current Evidence | Remaining Gap |
| --- | --- | --- | --- |
| Monorepo boundaries | done | `apps/web`, `apps/worker`, `packages/core`, `packages/integrations`, `packages/api-client`, `supabase/migrations` | Keep all new work in the established boundaries. |
| Product docs and guardrails | done | engineering grail, product memory, security model, integration model, design guide, constraints file | Keep this map current as launch state changes. |
| Supabase auth UI | partial | minimal `/login` exists | Enforce auth in app routes, server APIs, workspace resolution, and role-aware redirects. |
| Workspace membership and roles | partial | workspace/member concepts exist | Complete owner/admin/team lead/agent/operator access model and API enforcement. |
| RLS and tenant boundaries | partial | migrations and workspace scoping exist | Audit all tenant tables, add missing policies, test owner/assigned/unassigned/outsider access. |
| Meta intake | done | webhook intake, normalization, post context, reply send, social queue exist, E2E flow verified with real IG DMs | Continue with production signature checks, OAuth connection, and real approval/send loop. |
| Harwick AI runtime | partial | typed runtime, local/OpenAI adapters, tool contracts, automation policy, tool executor exist | Persist full turns, tool execution records, state patches, policy decisions, and production auto-send results. |
| Harwick proactive insight feed | partial | `harwick_work_items` exists; `/api/agent-runtime/insights` cron producer surfaces ambiguous inbound, unassigned priority leads, dormant active leads, and workspace memory patterns; `/home` shows member/role-filtered insights with seen/dismiss actions and feedback labels | Add richer model-distilled insight narratives beyond the current memory-pattern producer. |
| Harwick workspace memory | partial | `workspace_memory_documents` table, typed contract, repository, `/api/agent-runtime/workspace-memory` distillation worker, embedding persistence, semantic pgvector retrieval, and Harwick runtime prompt injection exist for repeated routing override patterns | Broaden distillation beyond routing overrides. |
| Conversation-scoped AI control | partial | `conversation_automation_states` migration and UI controls exist | Enforce before every send path and expose admin/agent-safe controls consistently. |
| Conversations page | partial | conversation data contracts and sandbox/test utilities exist | Bind to live conversation records, realtime or polling updates, message send, takeover, resume, and transcript timeline. |
| Work queue | partial | social/voice/operator queue concepts exist | Ensure every queue action is backed by a real API mutation and audit event. |
| Leads page | partial | list/card views, detail sheets, lead timeline API, actionability contracts exist | Finish role-filtered views, consistent sheet timeline, routing actions, and persisted qualification updates. |
| Routing engine | partial | assignment decisions and routing concepts exist | Add full member routing profiles, capacity/availability, source credit, round-robin fallback, and override audit. |
| Internal listings | partial | listing facts, CSV import, quick update, verify, media upload route, list/card UI exist | Finish media storage path, operator actions, pagination/list view, and public/private state. |
| Public listings | partial | public workspace listing surface exists | Finalize detail viewer, inquiry creation, showing/open-house CTA, template variants, and listing-aware intake. |
| Follow Up Boss | partial | sync, back-sync, logs, webhook subscription foundation exist | Harden connection setup, credential storage UX, conflict surfacing, retry/replay, and worker-only production writes. |
| Calendar/showings | not started | product model documented | Google calendar connection, member availability, showing modes, approval flow, booking writes, reminders. |
| Open houses | partial | product model and AI tool contract exist | Registration endpoint, attendee list, reminders, timeline/FUB sync. |
| Nurture execution | partial | opt-out, quiet-hour, scheduling, jobs, reviewable drafts exist | Delivery provider wiring, receipts, approve/send/dismiss APIs, production controls. |
| Voice operations | partial | Retell provisioning/context/tools/handoffs exist | Transcript-safe queue fields, post-call analysis, callback actions, production webhook validation. |
| Integrations page | partial | Meta, FUB, calendar-facing UI surfaces exist | Real OAuth/key save/test flows, encrypted credentials, statuses, reconnect flows. |
| System health | partial | `/api/health/readiness`, `/api/health/systems` exist | Bind all UI health cards to product-safe health and add worker/provider failure detail where allowed. |
| Billing/plans | partial | subscription tables, plan schemas, usage events, plan capability contracts exist | Stripe or billing provider integration, upgrade UI, billing admin page. |
| Usage metering | partial | usage event tables, usage summary aggregation, plan gate service exist | Usage recording from real events, overage handling, upgrade prompts. |
| Reliability hardening | partial | job model, provider errors, release gates, audit logs exist | Idempotency pass, rate limits, staging/prod config checks, rollback notes. |
| Launch test harness | partial | AI conversation test plan exists | Full funnel command: inbound event -> AI -> queue/send -> lead -> route -> FUB sync. |

## Execution Spine

Work through these in order unless a blocker requires a prerequisite.

### 1. Auth, Roles, And Tenant Boundaries

Status: `done`

Undeniables:

- Supabase auth protects all app pages except public listing pages and login.
- Every API derives user and workspace from server-side auth, not client trust.
- Users can belong to multiple workspaces.
- Roles are owner, admin/team lead, agent, operator/ISA, and viewer/assistant.
- Normal signup cannot self-select admin-level roles.
- RLS is enabled and tested for all workspace-owned tables.

Build items:

- server auth helper for route handlers and server components
- workspace/member resolver
- role capability helper in `packages/core`
- route protection for app pages
- RLS audit migration for newer tables
- RLS tests for owner, assigned agent, unassigned member, outsider

### 2. Harwick AI Persistence And Policy Execution

Status: `partial`

Undeniables:

- Every AI turn is persisted.
- Every tool call records requested action, policy decision, execution result, and reason.
- AI automation is scoped per conversation.
- Human takeover pauses only that conversation.
- Resume restores AI with full context.
- Every outbound send checks automation mode and policy first.

Build items:

- `harwick_ai_turns` table
- `harwick_ai_tool_calls` table
- persisted automation policy records for workspace/member/conversation scopes
- production executor path for policy-approved social sends
- tests for auto-send, approval-required, blocked, takeover, resume

### 3. Meta Intake End To End

Status: `done`

Undeniables:

- Instagram/Facebook event creates or updates conversation and lead idempotently.
- Harwick AI runs against the correct workspace, channel, listing/post context, and tone profile.
- Safe replies auto-send when policy allows.
- Approval-required replies appear in the operator queue with real send/edit/dismiss actions.
- Send failures are logged and retryable.

Build items:

- Meta OAuth connection flow
- encrypted provider credential storage path
- production signature verification
- event idempotency tests
- AI worker job or server-side execution path
- queue action endpoints and audit logs

### 4. Conversations Workspace

Status: `partial`

Undeniables:

- Conversation transcript is real and scrollable.
- Human messages and AI messages are distinguishable.
- Typing/working states reflect real pending work or deterministic local state.
- Qualification tags update from persisted qualification state.
- Agent can take over, send, edit/send suggestion, and resume AI.

Build items:

- ✅ message send API (POST /api/conversations/[conversationId]/messages)
- ✅ live lead-scoped messages API (GET/POST /api/workspaces/[workspaceId]/conversations/[leadId]/messages)
- ✅ lead-scoped automation API (PATCH /api/workspaces/[workspaceId]/conversations/[leadId]/automation)
- ✅ unified lead action toolbar mounted in conversations, home queue, and leads detail sheets
- ✅ conversation automation state enforcement in send path
- ✅ tests for send validation, auth, automation checks, and Meta integration
- conversation timeline aggregation
- AI state strip attached to conversation
- realtime subscription or polling strategy
- tests for scoped takeover before send

### 5. Leads, Routing, And Team Views

Status: `done`

Undeniables:

- Leads expose intent, timeline, budget, area, property type, buyer/seller/renter status, score, assignment, source credit, last action, and next action.
- Owner/admin can see workspace-wide leads.
- Agent sees assigned/permitted leads.
- Routing is explainable and auditable.
- Source owner/rainmaker credit is separate from assigned agent.
- Agent routing profiles persist and drive assignment decisions.

Build items:

- ✅ agent routing profiles table (migration + RLS policies)
- ✅ routing profile repository layer with CRUD operations
- ✅ routing profile API endpoints (GET, POST, PUT, DELETE)
- ✅ routing engine for area, type, property type, price, capacity, availability, source ownership, round-robin
- ✅ routing profile schemas and tests
- ✅ manual override with audit
- ✅ role-filtered leads endpoint
- ✅ lead detail sheet parity with work queue timeline

### 6. Listings And Public Inventory

Status: `done`

Undeniables:

- Internal listing cards reuse public listing card language with operator actions.
- Users can add/edit listings and upload photos/videos.
- Listing facts are what Harwick uses for answers.
- Harwick never invents missing listing facts.
- Public listing inquiry creates or updates a lead/conversation.

Build items:

- ✅ public inquiry endpoint
- storage bucket and signed upload flow
- listing media persistence
- listing detail viewer
- showing/open-house CTA path
- listing-aware AI context from internal facts
- pagination/list view for internal inventory

### 7. Follow Up Boss

Status: `partial`

Undeniables:

- FUB stays CRM of record.
- Qualified leads sync through worker jobs, not slow webhook routes.
- Credential save/test is server-only and encrypted.
- Sync status and failures are visible.
- Retry and conflict handling are auditable.

Build items:

- ✅ connection test endpoint
- ✅ key save with encryption confirmation
- worker-only sync enforcement
- conflict surfacing
- retry/replay controls
- ✅ tests for URL/body behavior and failure cases

### 8. Calendar, Showings, And Open Houses

Status: `not started`

Undeniables:

- Default showing mode is request + approve.
- Auto-book is opt-in.
- Showing automation respects qualification threshold and agent/listing preferences.
- Open house registration is automated by default.
- Calendar availability belongs to workspace members, not just the workspace.

Build items:

- Google Calendar OAuth
- member calendar connection model
- showing preferences model
- availability lookup tool handler
- showing approval task
- booking confirmation and calendar write
- open house registration endpoint
- attendee list and reminders

### 9. Billing, Plan Gates, And Usage

Status: `partial`

Undeniables:

- Solo, Team, and Brokerage plans are modeled as gates, not just pricing copy.
- Hard gates hide unavailable actions.
- Usage gates track limits and overages.
- Visibility gates hide higher-tier admin panels.

Build items:

- ✅ subscription tables (workspace_subscriptions, workspace_usage_events, workspace_usage_summaries)
- ✅ plan capability contracts (solo/team/brokerage limits in packages/core)
- ✅ usage counters (event recording, aggregation function)
- ✅ seats/social/listings/AI turns/message limits (checkUsageLimit, checkSeatLimit, checkListingLimit)
- ✅ server-side plan gate applied to listings POST endpoint
- ✅ tests for billing domain schemas and plan gate logic
- billing provider integration (Stripe or alternative)
- upgrade prompts
- billing admin UI

### 10. Reliability And Launch Harness

Status: `partial`

Undeniables:

- Inbound webhooks and outbound sends are idempotent.
- Public-ish routes are rate-limited.
- Provider errors are logged without secrets.
- Admin overrides and AI sends are audited.
- Staging and production cannot accidentally cross-write provider accounts.
- One command proves the core funnel.

Build items:

- idempotency coverage pass
- rate-limit middleware or route helpers ✓ (exists)
- audit log table and helpers ✓ (completed)
- provider error standardization ✓ (exists)
- staging/prod config checks
- rollback notes for risky migrations
- full-funnel local/staging test harness

## AI-Native Migration Track

This is a parallel track to the launch spine above. It is not gated by launch — semantic listings and vision ship pre-launch because they are immediately product-positive and zero-risk. Policy narrative and living lead document ship as v1 work that runs in shadow mode against the existing path. Agentic loop is v2 north star. Each step is independently shippable and reversible.

The frame: Harwick is becoming an AI agent that calls infrastructure when it needs to act, not a workflow engine that calls AI when it needs language. Progress is measured in lines deleted from the existing policy/state-machine layer, not in features added. See `AGENTS.md` north-star section for principles.

Current AI-native completion estimate: **56%**.

Recently completed:

- Capability 7: cheap small-model tier for classifier/lite reasoning path.
- Capability 8: lead-or-not gate before the full Harwick loop, with `needs_review` fallback.
- Capability 3 foundation: proactive insight producer writes durable `harwick_work_items.item_type = 'insight'` from live tables and targets operator/team lead/assigned agent surfaces.
- Capability 3 surface: `/api/home` returns member/role-filtered Harwick insights and `/home` can mark them seen or dismissed.
- Capability 1 foundation: workspace-level memory table and distillation worker now capture repeated routing override patterns across leads.
- Capability 1 runtime use: Harwick now retrieves recent workspace memories and injects them into the model prompt as brokerage-wide soft context.
- Capability 1 semantic retrieval: workspace memories are embedded when distilled and semantically matched against the current inbound plus lead document before prompt injection.
- Capability 3 pattern insights: proactive insight producer now surfaces workspace memory patterns to team leads and captures operator feedback labels on Harwick work-item actions.
- Capability 2 foundation: conversations now expose a live Harwick synthesis strip from persisted `harwick_ai_turns` with intent, next action, confidence, missing fields, handoff brief, and document update.

Still open before this becomes “fully AI native”:

- Broader workspace-level memory distillation beyond routing overrides.
- Realtime or polling refresh for progressive synthesis while Harwick is actively running.
- Standing instructions as natural-language policy.
- Subagent dispatch and tool registry prompt construction.
- Richer model-distilled proactive insight narratives beyond the current workspace memory pattern producer.

### Step 1: Semantic listing search (pgvector)

Status: `partial`

Replaces: deterministic listing lookup (`features/listings/listing-lookup.ts`, Retell `lookup_listing` tool).

What lands:

- Supabase migration enabling `pgvector` extension and adding `embedding vector(1536)` column on `listing_facts`.
- Embedding client in `packages/integrations/src/openai-embeddings.ts` (text-embedding-3-small).
- Worker hook on listing insert/update generates and persists embedding.
- Semantic similarity search in `listing-lookup.ts` (cosine distance, top-N with similarity scores).
- Retell `lookup_listing` tool routes through the same path.

Risk: zero — additive column, falls back to existing path if embedding is null.

### Step 2: Vision on social intake

Status: `partial`

Replaces: text-only `HarwickAiPostContextSchema`.

What lands:

- Vision-capable model client (Claude or GPT-4o vision).
- In `meta-to-harwick-ai-bridge.ts`, fetch post media, pass image URL to vision call, append response paragraph to lead context.
- New `post_visual_description` field surfaces in the runtime input until shift 4 collapses it into `lead_document`.

Risk: low — ~2¢ per intake, gated by feature flag, gracefully degrades to text-only if vision call fails.

### Step 3: Policy narrative + shadow mode

Status: `partial`

Replaces: `evaluateHarwickAiAutomation()` once shadow-mode disagreement is < 5%.

What lands:

- New `policy_narrative text` column on `workspaces`.
- Generator function in `packages/core/src/domains/policy-narrative.ts` converts existing `HarwickAiAutomationPolicy` rows to plain English.
- System prompt builder injects narrative on every turn.
- Each tool definition in `packages/integrations/src/harwick-ai-tools.ts` carries permission semantics in its `description` field.
- Shadow comparison logs every disagreement between deterministic gate and model self-gating into `audit_logs` with action `harwick_ai_policy_shadow`.
- Feature flag `HARWICK_AI_POLICY_SOURCE` defaults to `deterministic`; flips to `model_self_gate` after validation.

Deletion target after validation: `harwick-ai-automation-policy.ts` (~144 lines), `executeHarwickAiTurnWithPolicy`, `HarwickAiAutomationDecisionSchema`, derived persistence statuses.

### Step 4: Living lead document

Status: `partial`

Replaces: `HarwickAiConversationStateSchema` as runtime input, `HarwickAiStatePatchSchema` and patch application logic.

What lands:

- New `lead_document text` column on `leads`.
- Turn output gains an optional `documentUpdate` field (prose append).
- `harwick-ai-turn-executor.ts` writes `documentUpdate` to `leads.lead_document` after each turn (concatenate with separator).
- Runtime input feeds the document to the model as primary context; structured fields remain in the input during transition for sanity checking.
- Comparison logged when document-derived extract diverges from structured patch — second shadow loop.

Deletion target after validation: `HarwickAiStatePatchSchema`, patch application, `HarwickAiConversationStateSchema` runtime usage, `HarwickAiQualificationStateSchema` runtime usage.

### Step 5: Agentic loop

Status: `partial`

Replaces: single-step turn execution (one model call per inbound).

What lands:

- `runAgenticLoop` wrapper in `packages/integrations/src/harwick-ai-runtime.ts` around `executeHarwickAiToolCalls`.
- Bounded by `MAX_AGENTIC_ITERATIONS` (default 6) and exits early on approval-required tool calls.
- Model emits `endTurn: true` to break the loop voluntarily.
- Operator queues evolve to approve outcomes (multi-tool sequences) instead of individual messages — UI copy update only, schema-compatible.

Deletion target: nothing on its own; it unlocks deletions from steps 3 and 4.

### Step 6: Cascade deletions

Once shadow validations pass, land deletions from earlier steps in standalone PRs:

- Delete `evaluateHarwickAiAutomation` and `harwick-ai-automation-policy.ts`.
- Delete `HarwickAiStatePatchSchema` and patch application.
- Collapse `HarwickAiRuntimeInputSchema` from 9 fields to 3 (workspaceName, channel, inboundText) plus document and conversation history.
- Delete `deriveHarwickAiTurnPersistenceStatus` and `deriveHarwickAiToolPolicyStatus`.

Estimated deletion: 400-500 lines from `packages/core` plus the structured `harwick_ai_automation_policies` table (replaced by `policy_narrative`).

### Step 7: Demote `decideLeadWorkflow` to fallback

Once the agentic loop reliably calls `route_lead`, `create_handoff_task`, `sync_follow_up_boss`, and `enroll_nurture` via tool descriptions, the deterministic scorer in `lead-workflow.ts` becomes a stalled-lead fallback rather than the primary path. This is the last big "AI native takes over" milestone.

## Per-Turn Prompt

Use this as the implicit self-prompt for future work:

```text
Read AGENTS.md, docs/codex-agent-constraints.json, and docs/paid-launch-map.md.
Identify the highest-priority incomplete launch item that is not blocked.
Inspect the current implementation before editing.
Make the smallest production-shaped change that moves that item toward paid launch.
Keep contracts in packages/core, provider/runtime code in packages/integrations, routes thin, and UI in feature/component layers.
Add or update tests for schema, normalization, policy, routing, sync, RLS, or API behavior when touched.
Run targeted verification; run release:check and build after structural changes.
Update docs/paid-launch-map.md if the launch status changed.
Do not build fake UI or placeholder-only flows when a backend contract is required.
```
