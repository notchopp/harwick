import type { ProviderErrorLogRow } from "./database.types";
import type { RealtyOpsSupabaseClient } from "./server-client";

export type ProviderErrorLogInput = {
  workspaceId: string | null;
  provider: ProviderErrorLogRow["provider"];
  operation: string;
  errorCode: string;
  errorMessage?: string | null;
  retryable: boolean;
  metadata?: Record<string, unknown>;
};

export type ProviderErrorLogger = {
  recordProviderError(input: ProviderErrorLogInput): Promise<void>;
};

export function createSupabaseProviderErrorLogger(
  supabase: RealtyOpsSupabaseClient,
): ProviderErrorLogger {
  return {
    async recordProviderError(input) {
      const { error } = await supabase
        .from("provider_error_logs")
        .insert([{
          workspace_id: input.workspaceId,
          provider: input.provider,
          operation: input.operation,
          error_code: input.errorCode,
          error_message: input.errorMessage ?? null,
          retryable: input.retryable,
          metadata: input.metadata ?? {},
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }] as any);

      if (error !== null) {
        throw error;
      }
    },
  };
}
