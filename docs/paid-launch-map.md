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
| Supabase auth UI | done | `/login`, `/signup`, Supabase cookie auth, protected app pages, workspace selection, and role-aware redirects exist | Keep invite/signup UX aligned with workspace membership rules. |
| Workspace membership and roles | done | owner/admin/team lead/lead manager/operator/agent/viewer roles, role capability helpers, workspace resolver, route/API auth helpers, and billing/routing role gates exist | Keep new APIs using `authorizeWorkspaceRequest` or server-component workspace helpers. |
| RLS and tenant boundaries | done | tenant tables have RLS, newer loops/billing/calendar/memory/work-item tables are covered by `rls_workspace_boundaries.sql`, and remote `supabase:test:rls` passes owner/assigned/unassigned/outsider behavior | Re-run `npm run supabase:test:rls` after every sensitive migration. |
| Meta intake | done | webhook intake, normalization, post context, reply send, social queue exist, E2E flow verified with real IG DMs | Continue with production signature checks, OAuth connection, and real approval/send loop. |
| Harwick AI runtime | partial | typed runtime, local/OpenAI adapters, tool contracts, tool registry prompt construction, durable subagent task dispatch, subagent execution cron, scheduled Harwick loop definitions/runs, settings UI for loop creation/pause/resume, draft loop output, approval-first agent-loop plans, operator approval for safe internal loop execution, persisted turn/tool execution outputs, worker-side outbound message mirroring, automation policy, and tool executor exist | Finish provider-backed validation before autonomous loop external writes and keep worker/provider auto-send coverage aligned with every new channel. |
| Harwick proactive insight feed | partial | `harwick_work_items` exists; `/api/agent-runtime/insights` cron producer surfaces ambiguous inbound, unassigned priority leads, dormant active leads, workspace memory patterns, and optional small-model-refined narratives; `/api/agent-runtime/subagents` surfaces completed subagent results; `/api/agent-runtime/loops` surfaces due recurring Harwick loops, draft payloads, and execution plans; loop approval work items can queue safe internal `dispatch_subagent` follow-through; `/api/agent-runtime/policy-shadow` surfaces policy shadow validation metrics; `/home` shows member/role-filtered insights with seen/dismiss/approve actions, feedback labels, loop draft bodies, execution briefs, and proposed tool calls | Add deeper insight types from richer workspace memory review signals and keep loop result detail aligned as more external-write tools become validated. |
| Harwick workspace memory | done | `workspace_memory_documents` table, typed contract, repository, `/api/agent-runtime/workspace-memory` distillation worker, optional small-model-authored memory prose, embedding persistence, semantic pgvector retrieval, Harwick runtime prompt injection, owner/admin/team lead review controls, settings UI review surface, and proactive review-quality monitoring exist for routing overrides, operator feedback, objection, market, conversion, and source/channel patterns | Keep quality thresholds tuned as real review volume grows. |
| Conversation-scoped AI control | partial | `conversation_automation_states` migration and UI controls exist; AI/provider auto-send paths enforce automation mode, while manual operator sends from the conversation composer and social queue bypass takeover safely and mirror outbound messages into the transcript | Expose admin/agent-safe controls consistently across every queue surface. |
| Conversations page | partial | conversation data contracts, initial transcript aggregation from canonical `conversation_messages` with lead-event fallback/deduping, live Harwick synthesis, in-flight agent/subagent work signals, tool-result activity trails, workspace-level realtime inserts for loaded threads, and no shipped sandbox/demo conversation fallback exist | Keep lead-context updates broader than selected-thread polling and maintain transcript parity as more channels write canonical rows. |
| Work queue | done | social replies, voice handoffs, Harwick work items, showing approvals, nurture drafts, CRM retries, FUB conflicts, provider errors, and workflow-job actions all route through protected APIs with real mutations and audit-log entries | Keep new queue-style actions on the same mutation-plus-audit pattern. |
| Leads page | done | list/card views, detail sheets, lead timeline API, actionability contracts, role-filtered API-backed loading, real empty/error states with no demo fallback rows, audited persisted qualification updates, and an audited Harwick routing action exist | Keep future lead actions on the same mutation-plus-audit pattern. |
| Routing engine | done | assignment decisions, member routing profiles, route-with-Harwick lead action, Harwick `route_lead` tool parity, source-owner credit from member-owned integration accounts, capacity-aware active lead counts, connected member calendar/showing-mode readiness, round-robin fallback, persisted routing decisions, and assignment/reassignment audit exist | Keep routing explanations tuned as real lead volume and calendar adoption grow. |
| Internal listings | partial | listing facts, CSV import, quick update, verify, media upload route, list/card UI exist | Finish media storage path, operator actions, pagination/list view, and public/private state. |
| Public listings | partial | public workspace listing surface loads persisted `listing_facts`, detail viewer exists, no longer falls back to demo inventory or fake phone numbers, public inquiry route creates/updates leads and lead events, listing-scoped showing requests create approval tasks, and listing-scoped open-house registrations create attendee tasks | Template variants, richer listing-aware intake context, and reminder delivery. |
| Follow Up Boss | partial | sync, back-sync, logs, webhook subscription foundation, server-only key save/test routes, pasted-key validation before encrypted save, integrations-page saved-key test UX, audited conflict replay/ignore APIs, and home work-queue conflict replay/ignore actions exist | Broader retry/replay polish and worker-only production writes still need staging provider validation. |
| Calendar/showings | partial | product model documented; member calendar connection table/RLS exists; typed calendar contracts exist; Google OAuth start/callback connects member calendars with encrypted credentials; Google FreeBusy adapter exists; Harwick `check_calendar` uses a connected member Google Calendar when available, refreshes expiring Google access tokens, falls back to synthesized windows, approved showing tasks can write Google Calendar events with deterministic event IDs, public listing showing forms create showing approval tasks, open-house reminder drafts are produced from upcoming registration tasks, and approved reminder drafts enqueue idempotent provider-backed delivery jobs | Live provider validation and richer open-house attendee automation. |
| Open houses | partial | product model, AI tool contract, public listing open-house registration intent, durable `open_house_registration` attendee tasks, workspace-scoped attendee list API, cron-produced reviewable open-house reminder drafts, and approved reminder draft delivery jobs send through Twilio SMS or Meta DM, persist provider IDs, write lead events, mirror transcripts, and meter sent usage | Live provider validation, FUB sync, and richer UI surface. |
| Nurture execution | partial | opt-out, quiet-hour, scheduling, jobs, reviewable drafts, approve/send/dismiss APIs, receipts, idempotent delivery-job enqueueing for approved drafts, and worker-side approved-draft delivery through Twilio SMS or Meta DM with provider IDs, lead events, transcript mirroring, usage metering, and failure states | Production send controls still need live staging provider smoke with staging-safe Twilio/Meta credentials. |
| Voice operations | partial | Retell provisioning/context/tools/handoffs exist, and provisioning can create the Realty Ops conversation flow directly without a template asset | Transcript-safe queue fields, post-call analysis, callback actions, production webhook validation. |
| Integrations page | partial | Meta, FUB, calendar-facing UI surfaces exist | Real OAuth/key save/test flows, encrypted credentials, statuses, reconnect flows. |
| System health | partial | `/api/health/readiness`, `/api/health/systems`, home readiness cards, and home work-queue surfacing for worker/provider/CRM failures exist | Keep expanding product-safe health detail as provider smoke coverage grows. |
| Billing/plans | done | subscription tables, plan schemas, usage events, plan capability contracts, server-only Stripe checkout, customer portal, wallet top-up PaymentIntent APIs, Stripe env validation, signature-verified Stripe webhook route, idempotent billing webhook ledger, subscription reconciliation, wallet credit reconciliation, and owner/admin billing controls in settings exist | Keep Stripe endpoint configured in staging/prod and continue metering real usage events. |
| Usage metering | partial | usage event tables, usage wallet, usage summary aggregation, plan gate service, current-period usage recorder, atomic wallet debit ledger, pre-run Harwick plan-capacity gate, wallet-funded overage recording, wallet-empty owner alert, wallet-backed Harwick/Retell/memory usage events, and settings Plan & Usage surface exist | Exercise upgrade prompts and wallet-funded overages against real launch usage. |
| Reliability hardening | partial | job model, provider errors, release gates, audit logs, rate-limit helpers, staging/prod runtime readiness checks, launch rollback notes, idempotency coverage pass, staging/production `.env.local` fallback disabled, top-level app shell/settings no longer render fake profile/sidebar counts, and staging-safe public provider smoke fixture exist; Harwick FUB tool sync now upserts a stable `fub_sync:{leadId}` qualified-only worker job | Run provider smoke with `LAUNCH_PROVIDER_SMOKE_REQUIRED=true` against deployed staging before production launch. |
| Launch test harness | partial | `npm run launch:check` runs launch readiness fixtures, staging provider smoke fixture, release gate, production build, and remote Supabase RLS verification in one command; latest local gate passes 132 test files / 571 tests plus production build and remote RLS; `npm run test:launch-readiness` proves inbound event -> AI -> queue/send -> lead -> route -> FUB sync -> Harwick loop approval -> safe subagent queueing without real provider writes and validates staging/prod runtime config gates; `npm run test:staging-provider-smoke` verifies the smoke harness and can hit deployed readiness, Meta challenge, and Retell signed no-op webhook paths when a staging URL is configured, including Vercel deployment-protection bypass when `LAUNCH_PROVIDER_SMOKE_BYPASS_SECRET` is set and deployed readiness missing-key reporting when the target is blocked; `npm run launch:env:audit` verifies deployed Vercel env names without printing secrets and can be required from `npm run launch:check` with `LAUNCH_ENV_AUDIT_REQUIRED=true`; `npm run launch:env:sources` reports local exact/alias env source coverage without printing values and currently identifies the remaining unsourced names as `RETELL_VOICE_ID`, annual/team/brokerage Stripe price IDs, and `GOOGLE_CALENDAR_OAUTH_REDIRECT_URI`; Retell template flow is now optional because provisioning can create the Realty Ops flow directly | Deployed smoke against `https://harwick.lol` still requires deployed production/staging env completion, including `RETELL_VOICE_ID`; run the provider smoke fixture and env audit against a deployed staging app with real staging env before production launch. |

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

- ✅ server auth helper for route handlers and server components
- ✅ workspace/member resolver
- ✅ role capability helper in `packages/core`
- ✅ route protection for app pages
- ✅ RLS audit coverage for newer loops/billing/calendar/memory/work-item tables
- ✅ RLS tests for owner, assigned agent, unassigned member, outsider

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
- ✅ conversation timeline aggregation from `conversation_messages` with legacy `lead_events` fallback
- ✅ AI state strip attached to conversation
- workspace-level realtime message inserts for loaded threads plus workspace polling strategy
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
- Public listing inquiry creates or updates a lead event and showing requests create an approval task tied to the persisted listing.

Build items:

- ✅ public inquiry endpoint
- ✅ public listing surface loads persisted `listing_facts`
- ✅ showing CTA creates `request_showing_approval` tasks for persisted listings
- storage bucket and signed upload flow
- listing media persistence
- ✅ listing detail viewer
- open-house CTA path
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
- ✅ key save with encryption confirmation and pre-save provider validation
- ✅ integrations UI can save and test the saved Follow Up Boss key
- worker-only sync enforcement
- ✅ home work-queue conflict surfacing
- ✅ audited conflict replay/ignore action API
- ✅ home work-queue replay/ignore controls
- ✅ tests for URL/body behavior and failure cases

### 8. Calendar, Showings, And Open Houses

Status: `partial`

Undeniables:

- Default showing mode is request + approve.
- Auto-book is opt-in.
- Showing automation respects qualification threshold and agent/listing preferences.
- Open house registration is automated by default.
- Calendar availability belongs to workspace members, not just the workspace.

Build items:

- ✅ Google Calendar OAuth
- ✅ member calendar connection model
- ✅ showing preferences model foundation (`showing_mode` per member calendar connection)
- ✅ availability lookup tool handler
- ✅ showing approval task
- ✅ booking confirmation and calendar write
- ✅ public listing showing form -> task creation
- ✅ open house registration endpoint through public listing inquiry
- ✅ attendee list API
- ✅ reminder draft producer for upcoming open-house registrations
- ✅ approved nurture/open-house reminder draft delivery through worker-side Twilio SMS or Meta DM

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
- ✅ current-period usage recording from durable lead events, social replies, Harwick AI turns, and sent nurture/open-house reminder receipts
- ✅ seats/social/listings/AI turns/message limits (checkUsageLimit, checkSeatLimit, checkListingLimit)
- ✅ server-side plan gate applied to listings POST endpoint
- ✅ tests for billing domain schemas and plan gate logic
- ✅ server-only Stripe checkout client and owner/admin checkout API
- ✅ server-only Stripe customer portal client and owner/admin portal API
- ✅ Stripe webhook/subscription reconciliation
- ✅ upgrade prompts
- ✅ billing admin UI in settings
- ✅ wallet top-up PaymentIntent API and Stripe `payment_intent.succeeded` wallet credit path
- ✅ Plan & Usage settings surface with wallet balance and social/voice usage
- ✅ pre-run Harwick plan-capacity gate with wallet-empty pause message, owner work item, atomic wallet debit, and free-plan auto-send downgrade

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

- ✅ idempotency coverage pass
- rate-limit middleware or route helpers ✓ (exists)
- audit log table and helpers ✓ (completed)
- provider error standardization ✓ (exists)
- ✅ staging/prod config checks
- ✅ rollback notes for risky migrations/provider config
- ✅ one-command launch gate (`npm run launch:check`)
- ✅ launch readiness fixtures (`npm run test:launch-readiness`) including Harwick loop approval and safe subagent queueing
- ✅ staging-safe provider smoke fixture for deployed readiness, missing-key diagnostics, Meta challenge, and Retell signed no-op webhook
- ✅ deployed env-name audit (`npm run launch:env:audit`) that fails on missing required Vercel env names without printing values
- ✅ local env source audit (`npm run launch:env:sources`) that reports exact/alias source coverage without printing secret values
- staging provider smoke run with `LAUNCH_PROVIDER_SMOKE_REQUIRED=true` against deployed staging

## AI-Native Migration Track

This is a parallel track to the launch spine above. It is not gated by launch — semantic listings and vision ship pre-launch because they are immediately product-positive and zero-risk. Policy narrative and living lead document ship as v1 work that runs in shadow mode against the existing path. Agentic loop is v2 north star. Each step is independently shippable and reversible.

The frame: Harwick is becoming an AI agent that calls infrastructure when it needs to act, not a workflow engine that calls AI when it needs language. Progress is measured in lines deleted from the existing policy/state-machine layer, not in features added. See `AGENTS.md` north-star section for principles.

Current AI-native completion estimate: **99%**.

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
- Capability 2 refresh: the conversations workspace silently polls while visible so the Harwick synthesis strip updates as persisted turns land.
- Capability 1 broader distillation: workspace memory now learns repeated operator feedback on Harwick work items, not only routing overrides.
- Capability 4 / Step 3 standing instructions: workspace settings can save manual Harwick policy narrative into `workspaces.policy_narrative`, and the existing runtime injects that prose into every turn.
- Capability 5/6 foundation: Harwick tool prompt construction now comes from a typed registry, and `dispatch_subagent` writes durable specialist tasks for later worker execution.
- Capability 3 richer narratives: the proactive insight cron can use the configured small model to rewrite deterministic insight cards into validated, action-oriented narratives, with deterministic fallback on failure.
- Capability 1 broader distillation: workspace memory now learns objection, market, conversion, and source/channel patterns from real leads and conversation messages.
- Capability 5 worker path: queued Harwick subagent tasks can be executed by a cron route with the configured small model, persisted as completed or failed, and surfaced as role/member-targeted Harwick insights.
- Capability 2 in-flight synthesis: the conversations workspace now folds recent agent steps and queued/running subagent tasks into the Harwick synthesis strip, so operators see active tool work before a final turn lands.
- Capability 4 shadow validation: policy shadow audit logs now aggregate into workspace metrics and team-lead insights so deterministic policy deletion has measurable readiness criteria.
- Capability 1 model-authored memory: workspace memory distillation can use the configured small model to rewrite deterministic pattern findings into concise durable memory, with deterministic fallback.
- Capability 1 memory review controls: workspace memories now carry pending/approved/dismissed review metadata, owner/admin/team lead API controls can approve or dismiss learned patterns, and dismissed memories are excluded from Harwick runtime retrieval.
- Capability 2 richer in-flight synthesis: conversations now surface live tool/result deltas from `agent_steps.tool_executions`, including executed, failed, queued, missing-handler, and requested tool activity.
- Capability 4 scheduled loops: operators can save prose recurring jobs with cadence, Harwick stores durable loop/run records, `/api/agent-runtime/loops` fires due loops with the small-model tier when configured, and due loops surface as role-targeted Harwick work items before external action.
- Capability 4 loop output modes: `draft` loops now carry generated draft payloads for review, and `agent_loop` loops now carry approval-first execution briefs plus proposed tool calls instead of collapsing into generic insight cards.
- Capability 4 approval execution: loop approval work items now support an `approve` action; approved `agent_loop` plans can queue safe internal `dispatch_subagent` tasks while external-write tool calls remain skipped until provider-backed validation is complete.
- Capability 4 launch coverage: `npm run test:launch-readiness` now proves the loop approval path as part of the full-funnel launch fixture.
- Persistence hardening: agentic-loop tool call rows now carry the actual execution status, output, and error metadata from the tool executor instead of being inserted as pending after the tool already ran.
- Worker persistence hardening: the Harwick AI reply worker now has typed outbound `conversation_messages` mirroring coverage for executed Meta sends.
- Capability 4 settings surface: owners/admins/team leads can create, pause, and resume recurring Harwick loops from settings through the real workspace loop APIs; form payload construction and tool allowlist parsing have focused tests.
- Capability 4 operator surface: the home queue now carries Harwick work-item payload details and renders scheduled-loop draft bodies, execution briefs, and proposed tool calls before approval.
- Capability 1 review surface: settings now loads pending/approved/dismissed workspace memories through the real review API and lets owner/admin/team lead approve or dismiss learned brokerage patterns with optional notes.
- Capability 1 quality monitoring: proactive insights now surface workspace-memory review backlogs and high dismissal rates to team leads, so approved/dismissed feedback turns into an operating signal.

Still open before this becomes “fully AI native”:

- Deletion of deterministic policy paths once model self-gating is trusted by shadow metrics.
- Full scheduled-loop execution against external-write tools still needs provider-backed validation before autonomous writes.

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
