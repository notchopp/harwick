import { GoogleCalendarCredentialSchema } from "@realty-ops/core";
import { encryptCredential } from "../../lib/credentials";

export type GoogleCalendarSessionTokens = {
  providerToken: string | null;
  providerRefreshToken: string | null;
  providerAccountEmail: string | null;
};

export type CaptureGoogleCalendarMembership = {
  workspaceId: string;
  memberId: string;
};

export type CaptureGoogleCalendarRepository = {
  upsertConnectionFromSession(params: {
    workspaceId: string;
    memberId: string;
    encryptedCredentialRef: string;
    providerAccountEmail: string | null;
    calendarId: string;
    timezone: string;
    syncedAt: string;
  }): Promise<void>;
};

export type CaptureGoogleCalendarFromSessionResult =
  | { status: "skipped"; reason: "no_provider_tokens" | "no_memberships" }
  | { status: "captured"; connectedCount: number };

export async function captureGoogleCalendarFromSession(params: {
  tokens: GoogleCalendarSessionTokens;
  memberships: CaptureGoogleCalendarMembership[];
  credentialSecret: string;
  repository: CaptureGoogleCalendarRepository;
  defaultTimezone?: string;
  now?: Date;
}): Promise<CaptureGoogleCalendarFromSessionResult> {
  const accessToken = params.tokens.providerToken?.trim() ?? "";
  const refreshToken = params.tokens.providerRefreshToken?.trim() ?? "";
  if (accessToken.length === 0 || refreshToken.length === 0) {
    return { status: "skipped", reason: "no_provider_tokens" };
  }

  if (params.memberships.length === 0) {
    return { status: "skipped", reason: "no_memberships" };
  }

  const credential = GoogleCalendarCredentialSchema.parse({
    version: "google_calendar_oauth_v1",
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    scope: "https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events",
    expiresAt: null,
  });
  const encryptedCredentialRef = encryptCredential(credential, params.credentialSecret);
  const syncedAt = (params.now ?? new Date()).toISOString();
  const timezone = params.defaultTimezone ?? "America/New_York";

  for (const membership of params.memberships) {
    await params.repository.upsertConnectionFromSession({
      workspaceId: membership.workspaceId,
      memberId: membership.memberId,
      encryptedCredentialRef,
      providerAccountEmail: params.tokens.providerAccountEmail,
      calendarId: "primary",
      timezone,
      syncedAt,
    });
  }

  return { status: "captured", connectedCount: params.memberships.length };
}
