import {
  chooseNurtureChannel,
  OpenHouseReminderProductionReportSchema,
  type NurtureMessageChannel,
  type OpenHouseReminderProductionReport,
} from "@realty-ops/core";

export type OpenHouseReminderRegistrationTask = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  listingId: string | null;
  assignedMemberId: string | null;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
  dueAt: string | null;
};

export type OpenHouseReminderLead = {
  id: string;
  workspaceId: string;
  fullName: string | null;
  phone: string | null;
  instagramUserId: string | null;
  sourceChannel: "instagram_dm" | "instagram_comment" | "facebook_dm" | "facebook_comment" | "call" | "sms" | "manual" | "csv_import";
};

export type OpenHouseReminderListing = {
  id: string;
  workspaceId: string;
  address: string;
  mlsNumber: string | null;
};

export type OpenHouseReminderRepository = {
  listUpcomingOpenHouseRegistrations(params: {
    windowStartIso: string;
    windowEndIso: string;
    limit: number;
  }): Promise<OpenHouseReminderRegistrationTask[]>;
  findLead(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<OpenHouseReminderLead | null>;
  findListing(params: {
    workspaceId: string;
    listingId: string;
  }): Promise<OpenHouseReminderListing | null>;
  upsertReminderEnrollment(params: {
    workspaceId: string;
    leadId: string;
    sequenceKey: string;
    nextActionAt: string;
  }): Promise<string>;
  findExistingReminderMessage(params: {
    workspaceId: string;
    enrollmentId: string;
    stepIndex: number;
  }): Promise<{ id: string } | null>;
  insertReminderMessage(params: {
    workspaceId: string;
    leadId: string;
    enrollmentId: string;
    channel: NurtureMessageChannel;
    status: "drafted" | "blocked";
    stepIndex: number;
    body: string | null;
    blockReason: "missing_contact" | null;
    scheduledFor: string | null;
  }): Promise<string>;
  insertReviewTask(params: {
    workspaceId: string;
    leadId: string;
    listingId: string | null;
    assignedMemberId: string | null;
    title: string;
    description: string;
    dueAt: string;
  }): Promise<void>;
};

function firstName(fullName: string | null): string | null {
  return fullName?.trim().split(/\s+/)[0] ?? null;
}

function formatReminderTime(startIso: string): string {
  const date = new Date(startIso);
  if (!Number.isFinite(date.getTime())) {
    return "your registered arrival time";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function buildReminderBody(params: {
  lead: OpenHouseReminderLead;
  listing: OpenHouseReminderListing | null;
  requestedStartAt: string;
}): string {
  const greeting = firstName(params.lead.fullName) === null
    ? "Hey"
    : `Hey ${firstName(params.lead.fullName)}`;
  const address = params.listing === null ? "the open house" : `the open house at ${params.listing.address}`;
  const reminderTime = formatReminderTime(params.requestedStartAt);

  return `${greeting}, quick reminder: you registered for ${address} around ${reminderTime}. Reply here if your plans changed or you want details before you arrive.`
    .slice(0, 480);
}

function reminderSequenceKey(taskId: string): string {
  return `open_house_reminder:${taskId}`;
}

export async function produceOpenHouseReminders(params: {
  repository: OpenHouseReminderRepository;
  now?: () => Date;
  hoursAhead?: number;
  limit?: number;
}): Promise<OpenHouseReminderProductionReport> {
  const now = params.now?.() ?? new Date();
  const hoursAhead = params.hoursAhead ?? 24;
  const windowStartIso = now.toISOString();
  const windowEndIso = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000).toISOString();
  const tasks = await params.repository.listUpcomingOpenHouseRegistrations({
    windowStartIso,
    windowEndIso,
    limit: params.limit ?? 100,
  });

  const report = {
    scanned: tasks.length,
    remindersDrafted: 0,
    remindersAlreadyPresent: 0,
    remindersBlocked: 0,
    skipped: 0,
    errors: 0,
  };

  for (const task of tasks) {
    try {
      if (task.leadId === null || task.requestedStartAt === null) {
        report.skipped += 1;
        continue;
      }

      const lead = await params.repository.findLead({
        workspaceId: task.workspaceId,
        leadId: task.leadId,
      });
      if (lead === null) {
        report.skipped += 1;
        continue;
      }

      const enrollmentId = await params.repository.upsertReminderEnrollment({
        workspaceId: task.workspaceId,
        leadId: task.leadId,
        sequenceKey: reminderSequenceKey(task.id),
        nextActionAt: windowStartIso,
      });
      const existingMessage = await params.repository.findExistingReminderMessage({
        workspaceId: task.workspaceId,
        enrollmentId,
        stepIndex: 0,
      });
      if (existingMessage !== null) {
        report.remindersAlreadyPresent += 1;
        continue;
      }

      const listing = task.listingId === null
        ? null
        : await params.repository.findListing({
          workspaceId: task.workspaceId,
          listingId: task.listingId,
        });
      const channel = chooseNurtureChannel({
        leadId: lead.id,
        workspaceId: lead.workspaceId,
        fullName: lead.fullName,
        phone: lead.phone,
        instagramUserId: lead.instagramUserId,
        sourceChannel: lead.sourceChannel,
      });
      if (channel === null) {
        await params.repository.insertReminderMessage({
          workspaceId: task.workspaceId,
          leadId: task.leadId,
          enrollmentId,
          channel: "sms",
          status: "blocked",
          stepIndex: 0,
          body: null,
          blockReason: "missing_contact",
          scheduledFor: task.requestedStartAt,
        });
        await params.repository.insertReviewTask({
          workspaceId: task.workspaceId,
          leadId: task.leadId,
          listingId: task.listingId,
          assignedMemberId: task.assignedMemberId,
          title: "Open house reminder needs contact",
          description: "Harwick could not draft an open-house reminder because the lead has no SMS or social DM contact.",
          dueAt: task.dueAt ?? task.requestedStartAt,
        });
        report.remindersBlocked += 1;
        continue;
      }

      const body = buildReminderBody({
        lead,
        listing,
        requestedStartAt: task.requestedStartAt,
      });
      await params.repository.insertReminderMessage({
        workspaceId: task.workspaceId,
        leadId: task.leadId,
        enrollmentId,
        channel,
        status: "drafted",
        stepIndex: 0,
        body,
        blockReason: null,
        scheduledFor: task.requestedStartAt,
      });
      await params.repository.insertReviewTask({
        workspaceId: task.workspaceId,
        leadId: task.leadId,
        listingId: task.listingId,
        assignedMemberId: task.assignedMemberId,
        title: "Review open house reminder",
        description: body,
        dueAt: task.dueAt ?? task.requestedStartAt,
      });
      report.remindersDrafted += 1;
    } catch {
      report.errors += 1;
    }
  }

  return OpenHouseReminderProductionReportSchema.parse(report);
}
