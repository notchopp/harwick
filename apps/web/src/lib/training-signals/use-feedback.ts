"use client";

import { useCallback, useState } from "react";

export type FeedbackTag = "positive" | "negative" | "note";

/**
 * Two attribution shapes:
 *  - `step` — the surface IS an AI step (trajectoryId + stepId). Uses the
 *    canonical /agent-trajectories/{tid}/steps/{sid}/tag endpoint, which writes
 *    a real agent_outcomes row attributed to the (state, action) pair. This is
 *    the highest-quality training signal.
 *  - `surface` — the surface lacks step attribution (routing decisions, proactive
 *    cards, synthesis fields). Uses /surface-feedback, which records to audit_logs
 *    with action="training.surface_feedback".
 */
export type FeedbackTarget =
  | {
      kind: "step";
      workspaceId: string;
      trajectoryId: string;
      stepId: string;
    }
  | {
      kind: "surface";
      workspaceId: string;
      surface:
        | "routing_decision"
        | "proactive_card"
        | "workspace_memory"
        | "synthesis_field"
        | "voice_handoff"
        | "harwick_work_item"
        | "lead"
        | "conversation";
      resourceId: string;
      context?: Record<string, unknown>;
    };

export type FeedbackState = {
  current: FeedbackTag | null;
  busy: boolean;
  error: string | null;
  send: (tag: FeedbackTag, note?: string) => Promise<void>;
};

export function useFeedback(target: FeedbackTarget): FeedbackState {
  const [current, setCurrent] = useState<FeedbackTag | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(async (tag: FeedbackTag, note?: string) => {
    setBusy(true);
    setError(null);
    setCurrent(tag);

    try {
      const url = target.kind === "step"
        ? `/api/workspaces/${target.workspaceId}/agent-trajectories/${target.trajectoryId}/steps/${target.stepId}/tag`
        : `/api/workspaces/${target.workspaceId}/surface-feedback`;
      const body = target.kind === "step"
        ? { tag, note: note ?? undefined }
        : {
            surface: target.surface,
            resourceId: target.resourceId,
            tag,
            note: note ?? undefined,
            context: target.context ?? {},
          };

      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text.length > 0 ? text : `Feedback failed (${response.status})`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Feedback failed.");
      setCurrent(null);
    } finally {
      setBusy(false);
    }
  }, [target]);

  return { current, busy, error, send };
}
