"use client";

import {
  HarwickAssistantResponseSchema,
  type HarwickAssistantResponse,
} from "@realty-ops/core";
import { useCallback, useRef, useState } from "react";

export type AssistantTurn = {
  id: string;
  question: string;
  answer: string;
  isStreaming: boolean;
  reasoning: string | null;
  reasoningSteps?: HarwickAssistantResponse["reasoningSteps"];
  scope?: string | null;
  toolCalls: HarwickAssistantResponse["toolCalls"];
  responseCards: HarwickAssistantResponse["responseCards"];
  artifact: HarwickAssistantResponse["artifact"] | undefined;
  createdAt: string;
};

type StreamEvent =
  | {
      type: "response-metadata";
      data: {
        reasoningSteps: Array<{ detail: string; label: string }>;
        scope: string;
        toolCalls: HarwickAssistantResponse["toolCalls"];
        responseCards: HarwickAssistantResponse["responseCards"];
      };
    }
  | { type: "answer-chunk"; data: string }
  | { type: "artifact-start"; data: NonNullable<HarwickAssistantResponse["artifact"]> }
  | { type: "artifact-chunk"; data: string }
  | { type: "follow-up-question"; data: HarwickAssistantResponse["followUpQuestion"] }
  | { type: "done"; data: null };

function isStreamEvent(value: unknown): value is StreamEvent {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record["type"] === "string";
}

export type UseHarwickAssistantOptions = {
  workspaceId: string | null;
  setTurns: (updater: (turns: AssistantTurn[]) => AssistantTurn[]) => void;
};

export function useHarwickAssistant({ workspaceId, setTurns }: UseHarwickAssistantOptions) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const update = useCallback((id: string, updater: (turn: AssistantTurn) => AssistantTurn) => {
    setTurns((current) => current.map((turn) => (turn.id === id ? updater(turn) : turn)));
  }, [setTurns]);

  const send = useCallback(async (message: string, options?: { memberMentions?: string[]; threadId?: string }) => {
    const trimmed = message.trim();
    if (workspaceId === null || trimmed.length === 0 || busy) return;

    seq.current += 1;
    const turnId = `t-${Date.now()}-${seq.current}`;
    const initial: AssistantTurn = {
      id: turnId,
      question: trimmed,
      answer: "",
      isStreaming: true,
      reasoning: null,
      reasoningSteps: [],
      scope: null,
      toolCalls: [],
      responseCards: [],
      artifact: undefined,
      createdAt: new Date().toISOString(),
    };

    setTurns((current) => [...current, initial]);
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/harwick-assistant`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "text/event-stream" },
        body: JSON.stringify({
          message: trimmed,
          stream: true,
          mentions: (options?.memberMentions ?? []).map((id) => ({ id, type: "person", label: id })),
          activeLeadId: null,
          ...(options?.threadId === undefined ? {} : { threadId: options.threadId }),
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text.length > 0 ? text : "Harwick could not respond.");
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.includes("text/event-stream")) {
        const payload: unknown = await response.json();
        const parsed = HarwickAssistantResponseSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("Harwick returned an invalid response.");
        }
        update(turnId, (turn) => ({
          ...turn,
          answer: parsed.data.answer,
          reasoning: parsed.data.reasoningSteps[0]?.label ?? null,
          reasoningSteps: parsed.data.reasoningSteps,
          scope: parsed.data.scope,
          toolCalls: parsed.data.toolCalls,
          responseCards: parsed.data.responseCards,
          artifact: parsed.data.artifact,
          isStreaming: false,
        }));
        return;
      }

      const reader = response.body?.getReader();
      if (reader === undefined) throw new Error("Missing stream body.");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLine = frame.split("\n").find((line) => line.startsWith("data: "));
          if (dataLine === undefined) continue;
          const payload = JSON.parse(dataLine.slice(6)) as unknown;
          if (!isStreamEvent(payload)) continue;

          if (payload.type === "response-metadata") {
            update(turnId, (turn) => ({
              ...turn,
              reasoning: payload.data.reasoningSteps[0]?.label ?? null,
              reasoningSteps: payload.data.reasoningSteps,
              scope: payload.data.scope,
              toolCalls: payload.data.toolCalls,
              responseCards: payload.data.responseCards,
            }));
            continue;
          }
          if (payload.type === "answer-chunk") {
            update(turnId, (turn) => ({
              ...turn,
              // Word-level chunks include their own trailing whitespace, so
              // concatenate directly (no inserted space).
              answer: `${turn.answer}${payload.data}`,
            }));
            continue;
          }
          if (payload.type === "artifact-start") {
            update(turnId, (turn) => ({ ...turn, artifact: { ...payload.data, body: "" } }));
            continue;
          }
          if (payload.type === "artifact-chunk") {
            update(turnId, (turn) => (
              turn.artifact === undefined
                ? turn
                : { ...turn, artifact: { ...turn.artifact, body: `${turn.artifact.body}${payload.data}` } }
            ));
            continue;
          }
          if (payload.type === "done") {
            update(turnId, (turn) => ({ ...turn, isStreaming: false }));
          }
        }
      }
    } catch (caught) {
      const message_ = caught instanceof Error ? caught.message : "Harwick failed to respond.";
      setError(message_);
      update(turnId, (turn) => ({ ...turn, isStreaming: false, answer: turn.answer.length === 0 ? message_ : turn.answer }));
    } finally {
      setBusy(false);
    }
  }, [busy, setTurns, update, workspaceId]);

  return { busy, error, send, clearError: () => setError(null) };
}
