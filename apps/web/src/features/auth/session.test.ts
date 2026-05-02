import { describe, expect, it } from "vitest";
import type { AuthSessionSummary } from "@realty-ops/core";
import { selectWorkspaceMembership } from "./session";

const session: AuthSessionSummary = {
  user: {
    id: "123e4567-e89b-12d3-a456-426614174000",
    email: "owner@example.com",
    createdAt: "2026-05-01T12:00:00.000Z",
  },
  memberships: [
    {
      workspaceId: "223e4567-e89b-12d3-a456-426614174000",
      workspaceName: "First Workspace",
      workspaceSlug: "first-workspace",
      memberId: "323e4567-e89b-12d3-a456-426614174000",
      role: "owner",
      displayName: "Owner",
    },
    {
      workspaceId: "223e4567-e89b-12d3-a456-426614174001",
      workspaceName: "Second Workspace",
      workspaceSlug: "second-workspace",
      memberId: "323e4567-e89b-12d3-a456-426614174001",
      role: "agent",
      displayName: "Agent",
    },
  ],
};

describe("selectWorkspaceMembership", () => {
  it("prefers an explicit workspace id", () => {
    expect(selectWorkspaceMembership({
      session,
      workspaceId: "223e4567-e89b-12d3-a456-426614174001",
      selectedWorkspaceId: "223e4567-e89b-12d3-a456-426614174000",
    })?.workspaceName).toBe("Second Workspace");
  });

  it("can resolve by public workspace slug", () => {
    expect(selectWorkspaceMembership({
      session,
      workspaceSlug: "second-workspace",
    })?.workspaceName).toBe("Second Workspace");
  });

  it("uses the selected workspace cookie before falling back to the first membership", () => {
    expect(selectWorkspaceMembership({
      session,
      selectedWorkspaceId: "223e4567-e89b-12d3-a456-426614174001",
    })?.workspaceName).toBe("Second Workspace");
  });

  it("falls back to the first membership when no selector matches", () => {
    expect(selectWorkspaceMembership({
      session,
      workspaceSlug: "missing",
    })?.workspaceName).toBe("First Workspace");
  });
});
