import { z } from "zod";

/**
 * Instagram Login OAuth client — the modern path Meta is steering apps to.
 *
 * Different from Facebook Login for Business:
 *   - Auth host is www.instagram.com (not facebook.com)
 *   - Token exchange goes to api.instagram.com/oauth/access_token (form-encoded)
 *   - Returns an Instagram User access token directly (no Page token to swap)
 *   - Long-lived token swap uses graph.instagram.com (not graph.facebook.com)
 *   - Scope namespace is instagram_business_* (not instagram_*)
 *
 * Use this for brokerages whose Instagram Business Account isn't linked to a
 * Facebook Page they want to connect (or who don't want to grant Page
 * permissions). They get IG DMs + IG comments only — no Messenger, no FB
 * Page comments.
 */

const INSTAGRAM_AUTH_URL = "https://www.instagram.com/oauth/authorize";
const INSTAGRAM_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const INSTAGRAM_GRAPH_BASE = "https://graph.instagram.com";

// Scopes bundled by the App Review use case "Manage messaging and content on
// Instagram" via Instagram Login.
export const INSTAGRAM_LOGIN_SCOPES: ReadonlyArray<string> = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
];

const InstagramShortTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  user_id: z.union([z.string().trim().min(1), z.number().int()]),
  permissions: z.string().optional(),
}).passthrough();

const InstagramLongTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
}).passthrough();

const InstagramBusinessAccountSchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).optional(),
  account_type: z.string().trim().min(1).optional(),
  profile_picture_url: z.string().trim().url().optional(),
}).passthrough();

export type InstagramConnectedAccount = {
  instagramBusinessAccountId: string;
  instagramUsername: string | null;
  instagramDisplayName: string | null;
  profilePhotoUrl: string | null;
};

export type InstagramOAuthClientOptions = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
};

export function buildInstagramOAuthUrl(params: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL(INSTAGRAM_AUTH_URL);
  url.searchParams.set("client_id", params.appId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_LOGIN_SCOPES.join(","));
  return url.toString();
}

export function createInstagramOAuthClient(options: InstagramOAuthClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    // Step 1: short-lived token exchange. Instagram returns the user id and
    // a short-lived access token in one shot via the token endpoint.
    async exchangeCodeForShortLivedToken(code: string): Promise<{
      accessToken: string;
      instagramBusinessAccountId: string;
    }> {
      const body = new URLSearchParams();
      body.set("client_id", options.appId);
      body.set("client_secret", options.appSecret);
      body.set("grant_type", "authorization_code");
      body.set("redirect_uri", options.redirectUri);
      body.set("code", code);

      const response = await fetchImpl(INSTAGRAM_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Instagram token exchange failed (${response.status}): ${text}`);
      }
      const parsed = InstagramShortTokenResponseSchema.parse(await response.json());
      return {
        accessToken: parsed.access_token,
        instagramBusinessAccountId: String(parsed.user_id),
      };
    },

    // Step 2: swap the short-lived token (1 hour) for a long-lived token (60 days).
    async exchangeForLongLivedToken(shortLivedAccessToken: string): Promise<string> {
      const url = new URL(`${INSTAGRAM_GRAPH_BASE}/access_token`);
      url.searchParams.set("grant_type", "ig_exchange_token");
      url.searchParams.set("client_secret", options.appSecret);
      url.searchParams.set("access_token", shortLivedAccessToken);

      const response = await fetchImpl(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Instagram long-lived token swap failed (${response.status}): ${text}`);
      }
      return InstagramLongTokenResponseSchema.parse(await response.json()).access_token;
    },

    // Step 3: read the IG Business Account's profile so the integration
    // record has a human-readable name + handle.
    async fetchAccount(accessToken: string): Promise<InstagramConnectedAccount> {
      const url = new URL(`${INSTAGRAM_GRAPH_BASE}/me`);
      url.searchParams.set("access_token", accessToken);
      url.searchParams.set("fields", "id,username,name,account_type,profile_picture_url");

      const response = await fetchImpl(url);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Instagram account fetch failed (${response.status}): ${text}`);
      }
      const parsed = InstagramBusinessAccountSchema.parse(await response.json());
      return {
        instagramBusinessAccountId: parsed.id,
        instagramUsername: parsed.username ?? null,
        instagramDisplayName: parsed.name ?? null,
        profilePhotoUrl: parsed.profile_picture_url ?? null,
      };
    },
  };
}

export type InstagramOAuthClient = ReturnType<typeof createInstagramOAuthClient>;
