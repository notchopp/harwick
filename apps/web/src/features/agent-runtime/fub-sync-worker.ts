import { captureCriticalException } from "../../lib/observability/sentry";
import type { RealtyOpsSupabaseClient } from "../../lib/supabase/server-client";
import {
  pushLeadToFollowUpBoss,
  type FollowUpBossPushSource,
} from "../crm/follow-up-boss-push";

/**
 * Cron worker that drains pending fub_sync workflow jobs.
 *
 * Each job represents an agent-decided sync — the Harwick AI runtime decided
 * during a conversation turn that a lead is ready to land in FUB. The worker:
 *
 *  1. Claims a bounded batch of queued jobs (status='queued', run_after<=now)
 *  2. Hydrates the lead from `leads` table
 *  3. Pulls the most recent listing fact attached to a lead_event (for property context)
 *  4. Calls pushLeadToFollowUpBoss (reuses the same helper as synchronous flows)
 *  5. On success: marks job completed
 *  6. On failure: increments attempt_count; reschedules with exponential backoff,
 *     or marks failed when attempts exhausted
 *
 * Idempotency: enqueue uses `fub_sync:{leadId}` as the idempotency key so a lead
 * never has two queued sync jobs at once. We additionally short-circuit if the
 * lead already has a follow_up_boss_contact_id — FUB will dedupe on phone/email
 * but we save an API call and avoid duplicate event noise.
 */

const MAX_BATCH_SIZE = 50;
const SOFT_DEADLINE_MS = 45_000;
const BACKOFF_BASE_SECONDS = 60;
const BACKOFF_MAX_SECONDS = 60 * 60 * 6;

type FubSyncJobRow = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  attempt_count: number;
  max_attempts: number;
  payload: unknown;
};

type LeadHydratedRow = {
  id: string;
  workspace_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  intent: "high" | "medium" | "low" | "spam" | "unknown";
  follow_up_boss_contact_id: string | null;
};

export type FubSyncWorkerReport = {
  scanned: number;
  succeeded: number;
  skipped_no_credential: number;
  skipped_already_synced: number;
  skipped_no_lead: number;
  skipped_missing_contact: number;
  retried: number;
  failed: number;
  errors: Array<{ jobId: string; reason: string; detail?: string }>;
  durationMs: number;
};

function backoffSecondsFor(attempt: number): number {
  const exp = Math.min(BACKOFF_MAX_SECONDS, BACKOFF_BASE_SECONDS * Math.pow(2, Math.max(0, attempt - 1)));
  return exp;
}

export async function processFubSyncBatch(params: {
  supabase: RealtyOpsSupabaseClient;
  credentialSecret: string;
  now?: () => Date;
  fetchImpl?: typeof fetch;
}): Promise<FubSyncWorkerReport> {
  const startedAt = Date.now();
  const now = (params.now?.() ?? new Date());
  const report: FubSyncWorkerReport = {
    scanned: 0,
    succeeded: 0,
    skipped_no_credential: 0,
    skipped_already_synced: 0,
    skipped_no_lead: 0,
    skipped_missing_contact: 0,
    retried: 0,
    failed: 0,
    errors: [],
    durationMs: 0,
  };

  const { data: jobs, error: claimError } = await params.supabase
    .from("workflow_jobs")
    .select("id, workspace_id, lead_id, attempt_count, max_attempts, payload")
    .eq("job_type", "fub_sync")
    .eq("status", "queued")
    .lte("run_after", now.toISOString())
    .order("created_at", { ascending: true })
    .limit(MAX_BATCH_SIZE)
    .returns<FubSyncJobRow[]>();

  if (claimError !== null) {
    report.errors.push({ jobId: "batch", reason: "claim_failed", detail: claimError.message });
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  if (jobs === null || jobs.length === 0) {
    report.durationMs = Date.now() - startedAt;
    return report;
  }

  report.scanned = jobs.length;

  for (const job of jobs) {
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) break;

    try {
      await processSingleFubSyncJob({
        supabase: params.supabase,
        credentialSecret: params.credentialSecret,
        job,
        report,
        ...(params.fetchImpl === undefined ? {} : { fetchImpl: params.fetchImpl }),
      });
    } catch (error) {
      captureCriticalException(error, {
        surface: "fub-sync-worker",
        workspaceId: job.workspace_id,
        leadId: job.lead_id,
        jobId: job.id,
        extra: { attemptCount: job.attempt_count, maxAttempts: job.max_attempts },
      });
      report.errors.push({
        jobId: job.id,
        reason: "worker_exception",
        detail: error instanceof Error ? error.message : "unknown",
      });
      // Defensive: mark the job failed but recoverable — bump attempt + schedule retry
      await scheduleRetry({
        supabase: params.supabase,
        job,
        errorCode: "worker_exception",
        errorMessage: error instanceof Error ? error.message : "unknown",
        now,
      });
    }
  }

  report.durationMs = Date.now() - startedAt;
  return report;
}

async function processSingleFubSyncJob(params: {
  supabase: RealtyOpsSupabaseClient;
  credentialSecret: string;
  job: FubSyncJobRow;
  report: FubSyncWorkerReport;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const { job, report } = params;

  if (job.lead_id === null) {
    report.skipped_no_lead += 1;
    await markJobCompleted({
      supabase: params.supabase,
      jobId: job.id,
      errorCode: "missing_lead_id",
      errorMessage: "fub_sync job had no lead_id reference",
    });
    return;
  }

  const lead = await loadLead({
    supabase: params.supabase,
    workspaceId: job.workspace_id,
    leadId: job.lead_id,
  });

  if (lead === null) {
    report.skipped_no_lead += 1;
    await markJobCompleted({
      supabase: params.supabase,
      jobId: job.id,
      errorCode: "lead_not_found",
      errorMessage: "fub_sync job referenced a missing lead",
    });
    return;
  }

  if (lead.follow_up_boss_contact_id !== null && lead.follow_up_boss_contact_id.length > 0) {
    report.skipped_already_synced += 1;
    await markJobCompleted({
      supabase: params.supabase,
      jobId: job.id,
      errorCode: "already_synced",
      errorMessage: `lead already has FUB contact ${lead.follow_up_boss_contact_id}`,
    });
    return;
  }

  if (lead.phone === null && lead.email === null) {
    report.skipped_missing_contact += 1;
    await markJobCompleted({
      supabase: params.supabase,
      jobId: job.id,
      errorCode: "missing_contact",
      errorMessage: "lead has neither phone nor email; FUB requires at least one",
    });
    return;
  }

  const listing = await loadMostRecentListingForLead({
    supabase: params.supabase,
    workspaceId: job.workspace_id,
    leadId: job.lead_id,
  });

  const source: FollowUpBossPushSource = deriveSource(job.payload);

  const result = await pushLeadToFollowUpBoss({
    supabase: params.supabase,
    credentialSecret: params.credentialSecret,
    workspaceId: job.workspace_id,
    leadId: job.lead_id,
    lead: {
      fullName: lead.full_name ?? "Unknown contact",
      email: lead.email,
      phone: lead.phone,
      intent: mapIntent(lead.intent),
      message: null,
    },
    listing: listing,
    source,
    ...(params.fetchImpl === undefined ? {} : { fetchImpl: params.fetchImpl }),
  });

  if (result.pushed) {
    report.succeeded += 1;
    await markJobCompleted({
      supabase: params.supabase,
      jobId: job.id,
      ...(result.fubPersonId === null
        ? {}
        : { errorCode: null, errorMessage: `fub_person_id=${result.fubPersonId}` }),
    });
    return;
  }

  if (result.reason === "no_credential") {
    report.skipped_no_credential += 1;
    await markJobCompleted({
      supabase: params.supabase,
      jobId: job.id,
      errorCode: "no_credential",
      errorMessage: "workspace has no connected FUB integration",
    });
    return;
  }

  // request_failed / decrypt_failed → retry with backoff
  report.errors.push({
    jobId: job.id,
    reason: result.reason,
    ...(result.error === undefined ? {} : { detail: result.error }),
  });
  await scheduleRetry({
    supabase: params.supabase,
    job,
    errorCode: result.reason,
    errorMessage: result.error ?? "unknown error",
    now: new Date(),
  });
  if (job.attempt_count + 1 >= job.max_attempts) {
    report.failed += 1;
  } else {
    report.retried += 1;
  }
}

function deriveSource(payload: unknown): FollowUpBossPushSource {
  if (typeof payload !== "object" || payload === null) return "operator_manual";
  const record = payload as Record<string, unknown>;
  const source = record["source"];
  if (typeof source === "string") {
    if (source === "listings_site" || source === "voice" || source === "public_chat" || source === "operator_manual") {
      return source;
    }
  }
  return "operator_manual";
}

function mapIntent(intent: LeadHydratedRow["intent"]): "general" | "question" | "showing" | "open_house" {
  // FUB event types are coarser than our lead intent. Most agent-decided syncs are
  // post-qualification, so they should look like "Property Inquiry" — map to "question"
  // which deriveType in pushLeadToFollowUpBoss maps to "Property Inquiry" when listing exists.
  if (intent === "high" || intent === "medium") return "question";
  return "general";
}

async function loadLead(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  leadId: string;
}): Promise<LeadHydratedRow | null> {
  const { data, error } = await params.supabase
    .from("leads")
    .select("id, workspace_id, full_name, email, phone, intent, follow_up_boss_contact_id")
    .eq("workspace_id", params.workspaceId)
    .eq("id", params.leadId)
    .maybeSingle<LeadHydratedRow>();

  if (error !== null) return null;
  return data;
}

async function loadMostRecentListingForLead(params: {
  supabase: RealtyOpsSupabaseClient;
  workspaceId: string;
  leadId: string;
}): Promise<{
  address: string;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  price: number | null;
} | null> {
  const { data: events, error: eventsError } = await params.supabase
    .from("lead_events")
    .select("listing_id")
    .eq("workspace_id", params.workspaceId)
    .eq("lead_id", params.leadId)
    .not("listing_id", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .returns<Array<{ listing_id: string | null }>>();

  if (eventsError !== null) return null;
  const listingId = events?.[0]?.listing_id;
  if (listingId === undefined || listingId === null) return null;

  const { data: listing, error: listingError } = await params.supabase
    .from("listing_facts")
    .select("address, price, raw_facts")
    .eq("workspace_id", params.workspaceId)
    .eq("id", listingId)
    .maybeSingle<{ address: string; price: number | null; raw_facts: Record<string, unknown> | null }>();

  if (listingError !== null || listing === null) return null;

  const raw = listing.raw_facts ?? {};
  const readString = (key: string): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
  };

  return {
    address: listing.address,
    city: readString("city"),
    state: readString("state"),
    postalCode: readString("postalCode") ?? readString("postal_code") ?? readString("zip"),
    price: listing.price,
  };
}

async function markJobCompleted(params: {
  supabase: RealtyOpsSupabaseClient;
  jobId: string;
  errorCode?: string | null;
  errorMessage?: string;
}): Promise<void> {
  const update: {
    status: "completed";
    updated_at: string;
    last_error_code?: string | null;
    last_error_message?: string;
  } = {
    status: "completed",
    updated_at: new Date().toISOString(),
  };
  if (params.errorCode !== undefined) {
    update.last_error_code = params.errorCode;
  }
  if (params.errorMessage !== undefined) {
    update.last_error_message = params.errorMessage;
  }
  await params.supabase
    .from("workflow_jobs")
    .update(update)
    .eq("id", params.jobId);
}

async function scheduleRetry(params: {
  supabase: RealtyOpsSupabaseClient;
  job: FubSyncJobRow;
  errorCode: string;
  errorMessage: string;
  now: Date;
}): Promise<void> {
  const nextAttempt = params.job.attempt_count + 1;
  const exhausted = nextAttempt >= params.job.max_attempts;
  const runAfter = new Date(params.now.getTime() + backoffSecondsFor(nextAttempt) * 1000);

  await params.supabase
    .from("workflow_jobs")
    .update({
      status: exhausted ? "failed" : "queued",
      attempt_count: nextAttempt,
      run_after: runAfter.toISOString(),
      last_error_code: params.errorCode,
      last_error_message: params.errorMessage,
      updated_at: params.now.toISOString(),
    })
    .eq("id", params.job.id);
}
