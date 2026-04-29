import type { z } from "zod";

export class ApiClientError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

export type ApiClientOptions = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export type RequestOptions<TResponseSchema extends z.ZodTypeAny> = {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  responseSchema: TResponseSchema;
};

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  return {
    async request<TResponseSchema extends z.ZodTypeAny>(
      requestOptions: RequestOptions<TResponseSchema>,
    ): Promise<z.infer<TResponseSchema>> {
      const requestInit: RequestInit = {
        method: requestOptions.method ?? "GET",
        headers: {
          "content-type": "application/json",
        },
      };

      if (requestOptions.body !== undefined) {
        requestInit.body = JSON.stringify(requestOptions.body);
      }

      const response = await fetchImpl(`${baseUrl}${requestOptions.path}`, requestInit);

      const responseBody: unknown = await response.json();

      if (!response.ok) {
        throw new ApiClientError(`API request failed: ${requestOptions.path}`, response.status);
      }

      return requestOptions.responseSchema.parse(responseBody) as z.infer<TResponseSchema>;
    },
  };
}
