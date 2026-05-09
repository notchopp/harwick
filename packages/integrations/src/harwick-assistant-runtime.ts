import {
  HarwickAssistantResponseSchema,
  HarwickAssistantRuntimeInputSchema,
  type HarwickAssistantResponse,
  type HarwickAssistantRuntimeInput,
} from "@realty-ops/core";
import { z } from "zod";
import { buildHarwickToolCatalogPrompt } from "./harwick-ai-tool-registry.js";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

const OpenAIResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string().optional(),
    }).passthrough(),
  }).passthrough()).optional(),
  output_text: z.string().trim().min(1).optional(),
  output: z.array(z.object({
    content: z.array(z.object({
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()).optional(),
}).passthrough();

export type HarwickAssistantRuntimeClient = {
  run(input: HarwickAssistantRuntimeInput): Promise<HarwickAssistantResponse>;
};

export type OpenAIHarwickAssistantRuntimeOptions = {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
};

function extractResponseText(value: unknown): string {
  const parsed = OpenAIResponseSchema.parse(value);

  if (parsed.choices !== undefined && parsed.choices.length > 0) {
    const content = parsed.choices[0]?.message?.content;
    if (content !== undefined && typeof content === "string" && content.trim().length > 0) {
      return content;
    }
  }

  if (parsed.output_text !== undefined) {
    return parsed.output_text;
  }

  const text = parsed.output
    ?.flatMap((item) => {
      if (!Array.isArray(item.content)) return [];
      return item.content.map((content) => {
        if ((content as { type?: string; text?: string }).type === "output_text" && typeof content.text === "string") {
          return content.text;
        }
        return content.text;
      });
    })
    .find((candidate): candidate is string => candidate !== undefined && candidate.trim().length > 0);

  if (text === undefined) {
    throw new Error("OpenAI response did not include text output.");
  }

  return text;
}

function parseUnknownJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}

function parseAssistantResponse(value: string): HarwickAssistantResponse {
  const parsed = parseUnknownJson(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return HarwickAssistantResponseSchema.parse(parsed);
  }
  const data = parsed as Record<string, unknown>;
  const toolCalls = data["toolCalls"];
  if (Array.isArray(toolCalls)) {
    data["toolCalls"] = toolCalls.map((call: unknown) => {
      if (call === null || typeof call !== "object" || Array.isArray(call)) {
        return call;
      }
      const record = call as Record<string, unknown>;
      return {
        ...record,
        payload: typeof record["payload"] === "string" ? parseUnknownJson(record["payload"]) : record["payload"],
      };
    });
  }
  return HarwickAssistantResponseSchema.parse(data);
}

export function createOpenAIHarwickAssistantRuntime(
  options: OpenAIHarwickAssistantRuntimeOptions,
): HarwickAssistantRuntimeClient {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async run(input: HarwickAssistantRuntimeInput): Promise<HarwickAssistantResponse> {
      const parsed = HarwickAssistantRuntimeInputSchema.parse(input);
      const response = await fetchImpl(`${OPENAI_API_BASE_URL}/responses`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: options.model,
          instructions: [
            "You are Harwick, the real estate workspace chief of staff operating through the home command surface.",
            "Answer the operator using only the live workspace context provided below.",
            "Never invent lead facts, routing outcomes, tool executions, provider sends, calendar bookings, or CRM writes.",
            "If context is insufficient, say exactly what is missing instead of guessing.",
            "",
            "REAL HARWICK TOOLS:",
            "Use only the real Harwick tools from this catalog when toolCalls are helpful. Do not invent tool names or fake capabilities.",
            buildHarwickToolCatalogPrompt(),
            "",
            "OUTPUT RULES:",
            "Return only valid JSON matching the requested schema.",
            "answer: concise operator-facing answer.",
            "scope: 'Workspace' or the concrete lead/person scope you are discussing.",
            "reasoningSteps: 1-5 short operational steps describing what you considered.",
            "toolCalls: zero or more real Harwick tool calls. Treat them as recommended next steps, not already executed actions.",
            "artifact: include only when the operator explicitly asks for a draft, brief, plan, reply, or policy. Use title, type, version='v1', and 1-2 versions.",
            "followUpQuestion: include only when one missing constraint blocks a better answer. Provide 2-6 options.",
            "Do not use markdown outside artifact.body.",
          ].join("\n"),
          input: JSON.stringify(parsed),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI Harwick assistant failed (${response.status}): ${text}`);
      }

      const json: unknown = await response.json();
      return parseAssistantResponse(extractResponseText(json).trim());
    },
  };
}
