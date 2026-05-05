import { z } from "zod";

/**
 * Cost-tiered cognition: a thin client for the small-model tier. Used for
 * classification (is this a lead?), routing-assist (which agent is the best
 * historical fit?), and lite reasoning tasks where the agent loop would be
 * overkill.
 *
 * Defaults to gpt-4o-mini but accepts any OpenAI-compatible chat model id.
 * To run against Groq Llama or another OpenAI-compatible provider, swap the
 * baseUrl. To run against Anthropic Haiku, build a parallel client; this one
 * stays OpenAI-shaped on purpose for now.
 */

const ChatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })).min(1),
});

export type SmallModelClient = {
  /** Single-turn classify: returns parsed JSON matching the provided schema. */
  classify<T>(params: {
    schema: z.ZodSchema<T>;
    instructions: string;
    input: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<T>;
  /** Single-turn free-text response. */
  prompt(params: {
    instructions: string;
    input: string;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string>;
};

export type OpenAISmallModelClientOptions = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export function createOpenAISmallModelClient(options: OpenAISmallModelClientOptions): SmallModelClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_MODEL;
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;

  async function callChat(params: {
    instructions: string;
    input: string;
    temperature: number;
    maxTokens: number;
    responseFormat?: { type: "json_object" } | undefined;
  }): Promise<string> {
    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: params.instructions },
          { role: "user", content: params.input },
        ],
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        ...(params.responseFormat === undefined ? {} : { response_format: params.responseFormat }),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Small-model chat failed: ${response.status} ${response.statusText} ${detail}`);
    }

    const parsed = ChatResponseSchema.parse(await response.json());
    return parsed.choices[0]!.message.content;
  }

  return {
    async classify(params) {
      const responseText = await callChat({
        instructions: `${params.instructions}\n\nRespond with valid JSON only. No prose, no markdown, no commentary.`,
        input: params.input,
        temperature: params.temperature ?? 0.1,
        maxTokens: params.maxTokens ?? 400,
        responseFormat: { type: "json_object" },
      });
      let json: unknown;
      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Small-model classify returned non-JSON: ${responseText.slice(0, 200)}`);
      }
      return params.schema.parse(json);
    },

    async prompt(params) {
      return callChat({
        instructions: params.instructions,
        input: params.input,
        temperature: params.temperature ?? 0.3,
        maxTokens: params.maxTokens ?? 600,
      });
    },
  };
}
