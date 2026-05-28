/**
 * Cost-tiered cognition for the public-listing chat tool gates.
 *
 * The big model (gpt-4o) drives the conversation. When it tries to fire a
 * side-effect tool (`propose_showing_window`, `request_agent_callback`,
 * `capture_lead`), a small model (`gpt-4o-mini`) judges whether the payload
 * is actually substantive enough for a human agent to act on — and feeds
 * coaching back to the parent model if not.
 *
 * Why this layer exists (vs. regex): regex catches lexically-similar bad
 * phrases ("trusted lender network") but misses semantically-vague ones
 * ("we'll have someone reach out about the property") that read fine
 * lexically but are useless to the receiving agent. The same judgment is
 * needed across three different tools — keep it generic, share the
 * instructions block, surface a structured verdict.
 *
 * Floor + ceiling: a microsecond length check stays in the tool execute
 * as a fast-fail floor. The LLM hop is the semantic ceiling. If the LLM
 * call times out (>1500ms) or errors, the floor passes through — fail
 * open so a flaky inference provider can't block real handoffs.
 */
import { z } from "zod";
import type { SmallModelClient } from "@realty-ops/integrations";

export type GateJudgmentKind =
  | "callback_reason"
  | "showing_notes"
  | "lead_capture_summary";

export type GateJudgment =
  | { ok: true }
  | { ok: false; coaching: string };

const VerdictSchema = z.object({
  isActionable: z.boolean(),
  // What's missing if not actionable. Helps the parent model recover.
  // Always a short phrase ("who specifically is calling", "what topic").
  missing: z.array(z.string()).max(4),
  // One sentence the parent model can read as coaching. The error
  // returned to the parent is literally this string.
  coaching: z.string(),
});

const INSTRUCTIONS = `You are the quality gate for a real-estate brokerage's lead-handoff system.

The conversational agent ("Harwick") is about to fire a side-effect tool that
creates a task or lead for a human agent. Your job: judge whether the payload
is concrete enough that the human agent would walk into the call/showing
prepared, or whether it's filler that wastes their time.

ACTIONABLE looks like:
  callback_reason: "First-time cash buyer wants lender intro for $625k home at
                    18611 Parkland Crossing, $200k down. Asked about loan terms."
  showing_notes:   "Clinton — family of 6, wants Cross Creek Ranch tour Tuesday
                    4pm. Already pre-approved. Asked about media room."
  lead_capture_summary: "Martha + husband, 3 kids middle-school, getting married
                         June, need Coral Gables under $2.5M before fall."

NOT ACTIONABLE looks like:
  callback_reason: "trusted lender network" / "agent will reach out" /
                   "lender intro" / "callback" / "needs help"
  showing_notes:   "Buyer wants a tour" / "interested in property"
  lead_capture_summary: "Buyer is interested" / "wants more info"

Return JSON:
{
  "isActionable": boolean,
  "missing": ["short phrase about what's missing", ...],
  "coaching": "ONE sentence telling the conversational agent what to ask next."
}

If isActionable is true, set missing to [] and coaching to "".
Be strict: when in doubt, mark not actionable so the agent asks one more
question instead of handing the human a vague task.`;

export type ListingChatGateJudge = (params: {
  kind: GateJudgmentKind;
  value: string;
  qualificationContext: Record<string, unknown>;
}) => Promise<GateJudgment>;

/**
 * Build a judge backed by a `SmallModelClient`. Times out after `timeoutMs`
 * and resolves to `{ ok: true }` on timeout/error (fail open — the floor
 * check inside the tool already screens the obvious cases).
 */
export function createSmallModelGateJudge(params: {
  smallModel: SmallModelClient;
  timeoutMs?: number;
  onFallback?: (reason: "timeout" | "error", details: unknown) => void;
}): ListingChatGateJudge {
  const timeoutMs = params.timeoutMs ?? 1500;
  return async ({ kind, value, qualificationContext }) => {
    const input = JSON.stringify({
      kind,
      value,
      qualification: qualificationContext,
    });
    const judgmentPromise = params.smallModel.classify({
      schema: VerdictSchema,
      instructions: INSTRUCTIONS,
      input,
      temperature: 0.1,
      maxTokens: 200,
    });
    const timeoutPromise = new Promise<{ __timedOut: true }>((resolve) => {
      setTimeout(() => resolve({ __timedOut: true }), timeoutMs);
    });
    try {
      const result = await Promise.race([judgmentPromise, timeoutPromise]);
      if ("__timedOut" in result) {
        params.onFallback?.("timeout", { kind, timeoutMs });
        return { ok: true };
      }
      if (result.isActionable) return { ok: true };
      const coaching = result.coaching.trim().length > 0
        ? result.coaching.trim()
        : `Payload too vague — missing: ${result.missing.join(", ")}.`;
      return { ok: false, coaching };
    } catch (error) {
      params.onFallback?.("error", error);
      return { ok: true };
    }
  };
}
