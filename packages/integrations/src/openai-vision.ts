import { z } from "zod";

const VisionResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.string(),
    }),
  })).min(1),
});

export type VisionClient = {
  describePropertyImage(params: { imageUrl: string; prompt?: string }): Promise<string>;
};

export type OpenAIVisionClientOptions = {
  apiKey: string;
  model?: string;
  fetchImpl?: typeof fetch;
};

const DEFAULT_MODEL = "gpt-4o-mini";

const DEFAULT_PROMPT = [
  "You are an experienced real estate agent looking at a property photo posted on social media.",
  "Describe what you see in 4-6 sentences for another agent who has not seen the photo.",
  "Cover: floor type and finish, layout impression, outdoor space if any, architectural style, condition, and any feature a buyer might ask about (pool, view, kitchen island, etc.).",
  "Stay factual. Do not guess square footage or price. Do not speculate beyond what is visible.",
].join(" ");

export function createOpenAIVisionClient(options: OpenAIVisionClientOptions): VisionClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const model = options.model ?? DEFAULT_MODEL;

  return {
    async describePropertyImage(params) {
      if (params.imageUrl.trim().length === 0) {
        throw new Error("Cannot describe an empty image URL.");
      }

      const response = await fetchImpl("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: params.prompt ?? DEFAULT_PROMPT },
                { type: "image_url", image_url: { url: params.imageUrl } },
              ],
            },
          ],
          temperature: 0.2,
          max_tokens: 320,
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`OpenAI vision request failed: ${response.status} ${response.statusText} ${detail}`);
      }

      const parsed = VisionResponseSchema.parse(await response.json());
      return parsed.choices[0]!.message.content.trim();
    },
  };
}
