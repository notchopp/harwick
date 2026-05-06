import { describe, expect, it, vi } from "vitest";
import {
  handlePublicListingInquiry,
  PublicListingInquiryError,
  type PublicListingInquiryRepository,
} from "./public-listing-inquiry";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const leadId = "00000000-0000-0000-0000-000000000002";
const listingId = "00000000-0000-0000-0000-000000000003";
const agentId = "00000000-0000-0000-0000-000000000004";

function createRepository(overrides: Partial<PublicListingInquiryRepository> = {}) {
  const mocks = {
    findWorkspaceBySlug: vi.fn<PublicListingInquiryRepository["findWorkspaceBySlug"]>(() =>
      Promise.resolve({ id: workspaceId })),
    findListing: vi.fn<PublicListingInquiryRepository["findListing"]>(() =>
      Promise.resolve({
        id: listingId,
        address: "123 Main St",
        workspaceId,
      })),
    findExistingLead: vi.fn<PublicListingInquiryRepository["findExistingLead"]>(() => Promise.resolve(null)),
    updateLead: vi.fn<PublicListingInquiryRepository["updateLead"]>(() => Promise.resolve()),
    insertLead: vi.fn<PublicListingInquiryRepository["insertLead"]>(() =>
      Promise.resolve({
        id: leadId,
        assignedAgentId: agentId,
      })),
    insertLeadEvent: vi.fn<PublicListingInquiryRepository["insertLeadEvent"]>(() => Promise.resolve()),
    insertShowingTask: vi.fn<PublicListingInquiryRepository["insertShowingTask"]>(() =>
      Promise.resolve("00000000-0000-0000-0000-000000000005")),
    insertOpenHouseRegistrationTask: vi.fn<PublicListingInquiryRepository["insertOpenHouseRegistrationTask"]>(() =>
      Promise.resolve("00000000-0000-0000-0000-000000000006")),
    ...overrides,
  };

  return {
    repository: mocks satisfies PublicListingInquiryRepository,
    mocks,
  };
}

describe("handlePublicListingInquiry", () => {
  it("creates a lead event and showing approval task for showing requests", async () => {
    const { repository, mocks } = createRepository();

    await expect(handlePublicListingInquiry({
      workspaceSlug: "demo-team",
      listingId,
      request: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "showing",
        message: "Can I see this tomorrow?",
        requestedStartAt: "2026-05-07T14:00:00.000Z",
        requestedEndAt: "2026-05-07T14:30:00.000Z",
      },
      repository,
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    })).resolves.toEqual({
      leadId,
      showingTaskId: "00000000-0000-0000-0000-000000000005",
      openHouseRegistrationTaskId: null,
    });

    expect(mocks.insertLeadEvent).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      listing: {
        id: listingId,
        address: "123 Main St",
        workspaceId,
      },
      values: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "showing",
        message: "Can I see this tomorrow?",
        requestedStartAt: "2026-05-07T14:00:00.000Z",
        requestedEndAt: "2026-05-07T14:30:00.000Z",
      },
      providerEventId: `public_listing_inquiry:${workspaceId}:${listingId}:buyerexamplecom:15550100000:${Date.parse("2026-05-06T12:00:00.000Z")}`,
      occurredAt: "2026-05-06T12:00:00.000Z",
    });

    expect(mocks.insertShowingTask).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      listing: {
        id: listingId,
        address: "123 Main St",
        workspaceId,
      },
      assignedMemberId: agentId,
      values: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "showing",
        message: "Can I see this tomorrow?",
        requestedStartAt: "2026-05-07T14:00:00.000Z",
        requestedEndAt: "2026-05-07T14:30:00.000Z",
      },
      createdAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("keeps general inquiries as lead events without showing tasks", async () => {
    const { repository, mocks } = createRepository();

    await expect(handlePublicListingInquiry({
      workspaceSlug: "demo-team",
      listingId: null,
      request: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        message: "Send me homes under 600k.",
      },
      repository,
    })).resolves.toEqual({
      leadId,
      showingTaskId: null,
      openHouseRegistrationTaskId: null,
    });

    expect(mocks.findListing).not.toHaveBeenCalled();
    expect(mocks.insertShowingTask).not.toHaveBeenCalled();
    expect(mocks.insertOpenHouseRegistrationTask).not.toHaveBeenCalled();
  });

  it("creates an open-house registration task for open-house requests", async () => {
    const { repository, mocks } = createRepository();

    await expect(handlePublicListingInquiry({
      workspaceSlug: "demo-team",
      listingId,
      request: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "open_house",
        message: "Register me and my husband for the open house.",
        requestedStartAt: "2026-05-10T18:00:00.000Z",
      },
      repository,
      now: () => new Date("2026-05-06T12:00:00.000Z"),
    })).resolves.toEqual({
      leadId,
      showingTaskId: null,
      openHouseRegistrationTaskId: "00000000-0000-0000-0000-000000000006",
    });

    expect(mocks.insertShowingTask).not.toHaveBeenCalled();
    expect(mocks.insertOpenHouseRegistrationTask).toHaveBeenCalledWith({
      workspaceId,
      leadId,
      listing: {
        id: listingId,
        address: "123 Main St",
        workspaceId,
      },
      assignedMemberId: agentId,
      values: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "open_house",
        message: "Register me and my husband for the open house.",
        requestedStartAt: "2026-05-10T18:00:00.000Z",
      },
      createdAt: "2026-05-06T12:00:00.000Z",
    });
  });

  it("requires a listing for showing requests", async () => {
    const { repository } = createRepository();

    await expect(handlePublicListingInquiry({
      workspaceSlug: "demo-team",
      listingId: null,
      request: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "showing",
      },
      repository,
    })).rejects.toMatchObject(new PublicListingInquiryError("listing_required", 400));
  });

  it("requires a listing for open-house requests", async () => {
    const { repository } = createRepository();

    await expect(handlePublicListingInquiry({
      workspaceSlug: "demo-team",
      listingId: null,
      request: {
        fullName: "Katy Buyer",
        email: "buyer@example.com",
        phone: "+15550100000",
        intent: "open_house",
      },
      repository,
    })).rejects.toMatchObject(new PublicListingInquiryError("listing_required", 400));
  });
});
