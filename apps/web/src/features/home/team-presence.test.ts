import { describe, expect, it } from "vitest";
import { loadTeamPresence, type TeamPresenceRepository } from "./team-presence";

const workspaceId = "123e4567-e89b-12d3-a456-426614174000";
const ownerId = "123e4567-e89b-12d3-a456-426614174010";
const agentId = "123e4567-e89b-12d3-a456-426614174011";

describe("loadTeamPresence", () => {
  it("maps workspace members into roster-ready presence with avatar support and real counts", async () => {
    const repository: TeamPresenceRepository = {
      listActiveMembers() {
        return Promise.resolve([
          {
            id: ownerId,
            workspace_id: workspaceId,
            role: "owner",
            display_name: "Ademola James",
            avatar_url: "https://cdn.example.com/ademola.jpg",
            role_label: "rainmaker",
            presence_status: "online",
            presence_last_seen_at: "2026-04-30T15:59:30.000Z",
          },
          {
            id: agentId,
            workspace_id: workspaceId,
            role: "agent",
            display_name: "Sarah K",
            avatar_url: null,
            role_label: null,
            presence_status: null,
            presence_last_seen_at: "2026-04-30T15:52:00.000Z",
          },
        ]);
      },
      countActiveLeadsByMember() {
        return Promise.resolve(new Map([
          [ownerId, 9],
          [agentId, 4],
        ]));
      },
      countOpenWorkByMember() {
        return Promise.resolve(new Map([[agentId, 2]]));
      },
    };

    const presence = await loadTeamPresence({
      workspaceId,
      repository,
      now: () => new Date("2026-04-30T16:00:00.000Z"),
    });

    expect(presence.members[0]).toMatchObject({
      id: ownerId,
      avatarUrl: "https://cdn.example.com/ademola.jpg",
      initials: "AJ",
      lastSeen: "active now",
      openWork: 0,
      roleLabel: "rainmaker",
      status: "online",
    });
    expect(presence.members[1]).toMatchObject({
      id: agentId,
      initials: "SK",
      lastSeen: "away 8m",
      openWork: 2,
      roleLabel: "agent",
      status: "away",
    });
  });
});
