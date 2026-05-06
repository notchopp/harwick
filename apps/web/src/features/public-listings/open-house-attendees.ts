import {
  OpenHouseAttendeesResponseSchema,
  type OpenHouseAttendee,
  type OpenHouseAttendeesResponse,
} from "@realty-ops/core";

export type OpenHouseRegistrationTask = {
  id: string;
  workspaceId: string;
  listingId: string;
  leadId: string | null;
  status: string;
  requestedArrivalAt: string | null;
  createdAt: string;
};

export type OpenHouseAttendeeLead = {
  id: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

export type OpenHouseAttendeesRepository = {
  listRegistrationTasks(params: {
    workspaceId: string;
    listingId: string;
    limit: number;
  }): Promise<OpenHouseRegistrationTask[]>;
  listLeads(params: {
    workspaceId: string;
    leadIds: string[];
  }): Promise<OpenHouseAttendeeLead[]>;
};

export async function loadOpenHouseAttendees(params: {
  workspaceId: string;
  listingId: string;
  limit?: number;
  repository: OpenHouseAttendeesRepository;
}): Promise<OpenHouseAttendeesResponse> {
  const limit = params.limit ?? 100;
  const tasks = await params.repository.listRegistrationTasks({
    workspaceId: params.workspaceId,
    listingId: params.listingId,
    limit,
  });
  const leadIds = [...new Set(tasks.map((task) => task.leadId).filter((id): id is string => id !== null))];
  const leads = leadIds.length === 0
    ? []
    : await params.repository.listLeads({
        workspaceId: params.workspaceId,
        leadIds,
      });
  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));

  const attendees: OpenHouseAttendee[] = tasks.map((task) => {
    const lead = task.leadId === null ? undefined : leadsById.get(task.leadId);
    return {
      taskId: task.id,
      workspaceId: task.workspaceId,
      listingId: task.listingId,
      leadId: task.leadId,
      status: task.status,
      attendeeName: lead?.fullName ?? null,
      attendeeEmail: lead?.email ?? null,
      attendeePhone: lead?.phone ?? null,
      requestedArrivalAt: task.requestedArrivalAt,
      createdAt: task.createdAt,
    };
  });

  return OpenHouseAttendeesResponseSchema.parse({ attendees });
}
