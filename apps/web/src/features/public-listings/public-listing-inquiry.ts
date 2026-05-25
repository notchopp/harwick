import {
  PublicListingInquiryRequestSchema,
  type PublicListingInquiryRequest,
} from "@realty-ops/core";

export type PublicListingInquiryWorkspace = {
  id: string;
};

export type PublicListingInquiryListing = {
  id: string;
  address: string;
  workspaceId: string;
};

export type PublicListingInquiryLead = {
  id: string;
  assignedAgentId: string | null;
};

export type PublicListingInquiryRepository = {
  findWorkspaceBySlug(workspaceSlug: string): Promise<PublicListingInquiryWorkspace | null>;
  findListing(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<PublicListingInquiryListing | null>;
  findExistingLead(params: {
    workspaceId: string;
    email: string;
    phone: string;
  }): Promise<PublicListingInquiryLead | null>;
  updateLead(params: {
    leadId: string;
    values: PublicListingInquiryRequest;
    updatedAt: string;
  }): Promise<void>;
  insertLead(params: {
    workspaceId: string;
    values: PublicListingInquiryRequest;
    createdAt: string;
  }): Promise<PublicListingInquiryLead>;
  insertLeadEvent(params: {
    workspaceId: string;
    leadId: string;
    listing: PublicListingInquiryListing | null;
    values: PublicListingInquiryRequest;
    providerEventId: string;
    occurredAt: string;
  }): Promise<void>;
  insertShowingTask(params: {
    workspaceId: string;
    leadId: string;
    listing: PublicListingInquiryListing;
    assignedMemberId: string | null;
    values: PublicListingInquiryRequest;
    createdAt: string;
  }): Promise<string>;
  insertOpenHouseRegistrationTask(params: {
    workspaceId: string;
    leadId: string;
    listing: PublicListingInquiryListing;
    assignedMemberId: string | null;
    values: PublicListingInquiryRequest;
    createdAt: string;
  }): Promise<string>;
};

export type PublicListingInquiryResult = {
  leadId: string;
  workspaceId: string;
  showingTaskId: string | null;
  openHouseRegistrationTaskId: string | null;
  lead: {
    fullName: string;
    email: string;
    phone: string;
    intent: "general" | "question" | "showing" | "open_house";
    message: string | null;
  };
  listingContext: {
    address: string;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    price: number | null;
  } | null;
};

export class PublicListingInquiryError extends Error {
  constructor(
    readonly code: "workspace_not_found" | "listing_not_found" | "listing_required",
    readonly status: 400 | 404,
  ) {
    super(code);
  }
}

function buildProviderEventId(params: {
  workspaceId: string;
  listingId: string | null;
  email: string;
  phone: string;
  occurredAt: string;
}): string {
  const emailKey = params.email.toLowerCase().replace(/[^a-z0-9]/g, "");
  const phoneKey = params.phone.replace(/[^0-9]/g, "");
  return [
    "public_listing_inquiry",
    params.workspaceId,
    params.listingId ?? "general",
    emailKey,
    phoneKey,
    Date.parse(params.occurredAt),
  ].join(":");
}

export async function handlePublicListingInquiry(params: {
  workspaceSlug: string;
  listingId: string | null;
  request: unknown;
  repository: PublicListingInquiryRepository;
  now?: () => Date;
}): Promise<PublicListingInquiryResult> {
  const values = PublicListingInquiryRequestSchema.parse(params.request);
  const workspace = await params.repository.findWorkspaceBySlug(params.workspaceSlug);
  if (workspace === null) {
    throw new PublicListingInquiryError("workspace_not_found", 404);
  }

  if ((values.intent === "showing" || values.intent === "open_house") && params.listingId === null) {
    throw new PublicListingInquiryError("listing_required", 400);
  }

  const listing = params.listingId === null
    ? null
    : await params.repository.findListing({
        workspaceId: workspace.id,
        listingId: params.listingId,
      });
  if (params.listingId !== null && listing === null) {
    throw new PublicListingInquiryError("listing_not_found", 404);
  }

  const occurredAt = (params.now?.() ?? new Date()).toISOString();
  const existingLead = await params.repository.findExistingLead({
    workspaceId: workspace.id,
    email: values.email,
    phone: values.phone,
  });

  const lead = existingLead === null
    ? await params.repository.insertLead({
        workspaceId: workspace.id,
        values,
        createdAt: occurredAt,
      })
    : existingLead;

  if (existingLead !== null) {
    await params.repository.updateLead({
      leadId: existingLead.id,
      values,
      updatedAt: occurredAt,
    });
  }

  await params.repository.insertLeadEvent({
    workspaceId: workspace.id,
    leadId: lead.id,
    listing,
    values,
    providerEventId: buildProviderEventId({
      workspaceId: workspace.id,
      listingId: listing?.id ?? null,
      email: values.email,
      phone: values.phone,
      occurredAt,
    }),
    occurredAt,
  });

  const showingTaskId = values.intent === "showing" && listing !== null
    ? await params.repository.insertShowingTask({
        workspaceId: workspace.id,
        leadId: lead.id,
        listing,
        assignedMemberId: lead.assignedAgentId,
        values,
        createdAt: occurredAt,
      })
    : null;
  const openHouseRegistrationTaskId = values.intent === "open_house" && listing !== null
    ? await params.repository.insertOpenHouseRegistrationTask({
        workspaceId: workspace.id,
        leadId: lead.id,
        listing,
        assignedMemberId: lead.assignedAgentId,
        values,
        createdAt: occurredAt,
      })
    : null;

  return {
    leadId: lead.id,
    workspaceId: workspace.id,
    showingTaskId,
    openHouseRegistrationTaskId,
    lead: {
      fullName: values.fullName,
      email: values.email,
      phone: values.phone,
      intent: values.intent,
      message: values.message ?? null,
    },
    listingContext: listing === null ? null : extractListingContext(listing),
  };
}

function extractListingContext(listing: Record<string, unknown>): {
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  price: number | null;
} {
  const rawFacts = listing["raw_facts"];
  const raw = typeof rawFacts === "object" && rawFacts !== null && !Array.isArray(rawFacts)
    ? (rawFacts as Record<string, unknown>)
    : {};
  const readString = (key: string): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  };
  const price = listing["price"];
  return {
    address: typeof listing["address"] === "string" ? listing["address"] : "",
    city: readString("city"),
    state: readString("state"),
    postalCode: readString("postalCode") ?? readString("postal_code") ?? readString("zip"),
    price: typeof price === "number" && Number.isFinite(price) ? Math.round(price) : null,
  };
}
