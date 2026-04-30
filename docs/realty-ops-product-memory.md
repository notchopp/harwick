# Realty Ops Product Memory

This file mirrors the repo-specific Codex memory that should guide every coding turn.

## Product

- Working internal repo name: `Realty Ops`.
- Public product name is undecided.
- Do not use `Kova`.
- Build for solo realtors, individual agents inside brokerages, teams, and brokerages.
- A workspace can represent a solo realtor, a team, or a brokerage; do not assume brokerage-only ownership.
- Individual agents can connect their own Instagram accounts under a workspace. Team or brokerage accounts can also exist as shared workspace-level integrations.
- The cousin realtor is customer zero and the first workflow source of truth.

## Core Promise

Every inbound lead gets answered, qualified, scored, assigned, nurtured, and synced without a VA doing repetitive handoffs.

## Day-One Channels

- Instagram DMs
- Instagram comments
- Retell voice calls with Retell-provisioned numbers for the first voice path
- SMS follow-up and nurture, using Retell in-call SMS where it fits and Twilio-style persistence/controls for broader two-way or outbound campaigns
- Follow Up Boss sync

## Primary Users

- Solo realtor or agent: connects their own channels, sees their leads, tasks, conversation history, and next actions.
- Brokerage owner or team lead: sees team-wide leads, rules, performance, shared integrations, member-owned integrations, and overrides.
- Lead manager or ISA: optional role for future triage workflows.

## Product Shape

- This is a social lead capture and brokerage routing system.
- Follow Up Boss remains the CRM of record.
- Realty Ops owns intake, qualification, assignment, nurture, and sync logs.
- The UI should feel premium and restrained, but operational. No marketing-dashboard fluff.
- The public listings surface is a Harwick-powered inventory page per workspace, not a separate product. Leads should be able to browse listings, open a polished property viewer, inquire, request a showing, and feed back into the same intake/routing system.

## Roles And Access

- Owner / rainmaker: owns the workspace, connects primary channels, sees all leads, receives source credit, manages billing/settings, and can override routing.
- Team lead / admin: manages members, routing rules, integrations, listings, operator queues, and unresolved assignments.
- Agent: receives assigned leads, sees their own queue, conversations, appointments, tasks, and calendar/showing preferences.
- Operator / ISA: triages queues, approves replies, qualifies leads, books callbacks, and can assign leads where allowed.
- Viewer / assistant: limited read-only or support access for future use.
- Admin-level roles must be granted through owner/admin-controlled invite or admin login paths. A normal signup path must not allow someone to self-select an admin role.

## Plan Flags

All plans get the core Harwick engine: branded listings page, Instagram/Facebook intake foundations, lead creation, lead scoring, basic qualification, Follow Up Boss sync, one Retell voice path where included, provider error logging, secure multi-tenant infrastructure, and the operator queue concept. These are the baseline product promises.

Feature flags should be modeled in three layers:

- Hard access gates: unavailable actions do not render, such as adding seats on Solo.
- Usage gates: limits trigger upgrade or overage flows, such as lead event caps.
- Visibility gates: higher-tier panels do not render on lower plans, such as team routing or brokerage readiness.

Solo plan:

- Intended for one individual agent running their own brand.
- Includes 1 Instagram account, 1 Facebook account, 1 voice agent, 1 phone number, 1 calendar connection, one operator queue, AI reply drafting, basic qualification, lead scoring, qualified-lead FUB sync, listings page up to 25 listings, open house registration, and private showing collect/request approval flows.
- Lead event limit target: 200/month, with overage pricing modeled separately.
- Does not include member seats, multi-agent routing, rainmaker attribution, team calendar view, multi-channel social expansion, or team-level dashboards.

Team plan:

- Intended for a team lead with agents under them.
- Includes Solo capabilities plus up to 5 member seats, member routing profiles, area/type/price/capacity routing, source owner/rainmaker attribution, round-robin fallback, team lead oversight, 2 Instagram accounts, 2 Facebook accounts, 2 voice agents, 2 phone numbers, per-member calendar connections, team showing view, CSV listing import, listing verification workflow, callback task generation, and basic nurture enrollment.
- Lead event limit target: 500/month, with lower overage than Solo.
- Showing default should be request + approve. Team lead can set a workspace default, while agents can set their own preference and listing-level overrides.

Brokerage plan:

- Intended for broker-owner operations across many agents or teams.
- Includes Team capabilities plus seat expansion after an included threshold, many member-owned Instagram/Facebook connections, many voice agents/numbers, multi-team structure, broker-level readiness dashboard, CRM/worker operations visibility, unified lead timeline, advanced assignment override, brokerage-level attribution, full nurture execution, quiet hours, opt-out state, sequence state, custom follow-up scheduling, open house analytics, showing analytics, and dedicated onboarding/support.
- Lead event limits should be modeled as fair-use or contract terms rather than fixed Solo/Team caps.

## Routing Model

- Harwick should qualify before routing. Minimum useful qualification signals are intent, timeline, price range, area, property type, buyer/seller/renter status, financing/preapproval status, and source channel.
- Routing should be explainable. The system should show why a lead was assigned, held, or escalated.
- Source owner/rainmaker credit is separate from assigned agent. A lead from Ademola's Instagram can route to Sarah while preserving Ademola's source credit/cut.
- Routing priority is area match first, then lead type/intent, property type, price range, availability/capacity, and only then round-robin as a tie-breaker.
- If no agent cleanly matches, the lead escalates to owner/team lead as unrouted and appears in the operator queue.
- Agent routing profiles should include areas covered, property types, price range, lead types accepted, capacity, availability, showing preference, and notification preference.

## Appointments, Showings, And Open Houses

- Model this as qualified appointment routing, not just calendar booking. The appointment system should later support private showings, buyer consults, seller valuation calls, lender intros, callbacks, and open house registrations.
- Appointment flags should include calendar connections, open house registration, showing requests, approval-required booking, auto-booking, and team availability routing.
- Each workspace member should be able to connect a calendar when their plan allows it. Google Calendar is the first likely provider, with Outlook later for brokerage/corporate teams.
- Private showing automation should have three modes:
  - collect only: Harwick captures showing intent, qualifies, creates a task, and asks the agent to follow up manually.
  - request + approve: Harwick qualifies, checks availability, proposes a slot, and sends a one-tap approval to the agent before confirming with the lead.
  - auto-book: Harwick books directly only after the lead clears a qualification threshold.
- Default private showing mode should be request + approve, not auto-book. Agents need control before trusting AI to put strangers on their calendar.
- Auto-booking should be opt-in and configurable globally per agent and per listing. Luxury/high-touch listings should usually default to collect only or request + approve.
- Open house registration should be automated by default. The event already exists, so Harwick should send details, register attendees, create/update leads, score them, send reminders, and sync activity to Follow Up Boss.
- Showing requests route through the same routing model with listing ownership and calendar availability considered. Open house registrations do not route the same way because the hosting agent/listing owner is already known, but high-intent registrants should be surfaced before the event.

## Reuse From Coya

Port concepts from `C:\Users\whoch\receptionist-dashboard`, not the healthcare domain:

- Retell inbound context and webhook flow
- Twilio SMS send/receive persistence
- workload-aware assignment
- task queue patterns
- pipeline patterns
- conversation state

Do not port healthcare lifecycle names, patient terminology, or BOS caller taxonomy into this repo.
