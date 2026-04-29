export type VerifyListingTaskRepository = {
  findLead(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<{ assignedMemberId: string | null } | null>;
  findOpenVerifyListingTask(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<{ id: string } | null>;
  insertVerifyListingTask(params: {
    workspaceId: string;
    leadId: string;
    assignedMemberId: string | null;
    title: string;
    description: string;
    priority: "high";
  }): Promise<void>;
  updateVerifyListingTask(params: {
    taskId: string;
    assignedMemberId: string | null;
    title: string;
    description: string;
    priority: "high";
  }): Promise<void>;
};

function buildVerifyListingTaskTitle(listingReference: string): string {
  return `Verify listing details: ${listingReference}`.slice(0, 255);
}

function buildVerifyListingTaskDescription(params: {
  listingReference: string;
  question: string | null;
  verifiedAt: string | null;
}): string {
  return [
    `Caller asked about ${params.listingReference}.`,
    params.question === null ? "" : `Question: ${params.question}`,
    params.verifiedAt === null
      ? "Current listing details could not be verified during the call."
      : `Last known verification timestamp: ${params.verifiedAt}. Re-check current status and facts before follow-up.`,
  ].filter((part) => part.length > 0).join(" ");
}

export async function createOrRefreshVerifyListingTask(params: {
  workspaceId: string;
  leadId: string;
  listingReference: string;
  question: string | null;
  verifiedAt: string | null;
  repository: VerifyListingTaskRepository;
}): Promise<"created" | "refreshed" | "skipped"> {
  const lead = await params.repository.findLead({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
  });
  if (lead === null) {
    return "skipped";
  }

  const title = buildVerifyListingTaskTitle(params.listingReference);
  const description = buildVerifyListingTaskDescription({
    listingReference: params.listingReference,
    question: params.question,
    verifiedAt: params.verifiedAt,
  });
  const existingTask = await params.repository.findOpenVerifyListingTask({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
  });

  if (existingTask !== null) {
    await params.repository.updateVerifyListingTask({
      taskId: existingTask.id,
      assignedMemberId: lead.assignedMemberId,
      title,
      description,
      priority: "high",
    });
    return "refreshed";
  }

  await params.repository.insertVerifyListingTask({
    workspaceId: params.workspaceId,
    leadId: params.leadId,
    assignedMemberId: lead.assignedMemberId,
    title,
    description,
    priority: "high",
  });
  return "created";
}
