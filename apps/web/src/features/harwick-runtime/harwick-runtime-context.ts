import type { AgenticLoopOutcome } from "@realty-ops/integrations";
import { createOpenAIEmbeddingClient } from "@realty-ops/integrations";
import { getServerEnvironment } from "../../lib/server-env";
import { findSimilarTrajectories } from "../../lib/supabase/agent-trajectory-store";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import type { WorkspaceMemoryRepository } from "../../lib/supabase/workspace-memory";
import { buildWorkspaceMemoryRuntimeContext } from "../lead-intake/workspace-memory-runtime-context";

export async function retrieveWorkspaceMemory(params: {
  repository: WorkspaceMemoryRepository;
  workspaceId: string;
  inboundText: string;
  leadDocument: string | null;
}): Promise<string | null> {
  const queryText = params.leadDocument === null
    ? params.inboundText
    : `${params.leadDocument}\n\n---\nNew inbound: ${params.inboundText}`;
  const trimmed = queryText.trim();

  if (trimmed.length > 0) {
    try {
      const environment = getServerEnvironment();
      if (environment.OPENAI_API_KEY !== undefined) {
        const embeddings = createOpenAIEmbeddingClient({ apiKey: environment.OPENAI_API_KEY });
        const queryEmbedding = await embeddings.embed(trimmed.slice(0, 8000));
        const semanticMatches = await params.repository.semanticMemorySearch({
          workspaceId: params.workspaceId,
          embedding: queryEmbedding,
          limit: 5,
          minSimilarity: 0.18,
        });
        if (semanticMatches.length > 0) {
          return buildWorkspaceMemoryRuntimeContext(semanticMatches);
        }
      }
    } catch (error) {
      console.warn("[retrieveWorkspaceMemory] semantic search failed; falling back to recent memories", error);
    }
  }

  try {
    return buildWorkspaceMemoryRuntimeContext(
      await params.repository.listRuntimeMemoryDocuments({
        workspaceId: params.workspaceId,
        limit: 5,
      }),
    );
  } catch (error) {
    console.warn("[retrieveWorkspaceMemory] recent memory lookup failed; continuing without workspace memory", error);
    return null;
  }
}

export async function retrievePositiveExamples(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  inboundText: string;
  leadDocument: string | null;
}): Promise<string | null> {
  try {
    const environment = getServerEnvironment();
    if (environment.OPENAI_API_KEY === undefined) return null;

    const queryText = params.leadDocument === null
      ? params.inboundText
      : `${params.leadDocument}\n\n---\nNew inbound: ${params.inboundText}`;
    const trimmed = queryText.trim();
    if (trimmed.length === 0) return null;

    const embeddings = createOpenAIEmbeddingClient({ apiKey: environment.OPENAI_API_KEY });
    const queryEmbedding = await embeddings.embed(trimmed.slice(0, 8000));

    const matches = await findSimilarTrajectories(params.supabase, {
      workspaceId: params.workspaceId,
      embedding: queryEmbedding,
      limit: 3,
      minSimilarity: 0.3,
      requireOutcome: "positive",
    });

    if (matches.length === 0) return null;

    return matches
      .map((match, index) => {
        const summary = match.summaryText ?? "(no summary)";
        const outcome = match.completionReason ?? match.outcomeLabel ?? "positive outcome";
        const similarity = (match.similarity * 100).toFixed(0);
        return `Example ${index + 1} (similarity ${similarity}%, outcome: ${outcome}):\n${summary}`;
      })
      .join("\n\n");
  } catch (error) {
    console.warn("[retrievePositiveExamples] failed; continuing without examples", error);
    return null;
  }
}

export function buildTrajectorySummary(outcome: AgenticLoopOutcome): string {
  const lines: string[] = [];
  for (const step of outcome.steps) {
    const tools = step.results
      .map((result) => `${result.tool}=${result.status}`)
      .join(", ");
    lines.push(`Step ${step.iteration}: ${step.turn.intent} -> ${step.turn.nextAction} (${tools || "no tools"})`);
  }
  lines.push(`Exit: ${outcome.exitReason} after ${outcome.steps.length} step(s).`);
  return lines.join("\n");
}
