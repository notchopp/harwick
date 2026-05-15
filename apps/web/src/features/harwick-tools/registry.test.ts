import type { WorkspaceRole } from "@realty-ops/core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildHarwickToolsForScope, type HarwickToolDefinition, type HarwickToolDeps } from "./registry";

function makeFakeDeps(role: WorkspaceRole): HarwickToolDeps {
  return {
    supabase: {} as never,
    workspaceId: "00000000-0000-0000-0000-000000000001",
    workspaceName: "Test",
    operatorMemberId: "00000000-0000-0000-0000-000000000002",
    operatorName: "Test Operator",
    operatorRole: role,
  };
}

const noScopeMatch: HarwickToolDefinition = {
  name: "ghost_tool",
  description: "Tool tagged only for lead_conversation; should not appear in operator_chat scope.",
  scopes: ["lead_conversation"],
  approval: "auto_safe",
  inputSchema: z.object({}),
  execute() { return { ran: true }; },
};

const ungatedTool: HarwickToolDefinition = {
  name: "open_tool",
  description: "Available to anyone in operator_chat scope.",
  scopes: ["operator_chat"],
  approval: "auto_safe",
  inputSchema: z.object({}),
  execute() { return { ran: true }; },
};

const ownerOnlyTool: HarwickToolDefinition = {
  name: "owner_only_tool",
  description: "Requires routing.manage — agents cannot invoke.",
  scopes: ["operator_chat"],
  requiresCapability: "routing.manage",
  approval: "auto_safe",
  inputSchema: z.object({}),
  execute() { return { ran: true }; },
};

const channelOnlyTool: HarwickToolDefinition = {
  name: "channel_tool",
  description: "Only in channel_mention scope.",
  scopes: ["channel_mention"],
  approval: "auto_safe",
  inputSchema: z.object({}),
  execute() { return { ran: true }; },
};

describe("buildHarwickToolsForScope", () => {
  it("filters tools by scope membership", () => {
    const tools = buildHarwickToolsForScope({
      registry: [noScopeMatch, ungatedTool],
      scope: "operator_chat",
      deps: makeFakeDeps("owner"),
    });
    expect(Object.keys(tools)).toEqual(["open_tool"]);
  });

  it("filters tools by role capability", () => {
    const ownerTools = buildHarwickToolsForScope({
      registry: [ownerOnlyTool, ungatedTool],
      scope: "operator_chat",
      deps: makeFakeDeps("owner"),
    });
    expect(Object.keys(ownerTools).sort()).toEqual(["open_tool", "owner_only_tool"]);

    const agentTools = buildHarwickToolsForScope({
      registry: [ownerOnlyTool, ungatedTool],
      scope: "operator_chat",
      deps: makeFakeDeps("agent"),
    });
    expect(Object.keys(agentTools)).toEqual(["open_tool"]);
  });

  it("returns disjoint sets per scope", () => {
    const operatorTools = buildHarwickToolsForScope({
      registry: [ungatedTool, channelOnlyTool],
      scope: "operator_chat",
      deps: makeFakeDeps("owner"),
    });
    const channelTools = buildHarwickToolsForScope({
      registry: [ungatedTool, channelOnlyTool],
      scope: "channel_mention",
      deps: makeFakeDeps("owner"),
    });
    expect(Object.keys(operatorTools)).toEqual(["open_tool"]);
    expect(Object.keys(channelTools)).toEqual(["channel_tool"]);
  });

  it("omits provider-managed web_search when openai is absent", () => {
    const tools = buildHarwickToolsForScope({
      registry: [],
      scope: "operator_chat",
      deps: makeFakeDeps("owner"),
    });
    expect(tools["web_search"]).toBeUndefined();
  });
});
