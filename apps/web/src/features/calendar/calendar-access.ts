import {
  GoogleCalendarCredentialSchema,
  type GoogleCalendarCredential,
} from "@realty-ops/core";
import { createGoogleCalendarClient } from "@realty-ops/integrations";

import { decryptCredential, encryptCredential } from "../../lib/credentials";
import { getServerEnvironment } from "../../lib/server-env";
import {
  createSupabaseMemberCalendarConnectionRepository,
  type ActiveMemberCalendarConnection,
} from "../../lib/supabase/member-calendar-connections";
import { createServerSupabaseClient } from "../../lib/supabase/server-client";

/**
 * Standalone calendar-access helper. Loads a member's connected Google
 * Calendar, decrypts the stored credential, refreshes the access token if
 * it's about to expire, persists the refreshed credential back to Supabase,
 * and returns the access context (token + calendar id + timezone) for use
 * by anything that needs to call Google Calendar APIs.
 *
 * Extracted from the operator-chat calendar tool so the buyer-chat
 * tools and the availability-aware routing logic can share the same
 * decrypt + refresh path. Single source of truth — if a token refresh
 * bug surfaces, it gets fixed here once instead of in two places.
 *
 * Returns null in two cases:
 *   - env not configured (GOOGLE_CALENDAR_CLIENT_ID/SECRET or
 *     CREDENTIAL_ENCRYPTION_KEY missing)
 *   - no connected calendar for the member
 * Returns {error} for non-recoverable issues so callers can degrade
 * gracefully (e.g., fall back to "agent will confirm" message instead of
 * proposing a calendar slot).
 */

const CREDENTIAL_REFRESH_BUFFER_MS = 60_000;

export type CalendarAccess = {
  accessToken: string;
  calendarId: string;
  timezone: string;
  connection: ActiveMemberCalendarConnection;
};

export type CalendarAccessResult = CalendarAccess | { error: string };

function isCredentialExpiringSoon(credential: GoogleCalendarCredential, now: Date): boolean {
  if (credential.expiresAt === null) return false;
  return Date.parse(credential.expiresAt) - now.getTime() < CREDENTIAL_REFRESH_BUFFER_MS;
}

export async function loadCalendarAccessForMember(params: {
  workspaceId: string;
  memberId: string;
}): Promise<CalendarAccessResult> {
  const env = getServerEnvironment();
  if (env.GOOGLE_CALENDAR_CLIENT_ID === undefined || env.GOOGLE_CALENDAR_CLIENT_SECRET === undefined) {
    return { error: "google_calendar_oauth_not_configured" };
  }
  if (env.CREDENTIAL_ENCRYPTION_KEY === undefined) {
    return { error: "credential_encryption_key_missing" };
  }

  const supabase = createServerSupabaseClient();
  const repo = createSupabaseMemberCalendarConnectionRepository(supabase);
  const connection = await repo.findActiveConnection({
    workspaceId: params.workspaceId,
    memberId: params.memberId,
  });
  if (connection === null) {
    return { error: "no_calendar_connection" };
  }

  let credential = GoogleCalendarCredentialSchema.parse(
    decryptCredential<unknown>(connection.encryptedCredentialRef, env.CREDENTIAL_ENCRYPTION_KEY),
  );
  const now = new Date();

  if (isCredentialExpiringSoon(credential, now) && credential.refreshToken !== null) {
    const calendarClient = createGoogleCalendarClient();
    try {
      const refreshed = await calendarClient.refreshAccessToken({
        clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
        clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
        refreshToken: credential.refreshToken,
      });
      credential = GoogleCalendarCredentialSchema.parse({
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? credential.refreshToken,
        tokenType: refreshed.token_type,
        scope: refreshed.scope ?? credential.scope,
        expiresAt: refreshed.expires_in === undefined
          ? null
          : new Date(now.getTime() + refreshed.expires_in * 1000).toISOString(),
      });
      await repo.updateEncryptedCredential({
        connectionId: connection.id,
        encryptedCredentialRef: encryptCredential(credential, env.CREDENTIAL_ENCRYPTION_KEY),
        syncedAt: now.toISOString(),
      });
    } catch (error) {
      return {
        error: error instanceof Error ? `token_refresh_failed: ${error.message}` : "token_refresh_failed",
      };
    }
  }

  return {
    accessToken: credential.accessToken,
    calendarId: connection.calendarId,
    timezone: connection.timezone,
    connection,
  };
}

export function isCalendarAccess(value: CalendarAccessResult): value is CalendarAccess {
  return !("error" in value);
}
