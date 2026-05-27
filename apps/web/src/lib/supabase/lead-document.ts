import type { RealtyOpsSupabaseClient } from "./server-client";

export type LeadDocumentRepository = {
  read(params: { workspaceId: string; leadId: string }): Promise<string | null>;
  appendUpdate(params: {
    workspaceId: string;
    leadId: string;
    update: string;
    occurredAt?: string;
  }): Promise<string>;
};

const DOCUMENT_SEPARATOR = "\n\n---\n\n";
const MAX_DOCUMENT_LENGTH = 32_000;

function trimDocument(document: string): string {
  if (document.length <= MAX_DOCUMENT_LENGTH) {
    return document;
  }
  // Drop oldest segments first; keep the head note + most recent updates.
  const segments = document.split(DOCUMENT_SEPARATOR);
  while (segments.length > 1 && segments.join(DOCUMENT_SEPARATOR).length > MAX_DOCUMENT_LENGTH) {
    segments.splice(1, 1); // remove the second segment (oldest update after the head)
  }
  return segments.join(DOCUMENT_SEPARATOR);
}

export function buildNextLeadDocument(params: {
  existing: string | null;
  update: string;
  occurredAt: string;
}): string {
  const update = params.update.trim();
  if (update.length === 0) {
    return params.existing ?? "";
  }

  const stamped = `[${params.occurredAt}] ${update}`;
  return trimDocument(
    params.existing === null || params.existing.length === 0
      ? stamped
      : `${params.existing}${DOCUMENT_SEPARATOR}${stamped}`,
  );
}

export function createSupabaseLeadDocumentRepository(
  supabase: RealtyOpsSupabaseClient,
): LeadDocumentRepository {
  return {
    async read(params) {
      const { data, error } = await supabase
        .from("leads")
        .select("lead_document")
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId)
        .maybeSingle<{ lead_document: string | null }>();

      if (error !== null) {
        throw error;
      }
      const document = data?.lead_document ?? null;
      return document === null || document.length === 0 ? null : document;
    },

    async appendUpdate(params) {
      const update = params.update.trim();
      if (update.length === 0) {
        const existing = await this.read(params);
        return existing ?? "";
      }

      const occurredAt = params.occurredAt ?? new Date().toISOString();
      const existing = await this.read(params);
      const next = buildNextLeadDocument({
        existing,
        update,
        occurredAt,
      });

      const { error } = await supabase
        .from("leads")
        .update({
          lead_document: next,
          lead_document_updated_at: occurredAt,
          updated_at: occurredAt,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
        .eq("workspace_id", params.workspaceId)
        .eq("id", params.leadId);

      if (error !== null) {
        throw error;
      }

      return next;
    },
  };
}
