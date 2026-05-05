import type { SocialPostContext } from "@realty-ops/core";
import { SocialPostContextSchema, type Logger } from "@realty-ops/core";
import type { VisionClient } from "@realty-ops/integrations";

export type PostVisionHydratorDependencies = {
  vision: VisionClient;
  logger: Logger;
};

const VISION_PROMPT = [
  "You are an experienced real estate agent looking at a property photo from a social media post.",
  "Describe the property in 4-6 sentences for another agent who has not seen the photo.",
  "Cover floor finish, layout impression, outdoor space, architectural style, condition, and any feature a buyer might ask about.",
  "Stay factual. Do not guess square footage, price, or address. Do not speculate beyond what the image shows.",
].join(" ");

export async function hydratePostVisualDescription(
  deps: PostVisionHydratorDependencies,
  context: SocialPostContext,
): Promise<SocialPostContext> {
  if (context.visualDescription !== null && context.visualDescription.trim().length > 0) {
    return context;
  }
  if (context.mediaUrl === null || context.mediaUrl.trim().length === 0) {
    return context;
  }

  try {
    const description = await deps.vision.describePropertyImage({
      imageUrl: context.mediaUrl,
      prompt: VISION_PROMPT,
    });

    if (description.trim().length === 0) {
      return context;
    }

    return SocialPostContextSchema.parse({
      ...context,
      visualDescription: description.slice(0, 2000),
    });
  } catch (error) {
    deps.logger.warn("post vision hydration failed; continuing with text-only context", {
      workspaceId: context.workspaceId,
      sourcePostId: context.sourcePostId,
      mediaUrl: context.mediaUrl,
      error,
    });
    return context;
  }
}

export async function hydratePostVisualDescriptions(
  deps: PostVisionHydratorDependencies,
  contexts: SocialPostContext[],
): Promise<SocialPostContext[]> {
  return Promise.all(contexts.map((context) => hydratePostVisualDescription(deps, context)));
}
