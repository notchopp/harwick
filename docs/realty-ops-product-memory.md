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

## Reuse From Coya

Port concepts from `C:\Users\whoch\receptionist-dashboard`, not the healthcare domain:

- Retell inbound context and webhook flow
- Twilio SMS send/receive persistence
- workload-aware assignment
- task queue patterns
- pipeline patterns
- conversation state

Do not port healthcare lifecycle names, patient terminology, or BOS caller taxonomy into this repo.
