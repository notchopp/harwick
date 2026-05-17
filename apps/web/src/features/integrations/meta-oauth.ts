import { randomBytes } from "node:crypto";
import {
  CompleteMetaOAuthSelectionRequestSchema,
  MetaConnectedCredentialSchema,
  MetaOAuthCallbackQuerySchema,
  MetaOAuthPendingSelectionPayloadSchema,
  MetaOAuthPendingSelectionQuerySchema,
  MetaOAuthPendingSelectionResponseSchema,
  StartMetaOAuthRequestSchema,
  type MetaOAuthCredentialAccount,
  type MetaOAuthPendingSelectionResponse,
} from "@realty-ops/core";
import { decryptCredential, encryptCredential } from "../../lib/credentials";

const defaultPendingSelectionMaxAgeMs = 30 * 60 * 1000;

export type MetaOAuthRepository = {
  createPendingIntegration(params: {
    workspaceId: string;
    accountScope: "workspace" | "member";
    ownerMemberId: string | null;
    oauthState: string;
  }): Promise<void>;
  connectIntegration(params: {
    oauthState: string;
    providerAccountId: string;
    providerAccountIds: string[];
    providerAccountName: string | null;
    encryptedCredentialRef: string;
  }): Promise<{
    integrationAccountId: string;
    workspaceId: string;
    accountScope: "workspace" | "member";
    ownerMemberId: string | null;
    providerAccountId: string;
    providerAccountIds: string[];
    providerAccountName: string | null;
  } | null>;
  stagePendingIntegrationSelection(params: {
    oauthState: string;
    encryptedCredentialRef: string;
  }): Promise<boolean>;
  findPendingIntegrationSelection(params: {
    oauthState: string;
  }): Promise<{
    encryptedCredentialRef: string;
  } | null>;
  clearPendingIntegrationSelection(params: {
    oauthState: string;
  }): Promise<void>;
};

export type MetaOAuthClient = {
  exchangeCodeForAccessToken(code: string): Promise<string>;
  exchangeForLongLivedAccessToken(shortLivedAccessToken: string): Promise<string>;
  listInstagramAccounts(userAccessToken: string): Promise<Array<MetaOAuthCredentialAccount>>;
};

export type MetaOAuthConnectedHandler = (params: {
  connectedIntegration: {
    integrationAccountId: string;
    workspaceId: string;
    accountScope: "workspace" | "member";
    ownerMemberId: string | null;
    providerAccountId: string;
    providerAccountIds: string[];
    providerAccountName: string | null;
  };
  connectedAccount: MetaOAuthCredentialAccount;
  connectedCredential: {
    userAccessToken: string;
    pageAccessToken: string;
    pageId: string;
    instagramBusinessAccountId: string;
  };
}) => Promise<void>;

export function buildMetaOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  // Permissions bundled by the Facebook Login for Business path. Maps to two
  // App Review Use Cases:
  //   - "Messaging on Messenger": pages_show_list, pages_manage_metadata,
  //     pages_messaging, pages_read_engagement
  //   - "Manage everything on your Page" (engagement subset):
  //     pages_manage_engagement
  // For Instagram (DMs + comments via the FB Login → linked IG path):
  //     instagram_basic, instagram_manage_messages, instagram_manage_comments
  // The new Instagram Login flow lives at /api/meta/oauth/instagram and uses
  // the modern instagram_business_* scope namespace.
  url.searchParams.set("scope", [
    "pages_show_list",
    "pages_manage_metadata",
    "pages_messaging",
    "pages_read_engagement",
    "pages_manage_engagement",
    "instagram_basic",
    "instagram_manage_messages",
    "instagram_manage_comments",
  ].join(","));

  return url.toString();
}

export async function startMetaOAuth(params: {
  request: unknown;
  appId: string;
  redirectUri: string;
  repository: MetaOAuthRepository;
}): Promise<{ status: 200 | 400; body: { authorizationUrl?: string; state?: string; error?: "invalid_request" } }> {
  const parsed = StartMetaOAuthRequestSchema.safeParse(params.request);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const state = randomBytes(24).toString("hex");
  await params.repository.createPendingIntegration({
    workspaceId: parsed.data.workspaceId,
    accountScope: parsed.data.accountScope,
    ownerMemberId: parsed.data.ownerMemberId,
    oauthState: state,
  });

  return {
    status: 200,
    body: {
      state,
      authorizationUrl: buildMetaOAuthUrl({
        appId: params.appId,
        redirectUri: params.redirectUri,
        state,
      }),
    },
  };
}

function isPendingSelectionExpired(params: {
  issuedAt: string;
  now: Date;
  maxAgeMs: number;
}): boolean {
  return params.now.getTime() - new Date(params.issuedAt).getTime() > params.maxAgeMs;
}

function buildRedirectUrl(baseUrl: string, searchParams: Record<string, string>): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(searchParams)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export async function handleMetaOAuthCallback(params: {
  query: unknown;
  oauthClient: MetaOAuthClient;
  repository: MetaOAuthRepository;
  credentialSecret: string;
  appBaseUrl: string;
  onConnected?: MetaOAuthConnectedHandler;
  now?: Date;
  pendingSelectionMaxAgeMs?: number;
}): Promise<
  | { status: 302; body: { redirectUrl: string } }
  | { status: 400; body: { error: "invalid_request" | "invalid_state" | "no_instagram_business_account" } }
> {
  const parsed = MetaOAuthCallbackQuerySchema.safeParse(params.query);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const shortToken = await params.oauthClient.exchangeCodeForAccessToken(parsed.data.code);
  const longToken = await params.oauthClient.exchangeForLongLivedAccessToken(shortToken);
  const accounts = await params.oauthClient.listInstagramAccounts(longToken);
  const [account] = accounts;
  if (account === undefined) {
    return {
      status: 400,
      body: { error: "no_instagram_business_account" },
    };
  }

  if (accounts.length > 1) {
    const staged = await params.repository.stagePendingIntegrationSelection({
      oauthState: parsed.data.state,
      encryptedCredentialRef: encryptCredential(MetaOAuthPendingSelectionPayloadSchema.parse({
        version: "meta_oauth_selection_v1",
        issuedAt: (params.now ?? new Date()).toISOString(),
        userAccessToken: longToken,
        accounts,
      }), params.credentialSecret),
    });

    if (!staged) {
      return {
        status: 400,
        body: { error: "invalid_state" },
      };
    }

    return {
      status: 302,
      body: {
        redirectUrl: buildRedirectUrl(params.appBaseUrl, {
          meta_oauth: "selection_required",
          state: parsed.data.state,
        }),
      },
    };
  }

  const connectedCredential = MetaConnectedCredentialSchema.parse({
    userAccessToken: longToken,
    pageAccessToken: account.pageAccessToken,
    pageId: account.pageId,
    instagramBusinessAccountId: account.instagramBusinessAccountId,
  });
  const connected = await params.repository.connectIntegration({
    oauthState: parsed.data.state,
    providerAccountId: account.instagramBusinessAccountId,
    providerAccountIds: [account.instagramBusinessAccountId, account.pageId],
    providerAccountName: account.instagramUsername ?? account.pageName,
    encryptedCredentialRef: encryptCredential(connectedCredential, params.credentialSecret),
  });

  if (connected === null) {
    return {
      status: 400,
      body: { error: "invalid_state" },
    };
  }

  if (params.onConnected !== undefined) {
    await params.onConnected({
      connectedIntegration: connected,
      connectedAccount: account,
      connectedCredential,
    });
  }

  return {
    status: 302,
    body: {
      redirectUrl: buildRedirectUrl(params.appBaseUrl, {
        meta_oauth: "connected",
      }),
    },
  };
}

export async function getPendingMetaOAuthSelection(params: {
  query: unknown;
  repository: MetaOAuthRepository;
  credentialSecret: string;
  now?: Date;
  pendingSelectionMaxAgeMs?: number;
}): Promise<
  | { status: 200; body: MetaOAuthPendingSelectionResponse }
  | { status: 400 | 404 | 410; body: { error: "invalid_request" | "invalid_state" | "selection_expired" } }
> {
  const parsed = MetaOAuthPendingSelectionQuerySchema.safeParse(params.query);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const pendingSelection = await params.repository.findPendingIntegrationSelection({
    oauthState: parsed.data.state,
  });
  if (pendingSelection === null) {
    return {
      status: 404,
      body: { error: "invalid_state" },
    };
  }

  const payload = MetaOAuthPendingSelectionPayloadSchema.parse(
    decryptCredential<unknown>(pendingSelection.encryptedCredentialRef, params.credentialSecret),
  );
  if (isPendingSelectionExpired({
    issuedAt: payload.issuedAt,
    now: params.now ?? new Date(),
    maxAgeMs: params.pendingSelectionMaxAgeMs ?? defaultPendingSelectionMaxAgeMs,
  })) {
    await params.repository.clearPendingIntegrationSelection({
      oauthState: parsed.data.state,
    });
    return {
      status: 410,
      body: { error: "selection_expired" },
    };
  }

  return {
    status: 200,
    body: MetaOAuthPendingSelectionResponseSchema.parse({
      state: parsed.data.state,
      accounts: payload.accounts.map((account) => ({
        pageId: account.pageId,
        pageName: account.pageName,
        instagramBusinessAccountId: account.instagramBusinessAccountId,
        instagramUsername: account.instagramUsername,
      })),
    }),
  };
}

export async function completeMetaOAuthSelection(params: {
  request: unknown;
  repository: MetaOAuthRepository;
  credentialSecret: string;
  onConnected?: MetaOAuthConnectedHandler;
  now?: Date;
  pendingSelectionMaxAgeMs?: number;
}): Promise<
  | { status: 200; body: { status: "connected" } }
  | { status: 400 | 404 | 410; body: { error: "invalid_request" | "invalid_state" | "selection_expired" | "account_not_found" } }
> {
  const parsed = CompleteMetaOAuthSelectionRequestSchema.safeParse(params.request);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "invalid_request" },
    };
  }

  const pendingSelection = await params.repository.findPendingIntegrationSelection({
    oauthState: parsed.data.state,
  });
  if (pendingSelection === null) {
    return {
      status: 404,
      body: { error: "invalid_state" },
    };
  }

  const payload = MetaOAuthPendingSelectionPayloadSchema.parse(
    decryptCredential<unknown>(pendingSelection.encryptedCredentialRef, params.credentialSecret),
  );
  if (isPendingSelectionExpired({
    issuedAt: payload.issuedAt,
    now: params.now ?? new Date(),
    maxAgeMs: params.pendingSelectionMaxAgeMs ?? defaultPendingSelectionMaxAgeMs,
  })) {
    await params.repository.clearPendingIntegrationSelection({
      oauthState: parsed.data.state,
    });
    return {
      status: 410,
      body: { error: "selection_expired" },
    };
  }

  const selectedAccount = payload.accounts.find((account) => {
    return account.instagramBusinessAccountId === parsed.data.instagramBusinessAccountId;
  });
  if (selectedAccount === undefined) {
    return {
      status: 400,
      body: { error: "account_not_found" },
    };
  }

  const connectedCredential = MetaConnectedCredentialSchema.parse({
    userAccessToken: payload.userAccessToken,
    pageAccessToken: selectedAccount.pageAccessToken,
    pageId: selectedAccount.pageId,
    instagramBusinessAccountId: selectedAccount.instagramBusinessAccountId,
  });
  const connected = await params.repository.connectIntegration({
    oauthState: parsed.data.state,
    providerAccountId: selectedAccount.instagramBusinessAccountId,
    providerAccountIds: [selectedAccount.instagramBusinessAccountId, selectedAccount.pageId],
    providerAccountName: selectedAccount.instagramUsername ?? selectedAccount.pageName,
    encryptedCredentialRef: encryptCredential(connectedCredential, params.credentialSecret),
  });

  if (connected === null) {
    return {
      status: 404,
      body: { error: "invalid_state" },
    };
  }

  if (params.onConnected !== undefined) {
    await params.onConnected({
      connectedIntegration: connected,
      connectedAccount: selectedAccount,
      connectedCredential,
    });
  }

  return {
    status: 200,
    body: { status: "connected" },
  };
}
