import { z } from "zod";
import {
  AudienceSchema,
  DestinationSchema,
  JudgmentEnvelopeSchema,
  JudgmentToolNameSchema,
  type Audience,
  type Destination,
  type JudgmentEnvelope,
  type JudgmentToolName,
} from "./envelope.js";

/**
 * Registry of all 13 judgment tools. Each tool defines its IO contract:
 *
 *   - inputSchema: tool-specific structured input (e.g. for briefEntity,
 *     {type: "lead", id, leadState, relatedTasks, crmState, ...}).
 *   - systemPrompt(audience, destination): produces the system-prompt
 *     prologue for this tool given the role/destination context.
 *   - userPromptShape: how the input gets serialized into the user-turn.
 *   - outputSchema: the structured output we expect (typically extends
 *     JudgmentEnvelopeSchema with tool-specific verdict + deltas).
 *   - modelTier: default model tier (mini | strong) before runtime
 *     escalation kicks in.
 *
 * Each tool is registered as a stub here. Phase 1+ implementations
 * fill in real prompts. Importers can call into the registry safely
 * before a tool is fully implemented — they get a "not_implemented"
 * envelope back with confidence: 0, which the runner treats as
 * "fall back to deterministic rule."
 */
export type JudgmentModelTier = "mini" | "strong";

export type ToolDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny> = {
  name: JudgmentToolName;
  inputSchema: TInput;
  outputSchema: z.ZodTypeAny;
  modelTier: JudgmentModelTier;
  systemPrompt: (audience: Audience, destination: Destination) => string;
  userPromptShape: (input: z.infer<TInput>) => string;
};

const stubInputSchema = z.record(z.string(), z.unknown());

const stubSystemPrompt = (tool: JudgmentToolName) =>
  (audience: Audience, destination: Destination): string =>
    `You are Harwick's ${tool} judgment tool. Audience: ${audience.role} (scope: ${audience.scope}). Destination: ${destination}.\n` +
    `This tool is not fully implemented yet. Return a low-confidence envelope so the caller falls back to the deterministic rule.`;

const stubUserPromptShape = (input: Record<string, unknown>): string =>
  `Input fields: ${Object.keys(input).join(", ")}.`;

function defineStub(name: JudgmentToolName, modelTier: JudgmentModelTier = "mini"): ToolDefinition {
  return {
    name,
    inputSchema: stubInputSchema,
    outputSchema: JudgmentEnvelopeSchema,
    modelTier,
    systemPrompt: stubSystemPrompt(name),
    userPromptShape: stubUserPromptShape,
  };
}

const tools: Record<JudgmentToolName, ToolDefinition> = {
  briefEntity: defineStub("briefEntity"),
  triageQueue: defineStub("triageQueue"),
  reconcileQualification: defineStub("reconcileQualification", "strong"),
  recommendRouting: defineStub("recommendRouting"),
  classifyActionability: defineStub("classifyActionability"),
  decideAction: defineStub("decideAction"),
  dedupeTask: defineStub("dedupeTask"),
  interpretPolicy: defineStub("interpretPolicy"),
  pickNurtureAction: defineStub("pickNurtureAction"),
  inferVoiceOutcome: defineStub("inferVoiceOutcome"),
  briefWorkspace: defineStub("briefWorkspace"),
  briefTeamMember: defineStub("briefTeamMember"),
  reconcileConflict: defineStub("reconcileConflict", "strong"),
};

export function getTool(name: JudgmentToolName): ToolDefinition {
  return tools[name];
}

/**
 * Register a real implementation, replacing the stub. Called from each tool's
 * own module when it lands. Phase-by-phase rollout: as each tool implementation
 * loads, it registers itself here; until then the stub returns low confidence
 * and the runner falls back to deterministic rules.
 */
export function registerTool<TInput extends z.ZodTypeAny>(
  definition: ToolDefinition<TInput>,
): void {
  tools[definition.name] = definition as unknown as ToolDefinition;
}

export function notImplementedEnvelope(toolName: JudgmentToolName): JudgmentEnvelope {
  return {
    verdict: "not_implemented",
    brief: {
      headline: `${toolName} not yet implemented`,
      body: `The ${toolName} judgment tool is registered but does not have a live implementation yet. The caller should fall back to the deterministic rule for this surface.`,
    },
    deltas: [],
    suggestedActions: [],
    confidence: 0,
    rationale: null,
  };
}

export { JudgmentToolNameSchema, AudienceSchema, DestinationSchema };
