import { describe, expect, it, vi } from "vitest";

import { encryptCredential } from "../../lib/credentials";
import { pushLeadToFollowUpBoss } from "./follow-up-boss-push";

const SECRET = "test-credential-secret-32-bytes-please";

type SupabaseUpdate = {
  table: string;
  values: Record<string, unknown>;
  filters: Array<{ column: string; value: unknown }>;
};

function parseRequestBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (typeof body !== "string") {
    throw new Error("expected JSON string request body");
  }
  const parsed: unknown = JSON.parse(body);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("expected JSON object request body");
  }
  return parsed as Record<string, unknown>;
}

function expectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected object value");
  }
  return value as Record<string, unknown>;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function buildSupabaseMock(params: {
  encryptedCredentialRef: string | null;
  recordedUpdates: SupabaseUpdate[];
}) {
  const supabase = {
    from(table: string) {
      if (table === "integration_accounts") {
        return {
          select() { return this; },
          eq() { return this; },
          not() { return this; },
          maybeSingle() {
            return Promise.resolve({
              data: params.encryptedCredentialRef === null
                ? null
                : { encrypted_credential_ref: params.encryptedCredentialRef },
              error: null,
            });
          },
        };
      }
      if (table === "leads") {
        const filters: Array<{ column: string; value: unknown }> = [];
        let pendingValues: Record<string, unknown> = {};
        return {
          update(values: Record<string, unknown>) {
            pendingValues = values;
            return this;
          },
          eq(column: string, value: unknown) {
            filters.push({ column, value });
            if (filters.length === 2) {
              params.recordedUpdates.push({
                table,
                values: pendingValues,
                filters: [...filters],
              });
              return Promise.resolve({ error: null });
            }
            return this;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return supabase as unknown as Parameters<typeof pushLeadToFollowUpBoss>[0]["supabase"];
}

describe("pushLeadToFollowUpBoss", () => {
  it("returns no_credential when workspace has no connected FUB integration", async () => {
    const recordedUpdates: SupabaseUpdate[] = [];
    const result = await pushLeadToFollowUpBoss({
      supabase: buildSupabaseMock({ encryptedCredentialRef: null, recordedUpdates }),
      credentialSecret: SECRET,
      workspaceId: "workspace-1",
      leadId: "lead-1",
      lead: {
        fullName: "Marcus Webb",
        email: "marcus@example.com",
        phone: "8324567890",
        intent: "question",
        message: null,
      },
      listing: null,
      source: "listings_site",
    });

    expect(result).toEqual({ pushed: false, reason: "no_credential" });
    expect(recordedUpdates).toHaveLength(0);
  });

  it("posts a Property Inquiry event with listing context and persists FUB person id", async () => {
    const encrypted = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const recordedRequests: Array<{ url: string; init: RequestInit }> = [];
    const recordedUpdates: SupabaseUpdate[] = [];

    const result = await pushLeadToFollowUpBoss({
      supabase: buildSupabaseMock({ encryptedCredentialRef: encrypted, recordedUpdates }),
      credentialSecret: SECRET,
      workspaceId: "workspace-1",
      leadId: "lead-1",
      lead: {
        fullName: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+18324567890",
        intent: "showing",
        message: "i'd love to see this saturday",
      },
      listing: {
        address: "7710 Sharondale Dr",
        city: "Houston",
        state: "TX",
        postalCode: "77033",
        price: 289000,
      },
      source: "listings_site",
      fetchImpl: vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        recordedRequests.push({ url: requestUrl(input), init: init ?? {} });
        return new Response(JSON.stringify({ id: 4242 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });

    expect(result).toEqual({ pushed: true, fubPersonId: "4242" });
    expect(recordedRequests).toHaveLength(1);
    const sent = recordedRequests[0]!;
    expect(sent.url).toContain("/v1/events");
    const body = parseRequestBody(sent.init.body);
    expect(body["source"]).toBe("Harwick · Listings Site");
    expect(body["system"]).toBe("Harwick");
    expect(body["type"]).toBe("Property Inquiry");
    expect(body["message"]).toBe("i'd love to see this saturday");
    expect(expectRecord(body["person"])).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      emails: [{ value: "ada@example.com" }],
      phones: [{ value: "+18324567890" }],
    });
    expect(body["property"]).toEqual({
      street: "7710 Sharondale Dr",
      city: "Houston",
      state: "TX",
      code: "77033",
      price: 289000,
    });
    expect(recordedUpdates).toHaveLength(1);
    expect(recordedUpdates[0]!.values).toEqual({ follow_up_boss_contact_id: "4242" });
  });

  it("falls back to General Inquiry when no listing context is provided", async () => {
    const encrypted = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const recordedRequests: Array<{ url: string; init: RequestInit }> = [];
    const recordedUpdates: SupabaseUpdate[] = [];

    await pushLeadToFollowUpBoss({
      supabase: buildSupabaseMock({ encryptedCredentialRef: encrypted, recordedUpdates }),
      credentialSecret: SECRET,
      workspaceId: "workspace-1",
      leadId: "lead-1",
      lead: {
        fullName: "Cher",
        email: "cher@example.com",
        phone: "5551234567",
        intent: "general",
        message: null,
      },
      listing: null,
      source: "public_chat",
      fetchImpl: vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        recordedRequests.push({ url: requestUrl(input), init: init ?? {} });
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch,
    });

    const body = parseRequestBody(recordedRequests[0]?.init.body);
    expect(body["type"]).toBe("General Inquiry");
    expect(body["source"]).toBe("Harwick · Public Chat");
    expect(body["property"]).toBeUndefined();
    const person = expectRecord(body["person"]);
    expect(person["firstName"]).toBe("Cher");
    expect(person["lastName"]).toBeUndefined();
  });

  it("returns request_failed without throwing when FUB rejects the request", async () => {
    const encrypted = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const recordedUpdates: SupabaseUpdate[] = [];

    const result = await pushLeadToFollowUpBoss({
      supabase: buildSupabaseMock({ encryptedCredentialRef: encrypted, recordedUpdates }),
      credentialSecret: SECRET,
      workspaceId: "workspace-1",
      leadId: "lead-1",
      lead: {
        fullName: "Marcus",
        email: "marcus@example.com",
        phone: "5550000000",
        intent: "question",
        message: null,
      },
      listing: null,
      source: "listings_site",
      fetchImpl: vi.fn(() => new Response("rate limited", { status: 429 })) as unknown as typeof fetch,
    });

    expect(result.pushed).toBe(false);
    if (result.pushed) return;
    expect(result.reason).toBe("request_failed");
    expect(recordedUpdates).toHaveLength(0);
  });

  it("returns decrypt_failed when the stored credential payload is malformed", async () => {
    const recordedUpdates: SupabaseUpdate[] = [];

    const result = await pushLeadToFollowUpBoss({
      supabase: buildSupabaseMock({
        encryptedCredentialRef: "not-a-valid-encrypted-payload",
        recordedUpdates,
      }),
      credentialSecret: SECRET,
      workspaceId: "workspace-1",
      leadId: "lead-1",
      lead: {
        fullName: "Marcus",
        email: "marcus@example.com",
        phone: "5550000000",
        intent: "question",
        message: null,
      },
      listing: null,
      source: "listings_site",
    });

    expect(result.pushed).toBe(false);
    if (result.pushed) return;
    expect(result.reason).toBe("decrypt_failed");
  });
});
