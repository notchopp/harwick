import { describe, expect, it } from "vitest";
import {
  mapMembershipRowsToAuthMemberships,
  mapSupabaseUserToAuthenticatedUser,
} from "./auth";

describe("mapSupabaseUserToAuthenticatedUser", () => {
  it("maps Supabase auth users into safe auth summaries", () => {
    expect(mapSupabaseUserToAuthenticatedUser({
      id: "123e4567-e89b-12d3-a456-426614174000",
      email: "Broker@Example.com",
      created_at: "2026-04-24T15:00:00.000Z",
    })).toEqual({
      id: "123e4567-e89b-12d3-a456-426614174000",
      email: "broker@example.com",
      createdAt: "2026-04-24T15:00:00.000Z",
    });
  });
});

describe("mapMembershipRowsToAuthMemberships", () => {
  it("maps active workspace membership rows for UI/session use", () => {
    expect(mapMembershipRowsToAuthMemberships([
      {
        id: "223e4567-e89b-12d3-a456-426614174000",
        workspace_id: "323e4567-e89b-12d3-a456-426614174000",
        role: "owner",
        display_name: "Demo Broker",
        workspaces: {
          name: "Demo Realty",
          slug: "demo-realty",
        },
      },
    ])).toEqual([
      {
        workspaceId: "323e4567-e89b-12d3-a456-426614174000",
        workspaceName: "Demo Realty",
        workspaceSlug: "demo-realty",
        memberId: "223e4567-e89b-12d3-a456-426614174000",
        role: "owner",
        displayName: "Demo Broker",
      },
    ]);
  });
});
