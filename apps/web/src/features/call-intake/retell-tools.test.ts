import { describe, expect, it, vi } from "vitest";
import type {
  VoiceLeadHandoffInsertRow,
  VoiceLeadHandoffRepository,
} from "../../lib/supabase/voice-handoffs";
import type { EnqueueWorkflowJobInput } from "@realty-ops/core";
import { handleRetellToolCall } from "./retell-tools";
import type { ListingLookupRepository } from "../../lib/supabase/listings";
import type { VerifyListingTaskRepository } from "../tasks/verify-listing-task";

describe("handleRetellToolCall", () => {
  it("returns a safe lead handoff result without claiming CRM sync", async () => {
    const response = await handleRetellToolCall({
      body: {
        name: "create_lead_handoff",
        args: {
          lead_type: "buyer",
          target_area: "Cypress",
          summary: "Caller is preapproved and wants new construction in Cypress.",
        },
      },
    });

    expect(response).toEqual({
      status: 200,
      body: {
        result: "I have enough detail to hand this buyer in Cypress to the team after the call. Keep the caller focused on the next best contact step.",
        handoff_summary: "Caller is preapproved and wants new construction in Cypress.",
      },
    });
  });

  it("persists lead handoff records when workspace context is present", async () => {
    const insertedHandoffs: VoiceLeadHandoffInsertRow[] = [];
    const enqueuedJobs: EnqueueWorkflowJobInput[] = [];
    const repository: VoiceLeadHandoffRepository = {
      findExistingLead: () => Promise.resolve(null),
      findVoiceLeadHandoffByCallId: () => Promise.resolve(null),
      insertLead: (row) => {
        expect(row).toMatchObject({
          workspace_id: "123e4567-e89b-12d3-a456-426614174000",
          source_channel: "call",
          phone: "+17135550123",
          lead_type: "seller",
          intent: "high",
          status: "hot",
          budget_min: 450000,
          budget_max: 575000,
        });
        return Promise.resolve({ id: "223e4567-e89b-12d3-a456-426614174000" });
      },
      updateLead: () => Promise.reject(new Error("update should not be called")),
      insertVoiceLeadHandoff: (row) => {
        insertedHandoffs.push(row);
        return Promise.resolve({ id: "323e4567-e89b-12d3-a456-426614174000" });
      },
    };

    const response = await handleRetellToolCall({
      repository,
      enqueueWorkflowJob: (input) => {
        enqueuedJobs.push(input);
        return Promise.resolve();
      },
      body: {
        name: "create_lead_handoff",
        call_id: "call_123",
        agent_id: "agent_123",
        retell_llm_dynamic_variables: {
          workspace_id: "123e4567-e89b-12d3-a456-426614174000",
          from_number: "(713) 555-0123",
        },
        args: {
          caller_name: "Jordan Lee",
          lead_type: "seller",
          target_area: "Houston",
          budget: "$450k-$575k",
          urgency: "hot",
          summary: "Caller wants a listing consultation this week.",
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      lead_id: "223e4567-e89b-12d3-a456-426614174000",
      handoff_id: "323e4567-e89b-12d3-a456-426614174000",
      handoff_summary: "Caller wants a listing consultation this week.",
    });
    expect(insertedHandoffs).toHaveLength(1);
    expect(enqueuedJobs).toEqual([
      expect.objectContaining({
        workspaceId: "123e4567-e89b-12d3-a456-426614174000",
        leadId: "223e4567-e89b-12d3-a456-426614174000",
        jobType: "lead_qualification",
        payload: expect.objectContaining({
          jobType: "lead_qualification",
          reason: "manual_review",
        }) as Record<string, string>,
      }),
    ]);
    expect(insertedHandoffs[0]).toMatchObject({
      call_id: "call_123",
      retell_agent_id: "agent_123",
      phone: "+17135550123",
      caller_name: "Jordan Lee",
      status: "captured",
    });
  });

  it("returns verified listing facts when listing lookup data is available", async () => {
    const recentVerifiedAt = new Date().toISOString();
    const listingRepository: ListingLookupRepository = {
      lookupListing: () => Promise.resolve({
        id: "listing-row-1",
        workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        source: "repliers",
        external_listing_id: "listing-1",
        mls_number: "HAR-12345",
        address: "123 Main St, Houston, TX 77001",
        status: "Active",
        price: 525000,
        beds: 4,
        baths: 3.5,
        has_pool: true,
        raw_facts: {},
        verification_status: "verified",
        verified_by_member_id: null,
        verified_at: recentVerifiedAt,
        needs_recheck_at: null,
        created_at: recentVerifiedAt,
        updated_at: recentVerifiedAt,
      }),
    };
    const response = await handleRetellToolCall({
      listingRepository,
      body: {
        name: "lookup_listing",
        retell_llm_dynamic_variables: {
          workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        },
        args: {
          query: "123 Main St",
          question: "Does it have a pool?",
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toContain("123 Main St, Houston, TX 77001 is Active.");
    expect(response.body.result).toContain("Pool: yes.");
    expect(response.body.result).toContain(`Verified at ${recentVerifiedAt}.`);
  });

  it("treats manual listing facts as workspace truth without creating verify tasks", async () => {
    const listingRepository: ListingLookupRepository = {
      lookupListing: () => Promise.resolve({
        id: "listing-row-1",
        workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        source: "manual",
        external_listing_id: null,
        mls_number: null,
        address: "1208 Buyer Blueprint Ln, Houston, TX 77001",
        status: "Available",
        price: 339990,
        beds: 5,
        baths: 3,
        has_pool: false,
        raw_facts: {
          notes: "4.99% interest rate and closing cost assistance.",
          incentives: ["4.99% interest rate", "closing cost assistance"],
        },
        verification_status: "verified",
        verified_by_member_id: null,
        verified_at: "2026-04-20T12:00:00.000Z",
        needs_recheck_at: null,
        created_at: "2026-04-20T12:00:00.000Z",
        updated_at: "2026-04-20T12:00:00.000Z",
      }),
    };
    const insertVerifyListingTask = vi.fn<VerifyListingTaskRepository["insertVerifyListingTask"]>();
    const verifyListingTaskRepository: VerifyListingTaskRepository = {
      findLead: vi.fn(),
      findOpenVerifyListingTask: vi.fn(),
      insertVerifyListingTask,
      updateVerifyListingTask: vi.fn(),
    };

    const response = await handleRetellToolCall({
      listingRepository,
      verifyListingTaskRepository,
      body: {
        name: "lookup_listing",
        retell_llm_dynamic_variables: {
          workspace_id: "123e4567-e89b-12d3-a456-426614174000",
          lead_id: "223e4567-e89b-12d3-a456-426614174000",
        },
        args: {
          query: "1208 Buyer Blueprint Ln",
          question: "What incentives does it have?",
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toContain("1208 Buyer Blueprint Ln, Houston, TX 77001 is Available.");
    expect(response.body.result).toContain("Notes: 4.99% interest rate and closing cost assistance.");
    expect(response.body.result).toContain("Incentives: 4.99% interest rate, closing cost assistance.");
    expect(insertVerifyListingTask).not.toHaveBeenCalled();
  });

  it("keeps the caller on a safe verification path when listing details cannot be verified", async () => {
    const insertVerifyListingTask = vi.fn<VerifyListingTaskRepository["insertVerifyListingTask"]>().mockResolvedValue(undefined);
    const updateVerifyListingTask = vi.fn<VerifyListingTaskRepository["updateVerifyListingTask"]>().mockResolvedValue(undefined);
    const verifyListingTaskRepository: VerifyListingTaskRepository = {
      findLead: vi.fn<VerifyListingTaskRepository["findLead"]>().mockResolvedValue({
        assignedMemberId: "123e4567-e89b-12d3-a456-426614174010",
      }),
      findOpenVerifyListingTask: vi.fn<VerifyListingTaskRepository["findOpenVerifyListingTask"]>().mockResolvedValue(null),
      insertVerifyListingTask,
      updateVerifyListingTask,
    };
    const response = await handleRetellToolCall({
      verifyListingTaskRepository,
      body: {
        name: "lookup_listing",
        retell_llm_dynamic_variables: {
          workspace_id: "123e4567-e89b-12d3-a456-426614174000",
          lead_id: "223e4567-e89b-12d3-a456-426614174000",
        },
        args: {
          query: "123 Main St",
          question: "Does it have a pool?",
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toContain("I could not verify current listing details");
    expect(response.body.result).toContain("Do not guess status, pool, price, or availability.");
    expect(insertVerifyListingTask).toHaveBeenCalledTimes(1);
    expect(updateVerifyListingTask).not.toHaveBeenCalled();
  });

  it("creates a verify task when listing facts are stale for a known lead", async () => {
    const listingRepository: ListingLookupRepository = {
      lookupListing: () => Promise.resolve({
        id: "listing-row-1",
        workspace_id: "123e4567-e89b-12d3-a456-426614174000",
        source: "repliers",
        external_listing_id: "listing-1",
        mls_number: "HAR-12345",
        address: "123 Main St, Houston, TX 77001",
        status: "Active",
        price: 525000,
        beds: 4,
        baths: 3.5,
        has_pool: true,
        raw_facts: {},
        verification_status: "verified",
        verified_by_member_id: null,
        verified_at: "2026-04-28T22:00:00.000Z",
        needs_recheck_at: null,
        created_at: "2026-04-28T22:00:00.000Z",
        updated_at: "2026-04-28T22:00:00.000Z",
      }),
    };
    const insertVerifyListingTask = vi.fn<VerifyListingTaskRepository["insertVerifyListingTask"]>().mockResolvedValue(undefined);
    const verifyListingTaskRepository: VerifyListingTaskRepository = {
      findLead: vi.fn<VerifyListingTaskRepository["findLead"]>().mockResolvedValue({
        assignedMemberId: null,
      }),
      findOpenVerifyListingTask: vi.fn<VerifyListingTaskRepository["findOpenVerifyListingTask"]>().mockResolvedValue(null),
      insertVerifyListingTask,
      updateVerifyListingTask: vi.fn<VerifyListingTaskRepository["updateVerifyListingTask"]>().mockResolvedValue(undefined),
    };

    const response = await handleRetellToolCall({
      listingRepository,
      verifyListingTaskRepository,
      body: {
        name: "lookup_listing",
        retell_llm_dynamic_variables: {
          workspace_id: "123e4567-e89b-12d3-a456-426614174000",
          lead_id: "223e4567-e89b-12d3-a456-426614174000",
        },
        args: {
          query: "123 Main St",
          question: "Is it still available?",
        },
      },
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toContain("Last verified at 2026-04-28T22:00:00.000Z.");
    expect(response.body.result).toContain("team should verify current details");
    expect(insertVerifyListingTask).toHaveBeenCalledTimes(1);
  });

  it("returns Retell transfer fields when a handoff number is configured", async () => {
    const response = await handleRetellToolCall({
      body: {
        name: "transfer_call",
        args: {
          transfer_to: "team lead",
          reason: "Caller requested a human.",
          summary: "Caller wants to tour this weekend.",
        },
        retell_llm_dynamic_variables: {
          transfer_number: "+17135550100",
        },
      },
    });

    expect(response).toEqual({
      status: 200,
      body: {
        result: "I am transferring you now so the team can help directly.",
        transfer_number: "+17135550100",
        transfer_target: "team lead",
        handoff_summary: "Caller wants to tour this weekend.",
      },
    });
  });
});
