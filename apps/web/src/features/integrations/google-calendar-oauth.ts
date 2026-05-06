import { randomBytes } from "node:crypto";
import {
  GoogleCalendarCredentialSchema,
  StartGoogleCalendarOAuthRequestSchema,
} from "@realty-ops/core";
import {
  buildGoogleCalendarOAuthUrl,
  type GoogleCalendarClient,
  type GoogleCalendarTokenResponse,
} from "@realty-ops/integrations";
import { encryptCredential } from "../../lib/credentials";

export type GoogleCalendarOAuthRepository = {
  createPendingConnection(params: {
    workspaceId: string;
    memberId: string;
    oauthState: string;
  }): Promise<void>;
  connectCalendar(params: {
    oauthState: string;
    encryptedCredentialRef: string;
    providerAccountEmail: string | null;
    calendarId: string;
    timezone: string;
  }): Promise<{
    workspaceId: string;
    memberId: string;
  } | null>;
};

function buildExpiresAt(params: {
  tokenResponse: GoogleCalendarTokenResponse;
  now: Date;
}): string | null {
  if (params.tokenResponse.expires_in === undefined) {
    return null;
  }

  return new Date(params.now.getTime() + params.tokenResponse.expires_in * 1000).toISOString();
}

function buildRedirectUrl(baseUrl: string, searchParams: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function startGoogleCalendarOAuth(params: {
  request: unknown;
  workspaceId: string;
  defaultMemberId: string;
  clientId: string;
  redirectUri: string;
  repository: GoogleCalendarOAuthRepository;
}): Promise<{ status: 200 | 400; body: { authorizationUrl?: string; state?: string; error?: "invalid_request" } }> {
  const parsed = StartGoogleCalendarOAuthRequestSchema.safeParse(params.request);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const memberId = parsed.data.memberId ?? params.defaultMemberId;
  const state = randomBytes(24).toString("hex");
  await params.repository.createPendingConnection({
    workspaceId: params.workspaceId,
    memberId,
    oauthState: state,
  });

  return {
    status: 200,
    body: {
      state,
      authorizationUrl: buildGoogleCalendarOAuthUrl({
        clientId: params.clientId,
        redirectUri: params.redirectUri,
        state,
      }),
    },
  };
}

export async function handleGoogleCalendarOAuthCallback(params: {
  query: {
    state: string | null;
    code: string | null;
  };
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  oauthClient: Pick<GoogleCalendarClient, "exchangeCodeForTokens">;
  repository: GoogleCalendarOAuthRepository;
  credentialSecret: string;
  appBaseUrl: string;
  now?: Date;
}): Promise<
  | { status: 302; body: { redirectUrl: string } }
  | { status: 400; body: { error: "invalid_request" | "invalid_state" } }
> {
  const state = params.query.state?.trim();
  const code = params.query.code?.trim();
  if (state === undefined || state.length === 0 || code === undefined || code.length === 0) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const tokenResponse = await params.oauthClient.exchangeCodeForTokens({
    clientId: params.clientId,
    clientSecret: params.clientSecret,
    code,
    redirectUri: params.redirectUri,
  });
  const now = params.now ?? new Date();
  const credential = GoogleCalendarCredentialSchema.parse({
    version: "google_calendar_oauth_v1",
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token ?? null,
    tokenType: tokenResponse.token_type,
    scope: tokenResponse.scope ?? null,
    expiresAt: buildExpiresAt({ tokenResponse, now }),
  });

  const connected = await params.repository.connectCalendar({
    oauthState: state,
    encryptedCredentialRef: encryptCredential(credential, params.credentialSecret),
    providerAccountEmail: null,
    calendarId: "primary",
    timezone: "America/New_York",
  });

  if (connected === null) {
    return {
      status: 400,
      body: { error: "invalid_state" },
    };
  }

  return {
    status: 302,
    body: {
      redirectUrl: buildRedirectUrl(params.appBaseUrl, {
        google_calendar: "connected",
      }),
    },
  };
}
