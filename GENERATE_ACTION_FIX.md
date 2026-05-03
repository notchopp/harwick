# Fixing Resume AI and Generate Action Buttons

## Problem
The user was experiencing the following issues:
1. "Generate Action" button calling `/api/meta/reply/draft` endpoint which fails with "invalid_request"
2. "Resume AI" button just toggles automation locally without actually generating a response
3. No reliable backend API endpoints for manual AI turn generation

## Solution

### 1. Created New Backend Endpoint
**File:** `apps/web/src/app/api/workspaces/[workspaceId]/harwick-ai/generate-action/route.ts`

This endpoint:
- Takes only `{ leadId }` as input
- Automatically fetches the latest lead event and context from the database
- Calls Harwick AI turn generator to create a new AI response
- Optionally auto-sends the reply via Meta if automation policy allows
- Returns `{ turnId, reply, sent?, sentStatus? }`

This is much simpler and more reliable than the previous `/api/meta/reply/draft` approach.

### 2. Updated UI Buttons

**File:** `apps/web/src/features/conversations/conversations-page.tsx`

#### "Generate Action" Button
- **Old:** Called `/api/meta/reply/draft` with extensive context that often resulted in "invalid_request" errors
- **New:** Calls `/api/workspaces/{workspaceId}/harwick-ai/generate-action` with just the leadId
- The backend now handles fetching all necessary context automatically

#### "Resume AI" Button  
- **Old:** Just toggled automation mode locally and returned with status "Automation updated locally"
- **New:** When mode is "ai_on" (resuming), it calls `handleGenerateAction` to:
  1. Generate a new AI turn to continue the conversation
  2. Return the AI response immediately
  3. Auto-send if automation allows
- When mode is "human_takeover" (taking over), it still just toggles automation

## How It Works Now

### DM Arrives → AI Responds
1. DM comes in and creates a `lead_event`
2. The webhook or job triggers the turn endpoint to generate an AI turn
3. If automation is enabled, the turn is auto-sent via Meta

### User Clicks "Generate Action"
1. UI calls `/api/workspaces/{workspaceId}/harwick-ai/generate-action` with `leadId`
2. Backend:
   - Fetches the lead and latest event
   - Generates a new AI turn using Harwick AI runtime
   - Checks automation policy (canAutoExecute, approvedTools, etc.)
   - If automation allows, sends the reply via Meta API
3. UI receives `{ turnId, reply, sent }` and displays it
4. If not auto-sent, user can click "Send" button to send it

### User Clicks "Resume AI"
1. UI calls `handleAutomationAction` with mode "ai_on"
2. This triggers `handleGenerateAction`, which generates a new turn
3. Same flow as "Generate Action" - reply is generated and optionally auto-sent

### User Clicks "Take Over"
1. UI calls `handleAutomationAction` with mode "human_takeover"
2. Backend just toggles automation to paused
3. User is now in control and can manually send replies

## Testing

### Quick Test
```bash
node test-generate-action.js <workspaceId> <leadId>
```

### Manual Testing in UI
1. Go to Conversations page
2. Select a conversation with AI-generated replies
3. Click "Generate Action" button
   - Should show "Generating AI action..." status
   - Should display AI-generated reply
   - If automation enabled, should show "AI action generated and sent automatically."
   - If not, should show "AI action generated. Ready to send."
4. Click "Resume AI" button
   - Should generate next turn to continue conversation
   - Should show similar success message

## Key Improvements
✓ Boring and reliable - no more "invalid_request" errors
✓ Simpler API - just need leadId, backend fetches context
✓ Auto-send support - respects automation policy
✓ Works for both manual and automated flows
✓ Better error messages and status feedback
✓ Type-safe with proper TypeScript checking
✓ Passes linting and testing
