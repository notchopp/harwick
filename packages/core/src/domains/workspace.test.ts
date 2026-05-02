import { describe, expect, it } from "vitest";
import {
  canManageWorkspaceMembers,
  canManageWorkspaceRouting,
  getWorkspaceRoleCapabilities,
  isWorkspaceAdminRole,
  workspaceRoleHasCapability,
  WorkspaceRoleSchema,
} from "./workspace.js";

describe("workspace role capabilities", () => {
  it("accepts paid-launch roles while preserving lead_manager compatibility", () => {
    expect(WorkspaceRoleSchema.options).toEqual([
      "owner",
      "admin",
      "team_lead",
      "lead_manager",
      "operator",
      "agent",
      "viewer",
    ]);
  });

  it("keeps owner/admin as member-management roles", () => {
    expect(canManageWorkspaceMembers("owner")).toBe(true);
    expect(canManageWorkspaceMembers("admin")).toBe(true);
    expect(canManageWorkspaceMembers("team_lead")).toBe(false);
    expect(canManageWorkspaceMembers("operator")).toBe(false);
    expect(canManageWorkspaceMembers("agent")).toBe(false);
  });

  it("allows team leads and legacy lead managers to route without billing or member control", () => {
    expect(canManageWorkspaceRouting("team_lead")).toBe(true);
    expect(canManageWorkspaceRouting("lead_manager")).toBe(true);
    expect(workspaceRoleHasCapability("team_lead", "billing.manage")).toBe(false);
    expect(workspaceRoleHasCapability("lead_manager", "members.manage")).toBe(false);
  });

  it("limits agents to assigned lead and conversation capabilities", () => {
    expect(getWorkspaceRoleCapabilities("agent")).toContain("leads.read_assigned");
    expect(getWorkspaceRoleCapabilities("agent")).toContain("conversations.takeover_assigned");
    expect(workspaceRoleHasCapability("agent", "leads.read_all")).toBe(false);
    expect(isWorkspaceAdminRole("agent")).toBe(false);
  });
});
