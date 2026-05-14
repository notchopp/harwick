import type { HarwickToolDefinition } from "../registry";
import { MEMORY_TOOLS } from "./memory";
import { SEMANTIC_SEARCH_TOOLS } from "./semantic-search";
import { CALENDAR_TOOLS } from "./calendar";
import { PIPELINE_TOOLS } from "./pipeline";
import { CROSS_CHANNEL_TOOLS } from "./cross-channel";
import { SELF_AWARENESS_TOOLS } from "./self-awareness";
import { BRIEFING_TOOLS } from "./briefings";
import { ANYTHING_TOOLS } from "./anything";

/**
 * The full registry of new (post-rebuild) Harwick tools, organized by category.
 * Merged into the rail runtime alongside the existing inline tool definitions
 * until those are migrated into this same structure.
 */
export const OPERATOR_CHAT_REGISTRY: HarwickToolDefinition[] = [
  ...MEMORY_TOOLS,
  ...SEMANTIC_SEARCH_TOOLS,
  ...CALENDAR_TOOLS,
  ...PIPELINE_TOOLS,
  ...CROSS_CHANNEL_TOOLS,
  ...SELF_AWARENESS_TOOLS,
  ...BRIEFING_TOOLS,
  ...ANYTHING_TOOLS,
];

export {
  MEMORY_TOOLS,
  SEMANTIC_SEARCH_TOOLS,
  CALENDAR_TOOLS,
  PIPELINE_TOOLS,
  CROSS_CHANNEL_TOOLS,
  SELF_AWARENESS_TOOLS,
  BRIEFING_TOOLS,
  ANYTHING_TOOLS,
};
