import { describe, expect, it, vi } from "vitest";
import {
  loadOpenHouseAttendees,
  type OpenHouseAttendeesRepository,
} from "./open-house-attendees";

const workspaceId = "00000000-0000-0000-0000-000000000001";
const listingId = "00000000-0000-0000-0000-000000000002";
const leadId = "00000000-0000-0000-0000-000000000003";
const taskId = "00000000-0000-0000-0000-000000000004";

describe("loadOpenHouseAttendees", () => {
  it("maps registration tasks and lead contact details into attendees", async () => {
    const repository = {
      listRegistrationTasks: vi.fn<OpenHouseAttendeesRepository["listRegistrationTasks"]>(() =>
        Promise.resolve([{
          id: taskId,
          workspaceId,
          listingId,
          leadId,
          status: "open",
          requestedArrivalAt: "2026-05-10T18:00:00.000Z",
          createdAt: "2026-05-06T12:00:00.000Z",
        }])),
      listLeads: vi.fn<OpenHouseAttendeesRepository["listLeads"]>(() =>
        Promise.resolve([{
          id: leadId,
          fullName: "Katy Buyer",
          email: "buyer@example.com",
          phone: "+15550100000",
        }])),
    } satisfies OpenHouseAttendeesRepository;

    await expect(loadOpenHouseAttendees({
      workspaceId,
      listingId,
      repository,
    })).resolves.toEqual({
      attendees: [{
        taskId,
        workspaceId,
        listingId,
        leadId,
        status: "open",
        attendeeName: "Katy Buyer",
        attendeeEmail: "buyer@example.com",
        attendeePhone: "+15550100000",
        requestedArrivalAt: "2026-05-10T18:00:00.000Z",
        createdAt: "2026-05-06T12:00:00.000Z",
      }],
    });

    expect(repository.listLeads).toHaveBeenCalledWith({
      workspaceId,
      leadIds: [leadId],
    });
  });
});
