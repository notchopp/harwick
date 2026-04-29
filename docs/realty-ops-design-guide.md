# Realty Ops Design Guide

This is the design standard for the web app. The product should feel quiet, premium, and operational: closer to Apple settings, Linear density, and a high-end brokerage back office than a loud CRM.

## Visual Direction

- Primary surface: gray and white.
- Mood: clean, calm, exact, expensive.
- Avoid heavy brand color, loud gradients, oversized marketing panels, and decorative dashboard noise.
- Let hierarchy come from spacing, type weight, borders, subtle elevation, and state clarity.
- Use restrained accent color only for status, selected state, and primary action.

## Palette

Use a neutral system first:

- `background`: near white, not pure blue-gray.
- `surface`: white.
- `surface-muted`: soft neutral gray.
- `border`: light neutral gray.
- `text`: near black.
- `text-muted`: mid gray.
- `accent`: graphite or black for primary action.

Status colors should be sparse:

- hot lead: controlled red or vermilion
- warm/nurture: amber
- qualified/active: green
- syncing/system: blue
- archived/lost: gray

Never let status colors dominate the screen. They should work as small chips, dots, rings, and table indicators.

## Component Stack

- Use real `shadcn/ui` components backed by Radix primitives for buttons, dialogs, sheets, dropdowns, tabs, selects, popovers, command menus, tooltips, toasts, tables, and forms.
- Build custom product components by composing shadcn primitives. Do not paste generic dashboard kits.
- Custom components belong under `apps/web/src/components`.
- Feature composition belongs under `apps/web/src/features`.
- Use `lucide-react` icons in icon buttons and navigation where available.

## Custom Product Components

Build these as hand-made primitives:

- `AppShell`: sidebar, top bar, workspace switcher, command entry.
- `LeadInbox`: dense lead list with channel, score, last touch, assignment, and SLA state.
- `LeadDetail`: conversation, qualification fields, timeline, notes, source context, and sync state.
- `PipelineBoard`: stage columns for lead progression.
- `ConversationPane`: DM/SMS/call transcript history with safe composer states.
- `AssignmentPanel`: agent routing, workload, override, and reassignment.
- `IntegrationCard`: connection status, health, reconnect, and last sync.
- `AutomationRuleBuilder`: readable trigger-condition-action blocks.
- `SlaIndicator`: small urgency indicator for lead response windows.
- `SourceBadge`: Instagram DM, Instagram comment, call, SMS, manual.

## Layout Rules

- No floating marketing sections inside the app.
- No cards inside cards.
- Cards are for repeated records, modals, and framed tools only.
- Prefer full-width application regions with clear panels and table/list density.
- Keep the first viewport useful: inbox, pipeline, or work queue, not hero copy.
- Navigation should support repeated daily use: stable, predictable, low-friction.
- Lead screens should optimize scanning and action speed over decorative composition.

## Typography

- Use a modern sans stack appropriate for an operational SaaS.
- Keep type restrained and crisp.
- Use strong weight changes instead of large font-size jumps.
- Avoid hero-scale headings inside dashboards.
- Do not use negative letter spacing.
- Do not scale font size with viewport width.

## Interaction

- Use sheets for lead detail, assignment, and integration setup when the user should keep context.
- Use dialogs for destructive actions and credential confirmation.
- Use command menu for global create/search/jump actions.
- Use segmented controls for inbox filters.
- Use tables or dense lists for lead queues.
- Use tabs only when they reduce navigation cost.
- Every icon-only control needs a tooltip.
- Loading, empty, error, and disabled states must be designed, not left as plain text.

## Motion

- Motion should clarify state changes: sheet entry, row update, status transition, command menu open, toast feedback.
- Keep motion short and subtle.
- Respect reduced-motion settings when the implementation layer supports it.
- Do not use decorative background motion.

## Forms

- Use shadcn form primitives and Zod-backed schemas.
- Keep forms sectional and scannable.
- Validate client-side for speed and server-side for trust.
- Credential forms must explain only what the user needs to complete the connection.
- Secret inputs should never echo full tokens after save.

## Accessibility

- Maintain keyboard access for all primary workflows.
- Use visible focus states.
- Preserve Radix accessibility semantics when wrapping shadcn components.
- Minimum click/tap target is 40px for dense desktop controls and 44px for touch.
- Status cannot rely on color alone; use text, icons, or shape.

## Do Not Ship

- Purple SaaS gradients.
- Beige lifestyle UI.
- Giant hero sections inside the app.
- Generic CRM dashboard templates.
- Placeholder charts that do not answer broker questions.
- Unstyled tables.
- Raw provider payload text rendered directly in UI.
- Buttons with vague labels like `Submit` when the action has a real name.

