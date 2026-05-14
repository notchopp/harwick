"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * Shared TanStack Query provider mounted in the root layout.
 *
 * Defaults bias toward "feels instant":
 *  - Stale immediately, refetch in background on window focus
 *  - Retry once on failure (no exponential backoff — agents shouldn't wait)
 *  - 30s gcTime so card mutations stay cached across micro-navigations
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Most workspace data is live but operators don't need it re-pulled
            // on every tab switch — that fires spinners and feels broken.
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
