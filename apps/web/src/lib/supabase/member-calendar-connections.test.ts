import { describe, expect, it, vi } from "vitest";
import { createSupabaseMemberCalendarConnectionRepository } from "./member-calendar-connections";
import type { WorkspaceMemberCalendarConnectionRow } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

function createSupabaseRow(row: WorkspaceMemberCalendarConnectionRow | null) {
  const maybeSingle = vi.fn(() => ({ data: row, error: null }));
  const limit = vi.fn(() => ({ maybeSingle }));
  const order = vi.fn(() => ({ limit }));
  const updateEq = vi.fn(() => Promise.resolve({ error: null }));
  const eq = vi.fn(() => ({ eq, order }));
  const update = vi.fn(() => ({ eq: updateEq }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, update }));
  return {
    client: { from } as unknown as RealtyOpsSupabaseClient,
    from,
    select,
    update,
    eq,
    updateEq,
    order,
    limit,
    maybeSingle,
  };
}

describe("createSupabaseMemberCalendarConnectionRepository", () => {
  it("finds the active Google calendar connection for a member", async () => {
    const supabase = createSupabaseRow({
      id: "123e4567-e89b-12d3-a456-426614174001",
      workspace_id: "123e4567-e89b-12d3-a456-426614174000",
      member_id: "123e4567-e89b-12d3-a456-426614174002",
      provider: "google",
      provider_account_email: "agent@example.com",
      calendar_id: "primary",
      status: "connected",
      showing_mode: "request_approve",
      timezone: "America/New_York",
      encrypted_credential_ref: "enc:v1:calendar",
      last_synced_at: null,
      created_at: "2026-05-06T00:00:00.000Z",
      updated_at: "2026-05-06T00:00:00.000Z",
    });
    const repo = createSupabaseMemberCalendarConnectionRepository(supabase.client);

    await expect(repo.findActiveConnection({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      memberId: "123e4567-e89b-12d3-a456-426614174002",
    })).resolves.toEqual({
      id: "123e4567-e89b-12d3-a456-426614174001",
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      memberId: "123e4567-e89b-12d3-a456-426614174002",
      provider: "google",
      providerAccountEmail: "agent@example.com",
      calendarId: "primary",
      status: "connected",
      showingMode: "request_approve",
      timezone: "America/New_York",
      encryptedCredentialRef: "enc:v1:calendar",
      lastSyncedAt: null,
      createdAt: "2026-05-06T00:00:00.000Z",
      updatedAt: "2026-05-06T00:00:00.000Z",
    });

    expect(supabase.from).toHaveBeenCalledWith("workspace_member_calendar_connections");
    expect(supabase.eq).toHaveBeenCalledWith("workspace_id", "123e4567-e89b-12d3-a456-426614174000");
    expect(supabase.eq).toHaveBeenCalledWith("member_id", "123e4567-e89b-12d3-a456-426614174002");
    expect(supabase.eq).toHaveBeenCalledWith("provider", "google");
    expect(supabase.eq).toHaveBeenCalledWith("status", "connected");
  });

  it("returns null when no active connection exists", async () => {
    const supabase = createSupabaseRow(null);
    const repo = createSupabaseMemberCalendarConnectionRepository(supabase.client);

    await expect(repo.findActiveConnection({
      workspaceId: "123e4567-e89b-12d3-a456-426614174000",
      memberId: "123e4567-e89b-12d3-a456-426614174002",
    })).resolves.toBeNull();
  });

  it("updates encrypted credential material after a token refresh", async () => {
    const supabase = createSupabaseRow(null);
    const repo = createSupabaseMemberCalendarConnectionRepository(supabase.client);

    await repo.updateEncryptedCredential({
      connectionId: "123e4567-e89b-12d3-a456-426614174001",
      encryptedCredentialRef: "enc:v1:refreshed",
      syncedAt: "2026-05-06T02:00:00.000Z",
    });

    expect(supabase.from).toHaveBeenCalledWith("workspace_member_calendar_connections");
    expect(supabase.update).toHaveBeenCalledWith({
      encrypted_credential_ref: "enc:v1:refreshed",
      status: "connected",
      last_synced_at: "2026-05-06T02:00:00.000Z",
      updated_at: "2026-05-06T02:00:00.000Z",
    });
    expect(supabase.updateEq).toHaveBeenCalledWith("id", "123e4567-e89b-12d3-a456-426614174001");
  });
});
