import { z } from "zod";
import {
  AudienceSchema,
  DestinationSchema,
  JudgmentEnvelopeSchema,
  JudgmentRunInputSchema,
  type Audience,
  type Destination,
  type JudgmentEnvelope,
  type JudgmentRunInput,
  type JudgmentRunResult,
  type JudgmentToolName,
} from "./envelope.js";
import { audienceHash, stateHash } from "./state-hash.js";
import { getTool, notImplementedEnvelope, type ToolDefinition } from "./registry.js";

/**
 * runJudgment — single entry point for invoking any judgment tool.
 *
 * Handles, in order:
 *   1. Tool lookup + input validation against tool's schema
 *   2. State-hash computation for cache key
 *   3. Cache read via the provided BriefCacheReader (cache hit -> return immediately)
 *   4. Tool execution via the provided ToolExecutor (mini default, escalate to
 *      strong if returned confidence < 0.65)
 *   5. Cache write via BriefCacheWriter
 *   6. training_signals row write via TrainingSignalWriter (every emission
 *      becomes a labeled-later training example)
 *
 * The runner is pure dependency-injection — readers/writers/executors are
 * passed in. This keeps packages/core free of fetch/openai/supabase imports
 * so it stays universal. The apps/web side wires real implementations.
 */

export type BriefCacheReader = (params: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  audienceHash: string;
  destination: Destination;
}) => Promise<{
  envelope: JudgmentEnvelope;
  stateHash: string;
  model: string;
  generatedAt: string;
} | null>;

export type BriefCacheWriter = (params: {
  workspaceId: string;
  entityType: string;
  entityId: string;
  audienceHash: string;
  destination: Destination;
  audience: Audience;
  envelope: JudgmentEnvelope;
  stateHash: string;
  model: string;
  expiresAt: string | null;
}) => Promise<void>;

export type TrainingSignalWriter = (params: {
  workspaceId: string;
  tool: JudgmentToolName;
  artifactType: string;
  artifactId: string | null;
  inputs: Record<string, unknown>;
  outputs: JudgmentEnvelope;
  modelId: string;
  confidence: number;
  inputTokens: number;
  outputTokens: number;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}) => Promise<{ trainingSignalId: string }>;

export type ToolExecutor = (params: {
  tool: ToolDefinition;
  audience: Audience;
  destination: Destination;
  input: Record<string, unknown>;
  modelOverride: "mini" | "strong" | null;
}) => Promise<{
  envelope: JudgmentEnvelope;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
}>;

export type RunJudgmentDeps = {
  readBriefCache: BriefCacheReader;
  writeBriefCache: BriefCacheWriter;
  writeTrainingSignal: TrainingSignalWriter;
  executeTool: ToolExecutor;
  /**
   * Used to derive entity_type + entity_id from a tool's input for cache key
   * construction. Different tools nest entity identifiers differently
   * (briefEntity.input.id vs reconcileQualification.input.leadId).
   */
  deriveEntityIdentity: (tool: JudgmentToolName, input: Record<string, unknown>) => {
    entityType: string;
    entityId: string;
  };
  computeCostUsd: (model: string, inputTokens: number, outputTokens: number) => number;
};

/**
 * Lowest confidence we accept before escalating to strong model. Mirrors the
 * governance doc in /memory: < 0.65 on mini -> retry on strong;
 * < 0.5 on strong -> return null + fall back to deterministic rule.
 */
const ESCALATE_CONFIDENCE_FLOOR = 0.65;
const ABORT_CONFIDENCE_FLOOR = 0.5;

export async function runJudgment(
  rawInput: JudgmentRunInput,
  deps: RunJudgmentDeps,
): Promise<JudgmentRunResult> {
  const parsed = JudgmentRunInputSchema.parse(rawInput);
  const tool = getTool(parsed.tool);

  const validatedInput = tool.inputSchema.safeParse(parsed.input);
  if (!validatedInput.success) {
    // Bad input: don't burn a model call. Return a not-implemented envelope
    // so the caller falls back to deterministic logic.
    const envelope = notImplementedEnvelope(parsed.tool);
    return {
      envelope,
      cached: false,
      model: "none",
      stateHash: "",
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      trainingSignalId: null,
      generatedAt: new Date().toISOString(),
    };
  }

  const { entityType, entityId } = deps.deriveEntityIdentity(parsed.tool, parsed.input);
  const computedStateHash = stateHash({
    tool: parsed.tool,
    input: parsed.input,
  });
  const audienceHashValue = audienceHash(parsed.audience);

  // 1. Cache read
  if (!parsed.forceRegen) {
    const cached = await deps.readBriefCache({
      workspaceId: parsed.workspaceId,
      entityType,
      entityId,
      audienceHash: audienceHashValue,
      destination: parsed.destination,
    });
    if (cached !== null && cached.stateHash === computedStateHash) {
      return {
        envelope: cached.envelope,
        cached: true,
        model: cached.model,
        stateHash: cached.stateHash,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
        trainingSignalId: null,
        generatedAt: cached.generatedAt,
      };
    }
  }

  // 2. Execute (mini first)
  let exec = await deps.executeTool({
    tool,
    audience: parsed.audience,
    destination: parsed.destination,
    input: parsed.input,
    modelOverride: null,
  });

  // 3. Escalate to strong if low confidence
  if (exec.envelope.confidence < ESCALATE_CONFIDENCE_FLOOR && tool.modelTier === "mini") {
    const strong = await deps.executeTool({
      tool,
      audience: parsed.audience,
      destination: parsed.destination,
      input: parsed.input,
      modelOverride: "strong",
    });
    exec = strong;
  }

  // 4. Abort floor: if strong model still below threshold, surface low-confidence
  //    output but the caller is expected to fall back to deterministic rule.
  //    We still write the training_signals row so the corpus captures the failure.
  const aborted = exec.envelope.confidence < ABORT_CONFIDENCE_FLOOR;

  // 5. Write to cache (unless aborted — we don't want low-quality output served
  //    on subsequent calls)
  const generatedAt = new Date().toISOString();
  if (!aborted) {
    await deps.writeBriefCache({
      workspaceId: parsed.workspaceId,
      entityType,
      entityId,
      audienceHash: audienceHashValue,
      destination: parsed.destination,
      audience: parsed.audience,
      envelope: exec.envelope,
      stateHash: computedStateHash,
      model: exec.modelUsed,
      expiresAt: null,
    });
  }

  // 6. Write training signal (always — failures are valuable training negatives)
  const { trainingSignalId } = await deps.writeTrainingSignal({
    workspaceId: parsed.workspaceId,
    tool: parsed.tool,
    artifactType: `judgment:${parsed.tool}`,
    artifactId: null,
    inputs: parsed.input,
    outputs: exec.envelope,
    modelId: exec.modelUsed,
    confidence: exec.envelope.confidence,
    inputTokens: exec.inputTokens,
    outputTokens: exec.outputTokens,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
  });

  const costUsd = deps.computeCostUsd(exec.modelUsed, exec.inputTokens, exec.outputTokens);

  return {
    envelope: exec.envelope,
    cached: false,
    model: exec.modelUsed,
    stateHash: computedStateHash,
    inputTokens: exec.inputTokens,
    outputTokens: exec.outputTokens,
    costUsd,
    trainingSignalId,
    generatedAt,
  };
}

/**
 * Default cost-per-million-tokens table. Caller can override.
 * Reflects OpenAI pricing as of 2026-05-29.
 */
export const DEFAULT_MODEL_COSTS = {
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "gpt-4o": { input: 2.50, output: 10.00 },
  "gpt-5.2": { input: 2.00, output: 8.00 },
  "gpt-5.5": { input: 5.00, output: 15.00 },
} as const;

export function computeDefaultCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rates = DEFAULT_MODEL_COSTS[model as keyof typeof DEFAULT_MODEL_COSTS];
  if (rates === undefined) return 0;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}
