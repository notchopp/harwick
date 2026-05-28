# Operator-side audit (2026-05-28)

The operator surfaces were built before the public listing chat existed. They
assume the inbound funnel is Instagram/Facebook DMs + Retell voice calls, and
treat anything else as `manual`. Now that public listing chat is the primary
entry point — and is the only source generating leads with full qualification
documents — the IG-first architecture is misrepresenting what the brokerage
actually has to work with.

This audit walks each operator surface, traces what it queries, where it
defaults to IG, and what the actual incoming data (post-2026-05-28) looks
like. The end-goal scenarios (operator lands on /home and sees a real
callback/showing request with full info; /conversations shows public chat
threads with turn-by-turn history and a take-over button; /leads shows the
full chat history + Harwick's document) are mapped to the gaps below.

## End-goal scenarios (the destination)

1. **/home** — operator lands and the queue surfaces real public-chat
   callback/showing approvals first. Card shows: visitor name + life context,
   the listing they're chatting about, the qualification (budget/timeline/
   financing), assigned agent, and a one-tap action ("approve showing",
   "answer callback now"). Old IG-DM intake fits in below the public-chat lane.

2. **/conversations** — public-listing-chat threads are first-class
   conversations. Operator sees: turn-by-turn history with timestamps and
   tool calls, the listing card the visitor saw, the buyer's profile chip.
   Can pause Harwick (automation toggle), draft a reply in Harwick's voice,
   or take over completely.

3. **/leads** — drawer shows: full qualification, life context (streamer,
   group of 6, etc), the cross-listing timeline (firstAskedAt/lastAskedAt),
   the lead document Harwick builds across turns, linked showings + callbacks
   + CMA requests, and the recent transcript.

## What's actually in the DB (Prestige workspace, 2026-05-28 post-cleanup)

| Lead | Phone | source_channel | qualification_summary | lead_document | Real? |
|---|---|---|---|---|---|
| **Clinton** (`8f7538a2`) | `4848456393` | `public_listing_chat` ✓ | "Group of 6, streaming house, media room..." | 4 timestamped entries | Yes |

13 fake leads (12 IG/FB seeds + 1 `555-555-5555` placeholder + 1 phone=`unknown`
artifact) hard-deleted in Phase 1 with cascade through 20 FK-referencing tables.

## Surface-by-surface gap map

### /home — `HomeOperatorPage` → `loadRecentLeads()` → `recent-leads.ts`

**Queries:** `leads` table only. Selects `id, full_name, instagram_username,
source_channel, status, score, lead_type, target_area, timeline,
assigned_agent_id, last_message_at, updated_at, created_at, email, phone,
workspace_id`.

**Gaps vs. end-goal:**
- `sourceFromChannel` (line 35-41) defaults unknown channels to `"instagram"`. 
  Public-chat leads will show with `source: "instagram"` and the IG icon, even
  though Clinton's lead is now correctly tagged `public_listing_chat` in the
  DB — the function ignores it.
- `leadDisplayName` (line 109-117) prioritizes `instagram_username` over
  `phone`. For Clinton's lead (no IG handle, real phone) this works, but the
  ordering signals the IG-first bias and breaks for any public-chat-only lead
  that doesn't have an IG handle ever.
- `channelLabel` returns "Manual" for unknown. Should return "Listing chat".
- Doesn't surface what Harwick captured this turn (budget, timeline, life
  context). The /home card just shows name + last-touch.
- Doesn't surface listing context. Clinton's lead is about Violet Sky Way; the
  card doesn't say that.
- Doesn't surface pending showing/callback tasks at all — the queue is just
  "recent leads," not "things waiting for you to act on."

### /queue — same `loadRecentLeads()`

Same gaps as /home. /queue is essentially /home with a different layout.

### /conversations — `ConversationsPageContent` → `conversations-data.ts`

**Queries:** `conversations` table — Meta DM/comment thread store. Joins
`conversation_messages` for message bodies. Does NOT query
`public_listing_sessions` or `public_listing_session_turns`.

**Gaps vs. end-goal:**
- Public-listing-chat threads are entirely invisible. The session token
  + turn history exist in `public_listing_sessions` + `public_listing_session_turns`,
  but the conversations surface doesn't know they exist.
- No "take-over" UI. Harwick's automation can be paused per-conversation
  in `conversation_automation_states`, but only for IG/Meta conversations.
  The same primitive needs to apply to public chat sessions.
- "Manual" label that the user complained about: when a chat-originated lead's
  source_channel was `"manual"` (now fixed in DB but pages still hard-code
  IG/FB switches), it rendered as a manual conversation row with no chat link.
- No deep-link from a conversation row into the chat transcript view (which
  also doesn't exist as an operator-side surface yet).

### /leads — `LeadsPageContent` → `loadLeadsPageData()` → `leads-data.ts`

**Queries:** `leads` table + `workspace_members` + `listing_facts`. Joins
`conversation_messages` via `findLatestLeadMessage` for the "latest message"
card. Joins `social_reply_reviews` for IG auto-reply gate state.

**Gaps vs. end-goal — these are the loudest bugs:**
- **`LeadPageSource = "instagram" | "facebook" | "voice"` (line 7)** — the
  type literally hard-codes only IG/FB/Voice. Public chat has nowhere to go.
- **`sourceFromChannel` (line 75-79)** defaults to `"instagram"`. The Clinton
  lead now correctly tagged `public_listing_chat` in DB will still render as
  `source: "instagram"`. **This is the IG logo on /leads the user called out.**
- **`name = lead.full_name ?? lead.instagram_username ?? lead.phone ?? "unknown lead"`
  (line 171)** — IG fallback before phone. Public-chat-only leads with no IG
  handle break this ordering.
- **`message`** is fetched only from `conversation_messages` (Meta DM table).
  For Clinton, this returns "No conversation text has been captured" even
  though the lead has a 4-turn rich `lead_document` and the full transcript
  lives in `public_listing_session_turns`.
- **`listing: firstListing`** picks the first listing in the workspace
  arbitrarily, not the listing the chat happened on. Clinton's lead is about
  30018 Violet Sky Way; the page would label it whatever's first
  alphabetically in `listing_facts`.
- **No drawer rendering** of `qualification_summary` (the field IS populated
  for Clinton — "Group of 6, looking for a streaming house with a media room
  at 30018 Violet Sky Way. Need details on noise policies and garage size.")
- **No drawer rendering** of `lead_document` — the timestamped history of
  what Harwick captured turn-by-turn. This is what the user means by "the
  document Harwick builds over time."
- **No drawer rendering** of linked showings/callbacks/CMA tasks. The
  `lead_tasks` table holds these but the drawer doesn't query it.
- **No drawer rendering** of the public chat transcript. The
  `public_listing_session_turns` rows are queryable by `promoted_lead_id`
  but the drawer doesn't fetch them.
- **`classifyHarwickLeadActionability`** (the routing/stage classifier in
  `@realty-ops/core`) probably also has IG-first heuristics — needs audit
  for the public-chat lead path.

### /tasks — needs separate audit (file not yet read)

Likely also queries `lead_tasks` only and doesn't show the new
`public_listing_session_turns`-originated work items. Showing-approval tasks
and callback tasks created by the public chat tools should appear here as
the primary inbox for the operator.

### /channels, /threads, /memory, /integrations, /team, /v, /more

Lower-priority surfaces for this audit. /channels and /threads are the
in-app Slack-like layer (THREADS-* still pending), not operator-facing
in the same way /home + /convos + /leads are. /memory and /integrations
are configuration surfaces, not inbound funnel views.

## The real root cause across all surfaces

It's a single architectural assumption baked in five places:

1. **`LeadPageSource` enum** in `leads-data.ts` hard-codes IG/FB/Voice.
2. **`sourceFromChannel`** functions in `leads-data.ts` and `recent-leads.ts`
   default unknown channels to `"instagram"`.
3. **Display-name fallback** consistently prioritizes `instagram_username`
   over `phone`/`email`/anything else.
4. **"Latest message"** queries only `conversation_messages`, missing the
   public-chat turns table.
5. **Listing association** is implicit / arbitrary, not joined to the
   listing the public chat happened on.

Fix the union types, the default-IG fallbacks, the display-name ordering,
the message query, and the listing join — and most of the surfaces light
up correctly.

## Phased rebuild plan

### Phase 2 — /leads (the loudest user complaint)

- Extend `LeadPageSource` union to include `"public_listing_chat"`.
- `sourceFromChannel`: explicit case for `public_listing_chat`, drop the
  IG default in favor of a proper "other" branch.
- Display-name fallback: prioritize `full_name` > `phone` > `email` >
  `instagram_username` > `Lead {id}`. Phone before IG.
- `findLatestLeadMessage`: when `source_channel = 'public_listing_chat'`,
  also query `public_listing_session_turns` joined via
  `public_listing_sessions.promoted_lead_id = lead.id`. Return the latest
  visitor turn body.
- `listing` association: join `public_listing_sessions` to find the
  most-recent listing the visitor chatted about, not just `firstListing`.
- Drawer rewrite: add tabs/sections for
  (a) qualification summary,
  (b) Harwick's document (`lead_document`),
  (c) chat transcript (turn-by-turn from `public_listing_session_turns`),
  (d) showings + callbacks + CMA tasks (`lead_tasks`),
  (e) life context + vibe notes + cross-listing timeline (already in
       `lead_document` jsonb but not surfaced).

### Phase 3 — /conversations (the second loudest)

- Extend the conversations query to UNION public_listing_sessions as a
  conversation row. Conversation kind = `"public_listing_chat"`.
- Each session row: visitor identity (cookie token + headline if present),
  listing address, last_active_at, turn count, automation state.
- New transcript view at `/conversations/[sessionId]` (or as a drawer):
  scrollable turn list, tool-call inline cards (matching the buyer-facing
  card UI for parity), and an inline composer for operator take-over.
- Pause/take-over: extend `conversation_automation_states` to also key on
  `public_listing_sessions.id`, or build a parallel table
  `public_listing_chat_automation_states`. Default to "Harwick auto", but
  if the operator pauses, subsequent visitor messages don't trigger streamText.
- Operator-sent message: route through the same `route.ts` POST but with
  `actor: "operator"` so the visitor sees a different style indicator.

### Phase 4 — /home + /queue (the landing experience)

- New "What needs you" queue that surfaces:
  (a) showing approvals pending (from `lead_tasks` where kind = showing
       and status = pending),
  (b) callback requests pending,
  (c) CMA requests pending,
  (d) recently-active public chat sessions with no operator action yet,
  (e) recently-promoted hot leads.
- Each queue card shows: visitor name + headline (from
  `public_listing_chat_qualification.headline` — set by `set_visitor_headline`
  tool), listing context, qualification summary, action button.
- Drop the IG/FB-heavy "recent leads" surface as the primary view.
- Keep IG/FB DM intake visible as a secondary lane below.

### Phase 5 — /tasks (close the loop)

- Audit and rewrite the tasks page to surface public-chat-originated
  showing/callback/CMA approvals as first-class tasks.
- Currently unclear if `/tasks` shows `lead_tasks` or its own table —
  needs separate read.

## Suggested execution order

The user's stated priorities (in order):
1. /home — operator lands and sees real callback/showing requests
2. /conversations — see chat history, take over
3. /leads — full history + Harwick's document

The data-fix order that maximizes payoff per minute (matches their stated
priorities, with /leads first because it's the smallest fix relative to
visible improvement):

- **Phase 2 (/leads)** — ~3-4 hours. Smallest blast radius, biggest visual
  fix for the IG-logo complaint. Drawer wiring is mostly join work.
- **Phase 3 (/conversations)** — ~4-6 hours. New transcript surface +
  automation pause UI. The pause/take-over is the hardest new primitive.
- **Phase 4 (/home + /queue)** — ~3-4 hours. Mostly query rewrite +
  card components. Depends on Phase 2 drawer for "open lead" deeplink.
- **Phase 5 (/tasks)** — TBD after read.

## Phase 1 outcome (shipped 2026-05-28)

- Fixed `source_channel = "manual"` hard-code in `insertLead` (the silent
  root cause of every IG-logo render on /leads + /home).
- Added `public_listing_chat` to the CHECK constraint (migration
  `20260528000100`) and extended dashboard `channelLabel` switch.
- Hard-deleted 14 fake/placeholder leads from the Prestige prod workspace
  with cascade through 20 FK-referencing tables.
- Backfilled Clinton's lead to the correct channel.

After Phase 1, the data layer is honest. Phase 2 onward fixes the
rendering layers that read it.
