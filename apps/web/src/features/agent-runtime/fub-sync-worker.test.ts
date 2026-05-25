import { describe, expect, it, vi } from "vitest";

import { encryptCredential } from "../../lib/credentials";
import { processFubSyncBatch } from "./fub-sync-worker";

const SECRET = "test-credential-secret-32-bytes-please";

type FakeJob = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  attempt_count: number;
  max_attempts: number;
  payload: unknown;
  job_type: string;
  status: string;
  run_after: string;
  created_at: string;
};

function makeJob(overrides: Partial<FakeJob>): FakeJob {
  return {
    id: overrides.id ?? "job-default",
    workspace_id: overrides.workspace_id ?? "workspace-1",
    lead_id: overrides.lead_id ?? null,
    attempt_count: overrides.attempt_count ?? 0,
    max_attempts: overrides.max_attempts ?? 5,
    payload: overrides.payload ?? {},
    job_type: overrides.job_type ?? "fub_sync",
    status: overrides.status ?? "queued",
    run_after: overrides.run_after ?? "2026-01-01T00:00:00.000Z",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
  };
}

type FakeLead = {
  id: string;
  workspace_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  intent: "high" | "medium" | "low" | "spam" | "unknown";
  follow_up_boss_contact_id: string | null;
};

type UpdateCapture = {
  table: string;
  values: Record<string, unknown>;
  matchers: Array<{ column: string; value: unknown }>;
};

type SupabaseState = {
  jobs: FakeJob[];
  leads: FakeLead[];
  leadEvents: Array<{ workspace_id: string; lead_id: string; listing_id: string | null; occurred_at: string }>;
  listings: Array<{
    id: string;
    workspace_id: string;
    address: string;
    price: number | null;
    raw_facts: Record<string, unknown> | null;
  }>;
  integrationAccounts: Array<{
    workspace_id: string;
    encrypted_credential_ref: string | null;
  }>;
  updates: UpdateCapture[];
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

function buildSupabase(state: SupabaseState) {
  function fromWorkflowJobs() {
    return {
      _select: undefined as string | undefined,
      _filters: [] as Array<{ kind: "eq" | "lte"; column: string; value: unknown }>,
      _limit: undefined as number | undefined,
      _order: undefined as { column: string; ascending: boolean } | undefined,
      _pendingValues: undefined as Record<string, unknown> | undefined,
      select(value: string) { this._select = value; return this; },
      eq(column: string, value: unknown) { this._filters.push({ kind: "eq", column, value }); return this; },
      lte(column: string, value: unknown) { this._filters.push({ kind: "lte", column, value }); return this; },
      not() { return this; },
      order(column: string, opts: { ascending: boolean }) { this._order = { column, ascending: opts.ascending }; return this; },
      limit(n: number) { this._limit = n; return this; },
      returns() { return this; },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        const filtered = state.jobs.filter((job) => {
          return this._filters.every((f) => {
            if (f.kind === "eq") return (job as Record<string, unknown>)[f.column] === f.value;
            if (f.kind === "lte") return true; // run_after, just allow
            return true;
          });
        });
        const sliced = this._limit === undefined ? filtered : filtered.slice(0, this._limit);
        return Promise.resolve({ data: sliced, error: null }).then(resolve);
      },
      update(values: Record<string, unknown>) { this._pendingValues = values; return this; },
    };
  }

  function fromIntegrationAccounts() {
    return {
      _filters: [] as Array<{ column: string; value: unknown }>,
      select() { return this; },
      eq(column: string, value: unknown) { this._filters.push({ column, value }); return this; },
      not() { return this; },
      maybeSingle() {
        const match = state.integrationAccounts.find((row) =>
          this._filters.every((f) => (row as Record<string, unknown>)[f.column] === f.value),
        );
        return Promise.resolve({ data: match ?? null, error: null });
      },
    };
  }

  function fromLeads() {
    return {
      _filters: [] as Array<{ column: string; value: unknown }>,
      _pendingValues: undefined as Record<string, unknown> | undefined,
      select() { return this; },
      eq(column: string, value: unknown) {
        this._filters.push({ column, value });
        if (this._pendingValues !== undefined && this._filters.length === 2) {
          state.updates.push({
            table: "leads",
            values: this._pendingValues,
            matchers: [...this._filters],
          });
          this._pendingValues = undefined;
          return Promise.resolve({ error: null });
        }
        return this;
      },
      update(values: Record<string, unknown>) {
        this._pendingValues = values;
        return this;
      },
      maybeSingle() {
        const match = state.leads.find((lead) =>
          this._filters.every((f) => (lead as Record<string, unknown>)[f.column] === f.value),
        );
        return Promise.resolve({ data: match ?? null, error: null });
      },
    };
  }

  function fromLeadEvents() {
    return {
      _filters: [] as Array<{ column: string; value: unknown }>,
      select() { return this; },
      eq(column: string, value: unknown) { this._filters.push({ column, value }); return this; },
      not() { return this; },
      order() { return this; },
      limit() { return this; },
      returns() { return this; },
      then(resolve: (value: { data: unknown; error: unknown }) => unknown) {
        const matched = state.leadEvents
          .filter((event) => this._filters.every((f) => (event as Record<string, unknown>)[f.column] === f.value))
          .filter((event) => event.listing_id !== null)
          .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
          .slice(0, 1);
        return Promise.resolve({ data: matched, error: null }).then(resolve);
      },
    };
  }

  function fromListingFacts() {
    return {
      _filters: [] as Array<{ column: string; value: unknown }>,
      select() { return this; },
      eq(column: string, value: unknown) { this._filters.push({ column, value }); return this; },
      maybeSingle() {
        const match = state.listings.find((listing) =>
          this._filters.every((f) => (listing as Record<string, unknown>)[f.column] === f.value),
        );
        return Promise.resolve({ data: match ?? null, error: null });
      },
    };
  }

  // Mutation-capture for workflow_jobs (job updates).
  const supabase = {
    from(table: string) {
      switch (table) {
        case "workflow_jobs": {
          const builder = fromWorkflowJobs();
          // Wrap update to capture
          const origUpdate = builder.update.bind(builder);
          builder.update = function (values: Record<string, unknown>) {
            const result = origUpdate(values);
            const captured = { values, matchers: [] as Array<{ column: string; value: unknown }> };
            (result as { eq: (column: string, value: unknown) => unknown }).eq = (column: string, value: unknown) => {
              captured.matchers.push({ column, value });
              state.updates.push({ table: "workflow_jobs", values: captured.values, matchers: [...captured.matchers] });
              // Apply mutation to state.jobs
              const target = state.jobs.find((job) => job.id === value && column === "id");
              if (target !== undefined) {
                Object.assign(target, values);
              }
              return Promise.resolve({ error: null });
            };
            return result;
          };
          return builder;
        }
        case "integration_accounts":
          return fromIntegrationAccounts();
        case "leads":
          return fromLeads();
        case "lead_events":
          return fromLeadEvents();
        case "listing_facts":
          return fromListingFacts();
        default:
          throw new Error(`unexpected table ${table}`);
      }
    },
  };
  return supabase as unknown as Parameters<typeof processFubSyncBatch>[0]["supabase"];
}

describe("processFubSyncBatch", () => {
  it("pushes a queued job to FUB and marks it completed", async () => {
    const encryptedRef = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const state: SupabaseState = {
      jobs: [makeJob({
        id: "job-1",
        workspace_id: "workspace-1",
        lead_id: "lead-1",
        payload: { source: "voice" },
      })],
      leads: [{
        id: "lead-1",
        workspace_id: "workspace-1",
        full_name: "Marcus Webb",
        email: "marcus@example.com",
        phone: "8324567890",
        intent: "high",
        follow_up_boss_contact_id: null,
      }],
      leadEvents: [
        { workspace_id: "workspace-1", lead_id: "lead-1", listing_id: "listing-1", occurred_at: "2026-05-23T10:00:00.000Z" },
      ],
      listings: [{
        id: "listing-1",
        workspace_id: "workspace-1",
        address: "7710 Sharondale Dr",
        price: 289000,
        raw_facts: { city: "Houston", state: "TX", postalCode: "77033" },
      }],
      integrationAccounts: [{
        workspace_id: "workspace-1",
        encrypted_credential_ref: encryptedRef,
        provider: "follow_up_boss",
        status: "connected",
      } as never],
      updates: [],
    };

    const requests: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: requestUrl(input), init: init ?? {} });
      return new Response(JSON.stringify({ id: 9999 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const report = await processFubSyncBatch({
      supabase: buildSupabase(state),
      credentialSecret: SECRET,
      fetchImpl,
    });

    expect(report.scanned).toBe(1);
    expect(report.succeeded).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.retried).toBe(0);
    expect(requests).toHaveLength(1);
    const body = parseRequestBody(requests[0]!.init.body);
    expect(body["source"]).toBe("Harwick · Voice");
    expect(body["type"]).toBe("Property Inquiry");
    expect(expectRecord(body["property"])["street"]).toBe("7710 Sharondale Dr");
    // Job should be marked completed
    const completedUpdate = state.updates.find((u) =>
      u.table === "workflow_jobs" && u.values["status"] === "completed",
    );
    expect(completedUpdate).toBeDefined();
  });

  it("skips and completes jobs whose lead already has a FUB contact id", async () => {
    const encryptedRef = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const state: SupabaseState = {
      jobs: [makeJob({
        id: "job-2",
        workspace_id: "workspace-1",
        lead_id: "lead-2",
      })],
      leads: [{
        id: "lead-2",
        workspace_id: "workspace-1",
        full_name: "Already Synced",
        email: "synced@example.com",
        phone: "5550001111",
        intent: "medium",
        follow_up_boss_contact_id: "5000",
      }],
      leadEvents: [],
      listings: [],
      integrationAccounts: [{ workspace_id: "workspace-1", encrypted_credential_ref: encryptedRef, provider: "follow_up_boss", status: "connected" } as never],
      updates: [],
    };

    const fetchImpl = vi.fn(() => new Response("", { status: 200 })) as unknown as typeof fetch;

    const report = await processFubSyncBatch({
      supabase: buildSupabase(state),
      credentialSecret: SECRET,
      fetchImpl,
    });

    expect(report.skipped_already_synced).toBe(1);
    expect(report.succeeded).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("completes a job when the workspace has no FUB credential connected", async () => {
    const state: SupabaseState = {
      jobs: [makeJob({
        id: "job-3",
        workspace_id: "workspace-no-fub",
        lead_id: "lead-3",
      })],
      leads: [{
        id: "lead-3",
        workspace_id: "workspace-no-fub",
        full_name: "No FUB",
        email: "nofub@example.com",
        phone: "5550002222",
        intent: "low",
        follow_up_boss_contact_id: null,
      }],
      leadEvents: [],
      listings: [],
      integrationAccounts: [],
      updates: [],
    };

    const report = await processFubSyncBatch({
      supabase: buildSupabase(state),
      credentialSecret: SECRET,
    });

    expect(report.skipped_no_credential).toBe(1);
    const completed = state.updates.find((u) =>
      u.table === "workflow_jobs" && u.values["status"] === "completed",
    );
    expect(completed).toBeDefined();
  });

  it("retries with exponential backoff when FUB rejects with a 5xx", async () => {
    const encryptedRef = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const state: SupabaseState = {
      jobs: [makeJob({
        id: "job-4",
        workspace_id: "workspace-1",
        lead_id: "lead-4",
        attempt_count: 1,
      })],
      leads: [{
        id: "lead-4",
        workspace_id: "workspace-1",
        full_name: "Try Again",
        email: "try@example.com",
        phone: "5550004444",
        intent: "medium",
        follow_up_boss_contact_id: null,
      }],
      leadEvents: [],
      listings: [],
      integrationAccounts: [{ workspace_id: "workspace-1", encrypted_credential_ref: encryptedRef, provider: "follow_up_boss", status: "connected" } as never],
      updates: [],
    };

    const fetchImpl = vi.fn(() => new Response("server error", { status: 500 })) as unknown as typeof fetch;

    const report = await processFubSyncBatch({
      supabase: buildSupabase(state),
      credentialSecret: SECRET,
      fetchImpl,
    });

    expect(report.retried).toBe(1);
    expect(report.failed).toBe(0);
    const retryUpdate = state.updates.find((u) =>
      u.table === "workflow_jobs" && u.values["status"] === "queued",
    );
    expect(retryUpdate).toBeDefined();
    expect(retryUpdate!.values["attempt_count"]).toBe(2);
  });

  it("marks failed when retries exhausted", async () => {
    const encryptedRef = encryptCredential({ apiKey: "fub_test_key" }, SECRET);
    const state: SupabaseState = {
      jobs: [makeJob({
        id: "job-5",
        workspace_id: "workspace-1",
        lead_id: "lead-5",
        attempt_count: 4,
      })],
      leads: [{
        id: "lead-5",
        workspace_id: "workspace-1",
        full_name: "Final Try",
        email: "final@example.com",
        phone: "5550005555",
        intent: "medium",
        follow_up_boss_contact_id: null,
      }],
      leadEvents: [],
      listings: [],
      integrationAccounts: [{ workspace_id: "workspace-1", encrypted_credential_ref: encryptedRef, provider: "follow_up_boss", status: "connected" } as never],
      updates: [],
    };

    const fetchImpl = vi.fn(() => new Response("server error", { status: 500 })) as unknown as typeof fetch;

    const report = await processFubSyncBatch({
      supabase: buildSupabase(state),
      credentialSecret: SECRET,
      fetchImpl,
    });

    expect(report.failed).toBe(1);
    const failedUpdate = state.updates.find((u) =>
      u.table === "workflow_jobs" && u.values["status"] === "failed",
    );
    expect(failedUpdate).toBeDefined();
  });
});
