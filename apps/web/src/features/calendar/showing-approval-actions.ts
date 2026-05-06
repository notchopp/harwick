import {
  GoogleCalendarCredentialSchema,
  ShowingApprovalActionRequestSchema,
  type GoogleCalendarCredential,
  type ShowingApprovalActionResult,
  type WorkspaceRole,
} from "@realty-ops/core";
import type { GoogleCalendarClient } from "@realty-ops/integrations";
import { decryptCredential, encryptCredential } from "../../lib/credentials";
import type {
  ActiveMemberCalendarConnection,
  MemberCalendarConnectionRepository,
} from "../../lib/supabase/member-calendar-connections";

export type ShowingApprovalTask = {
  id: string;
  workspaceId: string;
  leadId: string | null;
  listingId: string | null;
  taskType: string;
  status: string;
  title: string;
  description: string | null;
  assignedMemberId: string | null;
  requestedStartAt: string | null;
  requestedEndAt: string | null;
};

export type ShowingApprovalLead = {
  id: string;
  assignedAgentId: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
};

export type ShowingApprovalRepository = {
  findShowingTask(params: {
    workspaceId: string;
    taskId: string;
  }): Promise<ShowingApprovalTask | null>;
  findLead(params: {
    workspaceId: string;
    leadId: string;
  }): Promise<ShowingApprovalLead | null>;
  completeShowingTask(params: {
    workspaceId: string;
    taskId: string;
    approvedByMemberId: string;
    approvedAt: string;
    start: string;
    end: string;
    calendarProvider: "google";
    calendarId: string;
    calendarEventId: string;
  }): Promise<void>;
  dismissShowingTask(params: {
    workspaceId: string;
    taskId: string;
    dismissedAt: string;
    reason: string;
  }): Promise<void>;
  markLeadAppointmentBooked(params: {
    workspaceId: string;
    leadId: string;
    updatedAt: string;
  }): Promise<void>;
};

export type ShowingApprovalActionDeps = {
  workspaceId: string;
  taskId: string;
  memberId: string;
  memberRole: WorkspaceRole;
  request: unknown;
  repository: ShowingApprovalRepository;
  calendarConnectionRepository: MemberCalendarConnectionRepository;
  calendarClient: Pick<GoogleCalendarClient, "createEvent"> & Partial<Pick<GoogleCalendarClient, "refreshAccessToken">>;
  credentialSecret: string;
  googleCalendarOAuth?: {
    clientId: string;
    clientSecret: string;
  };
  now?: () => Date;
};

function shouldRefreshGoogleCredential(credential: GoogleCalendarCredential, now: Date): boolean {
  if (credential.refreshToken === null || credential.expiresAt === null) {
    return false;
  }

  const expiresAt = Date.parse(credential.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= now.getTime() + 2 * 60 * 1000;
}

function canActOnShowingTask(params: {
  memberId: string;
  memberRole: WorkspaceRole;
  task: ShowingApprovalTask;
}): boolean {
  if (
    params.memberRole === "owner"
    || params.memberRole === "admin"
    || params.memberRole === "team_lead"
    || params.memberRole === "lead_manager"
    || params.memberRole === "operator"
  ) {
    return true;
  }

  return params.memberRole === "agent" && params.task.assignedMemberId === params.memberId;
}

function buildGoogleCredentialFromRefresh(params: {
  existing: GoogleCalendarCredential;
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
  scope?: string;
  now: Date;
}): GoogleCalendarCredential {
  return GoogleCalendarCredentialSchema.parse({
    version: "google_calendar_oauth_v1",
    accessToken: params.accessToken,
    refreshToken: params.refreshToken ?? params.existing.refreshToken,
    tokenType: params.tokenType,
    scope: params.scope ?? params.existing.scope,
    expiresAt: params.expiresIn === undefined
      ? null
      : new Date(params.now.getTime() + params.expiresIn * 1000).toISOString(),
  });
}

async function readUsableCredential(params: {
  connection: ActiveMemberCalendarConnection;
  credentialSecret: string;
  calendarClient: ShowingApprovalActionDeps["calendarClient"];
  googleCalendarOAuth: ShowingApprovalActionDeps["googleCalendarOAuth"];
  calendarConnectionRepository: MemberCalendarConnectionRepository;
  now: Date;
}): Promise<GoogleCalendarCredential> {
  let credential = GoogleCalendarCredentialSchema.parse(
    decryptCredential<unknown>(params.connection.encryptedCredentialRef, params.credentialSecret),
  );

  if (
    shouldRefreshGoogleCredential(credential, params.now)
    && credential.refreshToken !== null
    && params.calendarClient.refreshAccessToken !== undefined
    && params.googleCalendarOAuth !== undefined
  ) {
    const refreshed = await params.calendarClient.refreshAccessToken({
      clientId: params.googleCalendarOAuth.clientId,
      clientSecret: params.googleCalendarOAuth.clientSecret,
      refreshToken: credential.refreshToken,
    });
    credential = buildGoogleCredentialFromRefresh({
      existing: credential,
      accessToken: refreshed.access_token,
      tokenType: refreshed.token_type,
      now: params.now,
      ...(refreshed.refresh_token === undefined ? {} : { refreshToken: refreshed.refresh_token }),
      ...(refreshed.expires_in === undefined ? {} : { expiresIn: refreshed.expires_in }),
      ...(refreshed.scope === undefined ? {} : { scope: refreshed.scope }),
    });
    await params.calendarConnectionRepository.updateEncryptedCredential({
      connectionId: params.connection.id,
      encryptedCredentialRef: encryptCredential(credential, params.credentialSecret),
      syncedAt: params.now.toISOString(),
    });
  }

  return credential;
}

function buildEventDescription(params: {
  task: ShowingApprovalTask;
  lead: ShowingApprovalLead;
  note?: string;
}): string {
  return [
    params.task.description,
    params.lead.phone === null ? null : `Lead phone: ${params.lead.phone}`,
    params.lead.email === null ? null : `Lead email: ${params.lead.email}`,
    params.note === undefined ? null : `Approval note: ${params.note}`,
  ].filter((line): line is string => line !== null && line.trim().length > 0).join("\n\n");
}

function buildGoogleCalendarEventId(taskId: string): string {
  return `ro${taskId.replace(/-/g, "").toLowerCase()}`;
}

export async function actOnShowingApproval(
  deps: ShowingApprovalActionDeps,
): Promise<ShowingApprovalActionResult | null> {
  const request = ShowingApprovalActionRequestSchema.parse(deps.request);
  const task = await deps.repository.findShowingTask({
    workspaceId: deps.workspaceId,
    taskId: deps.taskId,
  });
  if (task === null) {
    return null;
  }
  if (!canActOnShowingTask({
    memberId: deps.memberId,
    memberRole: deps.memberRole,
    task,
  })) {
    return null;
  }

  const now = deps.now?.() ?? new Date();
  const occurredAt = now.toISOString();

  if (request.action === "dismiss") {
    await deps.repository.dismissShowingTask({
      workspaceId: deps.workspaceId,
      taskId: deps.taskId,
      dismissedAt: occurredAt,
      reason: request.reason,
    });
    return {
      status: "dismissed",
      taskId: task.id,
      reason: request.reason,
    };
  }

  if (
    task.status !== "open"
    && task.status !== "in_progress"
  ) {
    return null;
  }
  if (task.leadId === null) {
    return null;
  }

  const lead = await deps.repository.findLead({
    workspaceId: deps.workspaceId,
    leadId: task.leadId,
  });
  if (lead === null) {
    return null;
  }

  const memberId = task.assignedMemberId ?? lead.assignedAgentId;
  if (memberId === null) {
    return null;
  }

  const connection = await deps.calendarConnectionRepository.findActiveConnection({
    workspaceId: deps.workspaceId,
    memberId,
  });
  if (connection === null) {
    return null;
  }

  const credential = await readUsableCredential({
    connection,
    credentialSecret: deps.credentialSecret,
    calendarClient: deps.calendarClient,
    googleCalendarOAuth: deps.googleCalendarOAuth,
    calendarConnectionRepository: deps.calendarConnectionRepository,
    now,
  });

  const attendeeEmail = request.attendeeEmail ?? lead.email;
  const attendeeName = request.attendeeName ?? lead.fullName;
  const attendees = attendeeEmail === null || attendeeEmail === undefined
    ? undefined
    : [{
        email: attendeeEmail,
        ...(attendeeName === null || attendeeName === undefined ? {} : { displayName: attendeeName }),
      }];

  const event = await deps.calendarClient.createEvent({
    accessToken: credential.accessToken,
    calendarId: connection.calendarId,
    eventId: buildGoogleCalendarEventId(task.id),
    summary: request.title ?? task.title,
    description: buildEventDescription({
      task,
      lead,
      ...(request.note === undefined ? {} : { note: request.note }),
    }),
    ...(request.location === undefined ? {} : { location: request.location }),
    start: request.start,
    end: request.end,
    timeZone: connection.timezone,
    ...(attendees === undefined ? {} : { attendees }),
  });

  await deps.repository.completeShowingTask({
    workspaceId: deps.workspaceId,
    taskId: task.id,
    approvedByMemberId: deps.memberId,
    approvedAt: occurredAt,
    start: request.start,
    end: request.end,
    calendarProvider: "google",
    calendarId: connection.calendarId,
    calendarEventId: event.eventId,
  });
  await deps.repository.markLeadAppointmentBooked({
    workspaceId: deps.workspaceId,
    leadId: lead.id,
    updatedAt: occurredAt,
  });

  return {
    status: "booked",
    taskId: task.id,
    leadId: lead.id,
    memberId,
    provider: "google",
    calendarId: connection.calendarId,
    calendarEventId: event.eventId,
    start: request.start,
    end: request.end,
  };
}
