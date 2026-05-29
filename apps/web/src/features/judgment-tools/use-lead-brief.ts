"use client";

import { useEffect, useState } from "react";
import type { JudgmentEnvelope, SuggestedAction } from "@realty-ops/core";

/**
 * Client hook — fetches a lead brief for the current operator's role and a
 * given destination. Used by the /leads drawer (and reusable by queue cards,
 * routing rows, owner reads).
 *
 * Stale-while-revalidate semantics: serves whatever the server cache returns
 * immediately. The server-side runner regenerates on state_hash miss in the
 * background and the next access reflects the new brief.
 */

export type LeadBriefDestination =
  | "harwick_drawer"
  | "harwick_queue_card"
  | "harwick_routing_row"
  | "crm_note"
  | "chat_context";

export type LeadBriefRole =
  | "owner"
  | "admin"
  | "team_lead"
  | "lead_manager"
  | "agent"
  | "ops"
  | "viewer";

type LeadBriefResponse = {
  envelope: JudgmentEnvelope;
  cached: boolean;
  model: string;
  generatedAt: string;
};

type LeadBriefState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; envelope: JudgmentEnvelope; cached: boolean; model: string; generatedAt: string }
  | { status: "error"; message: string };

/**
 * Fetch a briefEntity envelope for a lead. Re-runs when leadId / role /
 * destination change. Caller can pass `forceRegen` once to bypass cache
 * (e.g. after a state change the operator triggered manually).
 */
export function useLeadBrief(params: {
  leadId: string | null;
  workspaceId: string;
  role: LeadBriefRole;
  destination?: LeadBriefDestination;
  forceRegen?: boolean;
}): LeadBriefState & { refresh: () => void } {
  const [state, setState] = useState<LeadBriefState>({ status: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const destination = params.destination ?? "harwick_drawer";

  useEffect(() => {
    if (params.leadId === null) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    const url = new URL(`/api/leads/${params.leadId}/brief`, window.location.origin);
    url.searchParams.set("workspaceId", params.workspaceId);
    url.searchParams.set("role", params.role);
    url.searchParams.set("destination", destination);
    if (params.forceRegen === true || refreshKey > 0) {
      url.searchParams.set("forceRegen", "true");
    }

    fetch(url.toString(), { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Brief fetch failed: ${response.status}`);
        }
        const body = await response.json() as LeadBriefResponse;
        if (!cancelled) {
          setState({
            status: "ready",
            envelope: body.envelope,
            cached: body.cached,
            model: body.model,
            generatedAt: body.generatedAt,
          });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [params.leadId, params.workspaceId, params.role, destination, params.forceRegen, refreshKey]);

  return {
    ...state,
    refresh: () => setRefreshKey((k) => k + 1),
  };
}

export type { JudgmentEnvelope, SuggestedAction };
