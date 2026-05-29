import {
  JudgmentEnvelopeSchema,
  type Audience,
  type Destination,
  type JudgmentEnvelope,
  type ToolDefinition,
  type ToolExecutor,
} from "@realty-ops/core";
import { createOpenAISmallModelClient } from "@realty-ops/integrations";

/**
 * Production tool executor — invokes OpenAI for every judgment tool.
 *
 * Replaces the Phase 0 stub. For each call:
 *   1. Pick model based on tool.modelTier + modelOverride (escalation)
 *   2. Build messages via tool.systemPrompt(audience, destination) +
 *      tool.userPromptShape(input)
 *   3. Request JSON-only response_format
 *   4. Parse + validate against the tool's outputSchema (or JudgmentEnvelopeSchema)
 *   5. Return envelope + model id + token counts
 *
 * Returns low-confidence envelope on parse failure so the runner gracefully
 * aborts and falls back to deterministic rule. NEVER throws — tool execution
 * failures should never break the user-facing call path.
 */

const MINI_MODEL = process.env["HARWICK_JUDGMENT_MINI_MODEL"] ?? "gpt-4o-mini";
const STRONG_MODEL = process.env["HARWICK_JUDGMENT_STRONG_MODEL"] ?? "gpt-4o";

function resolveModel(tool: ToolDefinition, modelOverride: "mini" | "strong" | null): string {
  if (modelOverride === "strong") return STRONG_MODEL;
  if (modelOverride === "mini") return MINI_MODEL;
  return tool.modelTier === "strong" ? STRONG_MODEL : MINI_MODEL;
}

function lowConfidenceEnvelope(toolName: string, reason: string): JudgmentEnvelope {
  return {
    verdict: "execution_failed",
    brief: {
      headline: `${toolName} execution failed`,
      body: `Judgment tool execution failed: ${reason}. Caller should fall back to deterministic rule.`,
    },
    deltas: [],
    suggestedActions: [],
    confidence: 0,
    rationale: reason,
  };
}

function estimateTokenCount(text: string): number {
  // Conservative ~4 chars/token heuristic — close enough for cost attribution
  // when the OpenAI response doesn't surface usage. Used as a fallback only.
  return Math.ceil(text.length / 4);
}

export function createOpenAIToolExecutor(): ToolExecutor {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (apiKey === undefined || apiKey.length === 0) {
    // No API key configured — executor still callable but returns
    // low-confidence envelopes that route to fallback.
    return async ({ tool }) => ({
      envelope: lowConfidenceEnvelope(tool.name, "OPENAI_API_KEY not configured"),
      modelUsed: "none",
      inputTokens: 0,
      outputTokens: 0,
    });
  }

  return async ({ tool, audience, destination, input, modelOverride }) => {
    const model = resolveModel(tool, modelOverride);
    const client = createOpenAISmallModelClient({ apiKey, model });
    const instructions = tool.systemPrompt(audience as Audience, destination as Destination);
    const userInput = tool.userPromptShape(input);

    try {
      const parsed = await client.classify({
        schema: JudgmentEnvelopeSchema,
        instructions,
        input: userInput,
        temperature: 0.2,
        maxTokens: 1200,
      });
      // Normalize optional fields the schema defaults — runner expects required.
      const envelope: JudgmentEnvelope = {
        verdict: parsed.verdict,
        brief: parsed.brief,
        deltas: parsed.deltas ?? [],
        suggestedActions: (parsed.suggestedActions ?? []).map((a) => ({
          label: a.label,
          action: a.action,
          payload: a.payload ?? {},
          tone: a.tone ?? "primary",
        })),
        confidence: parsed.confidence,
        rationale: parsed.rationale ?? null,
      };
      return {
        envelope,
        modelUsed: model,
        inputTokens: estimateTokenCount(instructions + userInput),
        outputTokens: estimateTokenCount(JSON.stringify(envelope)),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[judgment-tool] ${tool.name} executor failed:`, reason);
      return {
        envelope: lowConfidenceEnvelope(tool.name, reason),
        modelUsed: model,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  };
}
