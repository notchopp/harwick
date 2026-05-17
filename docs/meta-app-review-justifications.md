# Meta App Review — per-permission justifications

Paste each block verbatim into the corresponding permission's "How will you
use this permission?" / "Reviewer notes" fields in App Dashboard → App Review.

Do **not** copy/paste one justification across multiple permissions — Meta
reviewers explicitly reject duplicate justifications. Each block below is
written for its specific permission with a unique opening, business
motivation, and the user-visible flow that demonstrates the API call.

For every permission, attach a screencast (60–120 seconds, English UI, slow
pacing, real production API calls — not mockups) that mirrors the flow described
in the justification.

---

## Business context (use as the App Review "How does your app use Meta data?" opener)

Harwick is a B2B AI workspace that helps independent real-estate brokerages
manage inbound leads from Instagram and Facebook. Brokerage owners and their
agents connect their own Facebook Pages and the Instagram Business Accounts
linked to them. Harwick reads inbound DMs and comments, captures qualified
buyer/seller leads, drafts replies (which a human approves), routes the lead to
the right agent, and syncs qualified leads into the brokerage's CRM
(Follow Up Boss).

Multi-tenant by design: each connected business is a separate workspace with
its own access tokens, encrypted at rest, and its own member-level access
controls. No customer data crosses workspace boundaries.

We do not advertise, train AI models on, or share Meta Platform Data outside
the connected brokerage's workspace.

---

## `instagram_business_basic`

**How will your app use this permission?**

Harwick needs `instagram_business_basic` to identify the Instagram Business
Account the brokerage chose to connect. We read the account's `id`,
`username`, `name`, and `profile_picture_url` so the workspace's integration
settings UI can show the operator which Instagram account is wired up, and so
incoming webhook payloads can be associated with the right workspace.

**User-visible flow demonstrated in the screencast.** A real-estate broker
signs into Harwick, opens `Settings → Integrations`, clicks **Connect Meta**,
authenticates with their Facebook account, and grants Harwick access to a
specific Instagram Business Account. After the OAuth callback, the integration
settings page renders the connected account's username and profile photo. The
screencast shows the IG account display in the UI as proof of the
`/me/accounts` and `/{ig-user-id}` reads.

---

## `instagram_business_manage_messages`

**How will your app use this permission?**

`instagram_business_manage_messages` is the core of Harwick's value: we
receive inbound Instagram DMs from prospective home buyers and sellers who
contact the brokerage's IG account, and we send replies on the brokerage's
behalf after a human has approved the draft (or under an automation policy
the brokerage explicitly enabled).

Incoming DMs trigger the `messages` webhook subscribed against the brokerage's
linked Facebook Page. Each delivery is signature-verified, deduplicated by
message `mid`, and persisted as a lead-conversation event in the workspace's
private inbox. A workspace member opens the conversation, the system drafts a
reply with the brokerage's voice and listing context, the member edits/approves,
and the reply is sent via the Instagram Messaging API.

**User-visible flow demonstrated in the screencast.** From a personal phone, a
second IG user account sends a DM to the brokerage's Instagram Business
Account ("Hi, I saw your Oak Avenue listing — is it still available?"). The
screencast shows the message appearing in the brokerage's Harwick inbox in
real time, the operator reviewing the AI draft, editing one line, clicking
**Send**, and the reply landing in the IG DM thread on the phone.

We comply with Meta's messaging windows: replies within 24h of the lead's last
inbound message are free-form; replies between 24h and 7d use the `human_agent`
message tag and are limited to one such reply per conversation. The operator
sees the active window in the composer before sending.

---

## `instagram_business_manage_comments`

**How will your app use this permission?**

Brokerages publish listing posts and Reels to Instagram. Prospective buyers
comment with intent signals ("Is this still available?", "What's the price?",
"DM me details"). Harwick reads those comments via the `comments` webhook on
the connected Page so the brokerage doesn't miss a high-intent lead, and posts
reply comments after a human approves the draft.

This permission is requested specifically for two operations: (1) reading
comments and their parent post context so reply suggestions are grounded in
what was actually posted, and (2) writing reply comments via
`/{ig-comment-id}/replies`. We do not delete comments, hide comments, or post
top-level posts.

**User-visible flow demonstrated in the screencast.** From the second test
account, a user comments "is this still on the market?" on a real listing post
published by the brokerage's IG account. The comment appears in Harwick's
comments inbox. The operator clicks **Draft reply**, edits the suggestion, hits
**Approve & send**, and the reply comment is posted under the original
comment on Instagram. The screencast shows both the Harwick UI and the
Instagram app reflecting the new reply comment.

---

## `pages_show_list`

**How will your app use this permission?**

When a real-estate broker connects Meta, they need to choose which of their
Facebook Pages to link to their Harwick workspace. We use `pages_show_list` to
fetch the list of Pages the user admins so we can present them in a picker
during the OAuth completion step.

We do not enumerate Pages outside this user-initiated connection flow. The
result is shown only to the authenticated user who is connecting.

**User-visible flow demonstrated in the screencast.** During Connect Meta, the
operator is shown a list of their Facebook Pages. They pick "Harwick Realty"
and the connection completes. The screencast shows the Page picker UI populated
from `/me/accounts`.

---

## `pages_manage_metadata`

**How will your app use this permission?**

After a brokerage connects a Page, Harwick subscribes that Page to webhook
events (`messages`, `messaging_postbacks`, `feed` for comments) using
`pages_manage_metadata` and `/{page-id}/subscribed_apps`. Without this, we
cannot receive any of the inbound DM or comment events that make the product
function.

This permission is used once per connection (the initial subscribe) and once on
disconnect (the unsubscribe). We do not modify Page name, description, hours,
profile picture, or any other Page metadata. We only manage the app-subscription
relationship between Harwick and the Page.

**User-visible flow demonstrated in the screencast.** After connecting a Page,
the screencast shows the Page's "Apps and Services" view in Meta Business Suite
listing Harwick as an active app, and then the operator triggering a test DM
from a second account, with Harwick receiving the webhook payload (visible in
the Harwick inbox seconds later).

---

## `pages_messaging`

**How will your app use this permission?**

Brokerages receive inbound DMs to the connected Facebook Page from prospective
home buyers and sellers (separate channel from Instagram DMs but functionally
identical to the brokerage). Harwick uses `pages_messaging` to receive those
DMs via the `messages` webhook subscription on the Page, and to send replies
through the Messenger Send API after the human approves the draft.

Same approval model as Instagram: AI drafts, human approves or edits, send
fires. Same window compliance: 24h free-form, 24h–7d with `human_agent` tag,
beyond 7d we do not send unsolicited replies.

**User-visible flow demonstrated in the screencast.** From a personal Facebook
account, the tester sends a DM to the brokerage's Page. The screencast shows
the message arriving in the Harwick inbox, the operator approving the reply,
and the reply landing in the Messenger thread on the tester's phone.

---

## `pages_read_engagement`

**How will your app use this permission?**

When a comment comes in on a brokerage's Facebook Page post, Harwick reads the
post context (caption, attached photos, listing URL if present) so the reply
suggestion is grounded in what the comment is actually about — "Is this still
available?" needs the post to know what "this" is.

We read post text, attached media metadata, and the comment thread structure
for posts the brokerage owns. We do not read other Pages' engagement, the
brokerage's audience demographics, or any data outside their own Page.

**User-visible flow demonstrated in the screencast.** A test comment is posted
on a real listing on the brokerage's FB Page. The screencast shows the Harwick
draft-reply view, which includes the post excerpt and listing detail pulled
via `pages_read_engagement`, proving the read happened and grounded the
suggestion.

---

## `pages_manage_engagement`

**How will your app use this permission?**

We use `pages_manage_engagement` to post reply comments on the brokerage's
Page comments, after a human has approved the draft. This is the FB analog of
the IG comment reply flow.

We do not delete, hide, ban, or otherwise moderate audience comments. The
permission is used exclusively to write reply comments.

**User-visible flow demonstrated in the screencast.** The operator approves a
draft reply to a public comment on the brokerage's FB Page. The screencast
shows the reply appearing under the original comment in both Harwick's UI and
in Facebook's native post view.

---

## Human Agent feature

**How will your app use this feature?**

Real-estate buyer conversations frequently span days — a lead messages on
Saturday night, the brokerage's agent gets to it Monday afternoon. The default
24h messaging window is too short for legitimate human-handled real-estate
correspondence. Harwick requests the Human Agent feature so workspace members
(humans) can send one reply per conversation between 24h and 7d after the
lead's last inbound message, with the `human_agent` message tag attached.

Every Human Agent message in Harwick is sent by a logged-in workspace member
clicking **Approve & send** in the conversation UI — never by automation,
never by template, never broadcast. The composer prominently displays which
window the conversation is currently in, and the tag is applied automatically
when the elapsed time is 24h–7d. Beyond 7d, the send button is disabled.

**User-visible flow demonstrated in the screencast.** The screencast shows a
conversation where the lead's last inbound message is ~30 hours old. The
composer displays the "human_agent tag · {remaining time}" indicator. The
member edits a draft, clicks **Approve & send**, and the message lands in the
lead's IG/FB DM thread on a phone. We then show a second conversation where
the last inbound is ~9 days old; the same composer surfaces "outside reply
window" and the send action is blocked.

---

## Test credentials (to attach to every submission)

```
Login URL:     https://harwick.lol/login
Email:         review@harwick.lol
Password:      <set this to a strong unique value before submitting>
Workspace:     Reviewer Sandbox
Reviewer playbook:
  1. Open the login URL and sign in with the credentials above.
  2. You will land in the Reviewer Sandbox workspace.
  3. Open Settings → Integrations. The "Instagram + Facebook" card shows the
     connected Page "Harwick Review Page" and IG Business Account
     @harwick_review_brokerage.
  4. Open the Connect Meta link below to see the public scope-disclosure page:
     https://harwick.lol/connect/meta
  5. From a SECOND Instagram or Facebook account (NOT review@harwick.lol),
     send a DM to @harwick_review_brokerage or comment on its newest post.
  6. Return to Harwick. The DM/comment appears in /conversations within a
     few seconds.
  7. Click the conversation. The composer shows the messaging-window
     indicator ("24h window · ~23h left"). Click "Generate draft", edit if
     needed, click "Approve & send". The reply appears in the second
     account's DM thread.
  8. To verify human_agent: open the conversation labeled
     "Reviewer · human_agent window". The composer shows
     "human_agent tag · {N}d left". Same send flow.
  9. To verify disconnect: Settings → Integrations → "disconnect Meta".
     Confirm in the modal. Tokens are revoked; the Page card shows
     "disconnected". Re-connecting requires the full OAuth flow.
```

---

## Live mode submission checklist

- [ ] Privacy Policy URL set in App Settings → Basic (https://harwick.lol/privacy)
- [ ] Terms of Service URL set in App Settings → Basic (https://harwick.lol/terms)
- [ ] Data Deletion Instructions URL set (https://harwick.lol/data-deletion)
- [ ] Data Deletion Callback URL set (https://harwick.lol/api/meta/data-deletion)
- [ ] Deauthorize Callback URL set (https://harwick.lol/api/meta/deauthorize)
- [ ] Webhook callback URL set (https://harwick.lol/api/meta/webhook) and verify token configured
- [ ] App icon uploaded (1024x1024 PNG, no transparency)
- [ ] App category set to "Business and Pages" or "Messaging"
- [ ] App Domain set to `harwick.lol` with valid TLS
- [ ] Business Verification submitted and approved
- [ ] App linked to verified Business Portfolio
- [ ] Per-permission justifications pasted (8 permissions + Human Agent feature)
- [ ] Per-permission screencasts attached (8 + 1)
- [ ] Test credentials + reviewer playbook included
- [ ] At least one successful prod API call logged per permission
- [ ] All requested permissions flipped to Advanced Access intent
- [ ] No unused permissions in the request (strip anything not in the demo)
