import { z } from "zod";

const GRAPH_API_BASE_URL = "https://graph.facebook.com/v20.0";

const MetaTokenResponseSchema = z.object({
  access_token: z.string().trim().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().optional(),
}).passthrough();

const MetaPageAccountSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  access_token: z.string().trim().min(1),
  instagram_business_account: z.object({
    id: z.string().trim().min(1),
    username: z.string().trim().min(1).optional(),
  }).optional(),
}).passthrough();

const MetaAccountsResponseSchema = z.object({
  data: z.array(MetaPageAccountSchema),
}).passthrough();

export type MetaConnectedAccount = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramBusinessAccountId: string;
  instagramUsername: string | null;
};

export type MetaOAuthClientOptions = {
  appId: string;
  appSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
};

function compareMetaConnectedAccounts(left: MetaConnectedAccount, right: MetaConnectedAccount): number {
  return (left.instagramUsername ?? left.pageName).localeCompare(right.instagramUsername ?? right.pageName)
    || left.pageName.localeCompare(right.pageName)
    || left.instagramBusinessAccountId.localeCompare(right.instagramBusinessAccountId);
}

export function createMetaOAuthClient(options: MetaOAuthClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request(url: URL): Promise<unknown> {
    const response = await fetchImpl(url);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Meta OAuth request failed (${response.status}): ${text}`);
    }

    return response.json();
  }

  return {
    async exchangeCodeForAccessToken(code: string): Promise<string> {
      const url = new URL(`${GRAPH_API_BASE_URL}/oauth/access_token`);
      url.searchParams.set("client_id", options.appId);
      url.searchParams.set("client_secret", options.appSecret);
      url.searchParams.set("redirect_uri", options.redirectUri);
      url.searchParams.set("code", code);

      return MetaTokenResponseSchema.parse(await request(url)).access_token;
    },

    async exchangeForLongLivedAccessToken(shortLivedAccessToken: string): Promise<string> {
      const url = new URL(`${GRAPH_API_BASE_URL}/oauth/access_token`);
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", options.appId);
      url.searchParams.set("client_secret", options.appSecret);
      url.searchParams.set("fb_exchange_token", shortLivedAccessToken);

      return MetaTokenResponseSchema.parse(await request(url)).access_token;
    },

    async listInstagramAccounts(userAccessToken: string): Promise<MetaConnectedAccount[]> {
      const url = new URL(`${GRAPH_API_BASE_URL}/me/accounts`);
      url.searchParams.set("access_token", userAccessToken);
      url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");

      const parsed = MetaAccountsResponseSchema.parse(await request(url));
      const accounts = parsed.data.flatMap((page) => {
        if (page.instagram_business_account === undefined) {
          return [];
        }

        return [{
          pageId: page.id,
          pageName: page.name,
          pageAccessToken: page.access_token,
          instagramBusinessAccountId: page.instagram_business_account.id,
          instagramUsername: page.instagram_business_account.username ?? null,
        }];
      });

      return [...new Map(
        accounts.map((account) => [account.instagramBusinessAccountId, account] as const),
      ).values()].sort(compareMetaConnectedAccounts);
    },
  };
}
