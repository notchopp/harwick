import { z } from "zod";

/**
 * CrmConnector — the abstraction that makes Harwick CRM-agnostic.
 *
 * Today: FUB is the only implementation (FubConnector wraps the existing
 * lib/follow-up-boss code). Tomorrow: KvCoreConnector, BoomTownConnector,
 * SierraConnector, etc. — same interface, different downstream pipes.
 *
 * The judgment-tools layer doesn't know which CRM is on the other end.
 * Workspaces choose their connector(s) at onboarding. The same lead can
 * sync to multiple CRMs if a brokerage uses both (more common than you'd
 * think — FUB for routing + a brokerage-mandated kvCore for compliance).
 *
 * Strategic: multi-CRM = acquisition optionality. If we work on FUB + kvCore
 * + BoomTown, Zillow can't trap us, kvCore can't trap us, CoStar can bid.
 * Single-CRM dependence = take-it-or-leave-it acquisition by that CRM only.
 */
export const CrmProviderSchema = z.enum([
  "fub",
  "kvcore",
  "boomtown",
  "sierra",
  "wise_agent",
  "lion_desk",
  "real_geeks",
  "propertybase",
  "chime",
]);
export type CrmProvider = z.infer<typeof CrmProviderSchema>;

/** Attribution tier — controls how visible "via Harwick" is in CRM artifacts. */
export const AttributionStyleSchema = z.enum([
  "via_harwick",   // free + default: "— via Harwick"
  "co_brand",      // mid paid: "— via Harwick + [Workspace Brand]"
  "minimal",       // upper paid: small "—H" mark only
  "custom",        // enterprise: workspace provides own attribution_text
  "removed",       // enterprise white-label only: no attribution at all
]);
export type AttributionStyle = z.infer<typeof AttributionStyleSchema>;

export const AttributionConfigSchema = z.object({
  style: AttributionStyleSchema.default("via_harwick"),
  customText: z.string().max(120).nullable().default(null),
  workspaceLabel: z.string().max(80).nullable().default(null),
});
export type AttributionConfig = z.infer<typeof AttributionConfigSchema>;

/** Render an attribution string for a given config. Always non-empty unless enterprise-removed. */
export function renderAttribution(config: AttributionConfig): string {
  switch (config.style) {
    case "via_harwick":
      return "— via Harwick";
    case "co_brand": {
      const label = config.workspaceLabel?.trim();
      return label ? `— via Harwick + ${label}` : "— via Harwick";
    }
    case "minimal":
      return "—H";
    case "custom":
      return config.customText?.trim() ?? "— via Harwick";
    case "removed":
      return "";
  }
}

/**
 * Normalized contact create payload — what a buyer-chat capture becomes
 * before it lands in the CRM as a new person record. Connectors translate
 * to their provider-specific people-create shape (FUB /people, kvCore
 * /contacts, etc).
 */
export const CrmContactCreateSchema = z.object({
  firstName: z.string().trim().min(1).nullable(),
  lastName: z.string().trim().min(1).nullable(),
  email: z.string().trim().email().nullable(),
  phone: z.string().trim().min(7).nullable(),
  source: z.string().trim().min(1).max(120),
  tags: z.array(z.string().trim().min(1)).default([]),
  headline: z.string().trim().max(280).nullable().default(null),
});
export type CrmContactCreate = z.infer<typeof CrmContactCreateSchema>;

/**
 * Normalized contact note payload — what every Harwick brief becomes when
 * destination=crm_note. Each connector translates this to its CRM's native
 * note shape (FUB notes have a different JSON than kvCore notes).
 */
export const CrmContactNoteSchema = z.object({
  contactId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  /** Append attribution at the end of body when sending; connector handles formatting. */
  attribution: AttributionConfigSchema,
  /** ISO timestamp the note represents (e.g. when Harwick captured the signal). */
  occurredAt: z.string().datetime().nullable().default(null),
  /** Source tag for the CRM's filtering/dashboarding (e.g. "harwick" or "harwick:capture"). */
  sourceTag: z.string().max(80).default("harwick"),
});
export type CrmContactNote = z.infer<typeof CrmContactNoteSchema>;

/** Normalized task creation payload. */
export const CrmTaskSchema = z.object({
  contactId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().default(null),
  dueAt: z.string().datetime().nullable().default(null),
  priority: z.enum(["normal", "high", "urgent"]).default("normal"),
  assignedToProviderUserId: z.string().nullable().default(null),
  attribution: AttributionConfigSchema,
});
export type CrmTask = z.infer<typeof CrmTaskSchema>;

/** Normalized contact assignment update. */
export const CrmAssignmentSchema = z.object({
  contactId: z.string().min(1),
  assignedToProviderUserId: z.string().min(1),
  reason: z.string().max(400).nullable().default(null),
  attribution: AttributionConfigSchema,
});
export type CrmAssignment = z.infer<typeof CrmAssignmentSchema>;

/** Normalized contact fetch result — what we read back when refreshing state. */
export const CrmContactStateSchema = z.object({
  contactId: z.string(),
  stage: z.string().nullable(),
  assignedToProviderUserId: z.string().nullable(),
  assignedToDisplayName: z.string().nullable(),
  recentNotes: z.array(z.object({
    id: z.string(),
    body: z.string(),
    createdAt: z.string().datetime(),
    isHarwickAuthored: z.boolean().default(false),
  })).default([]),
  recentTasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    status: z.string(),
    dueAt: z.string().datetime().nullable(),
  })).default([]),
  fetchedAt: z.string().datetime(),
});
export type CrmContactState = z.infer<typeof CrmContactStateSchema>;

/** Normalized webhook event after the connector translates the provider's shape. */
export const CrmWebhookEventSchema = z.object({
  provider: CrmProviderSchema,
  workspaceId: z.string().uuid(),
  contactId: z.string(),
  eventType: z.enum([
    "stage_changed",
    "note_added",
    "task_completed",
    "task_skipped",
    "assigned_changed",
    "closed_won",
    "closed_lost",
    "marked_spam",
    "reassigned",
    "tagged",
    "other",
  ]),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
});
export type CrmWebhookEvent = z.infer<typeof CrmWebhookEventSchema>;

/**
 * The interface every CRM implementation satisfies. The connector layer is
 * the ONLY place external CRMs get touched — judgment tools never call
 * provider APIs directly.
 */
export interface CrmConnector {
  readonly provider: CrmProvider;

  /**
   * Create a new contact in the CRM and return the provider's contact ID.
   * Called by the buyer-chat capture flow so leads land warm in the realtor's
   * CRM at the moment of capture (not later via batch sync). Connectors that
   * find an existing duplicate by phone/email may return the existing ID
   * instead of creating a new one — idempotent semantics encouraged.
   */
  createContact(workspaceId: string, contact: CrmContactCreate): Promise<{ providerContactId: string }>;

  /** Push a Harwick-generated note onto a CRM contact. */
  pushContactNote(workspaceId: string, note: CrmContactNote): Promise<{ providerNoteId: string }>;

  /** Create a CRM task with Harwick-generated context. */
  pushTask(workspaceId: string, task: CrmTask): Promise<{ providerTaskId: string }>;

  /** Reassign a CRM contact to a different provider user. */
  assignContact(workspaceId: string, assignment: CrmAssignment): Promise<void>;

  /** Read CRM-side state for state_hash bumping + chat-context briefs. */
  fetchContact(workspaceId: string, contactId: string): Promise<CrmContactState>;

  /** Register this workspace's webhook so we get inbound events. */
  registerWebhook(params: {
    workspaceId: string;
    callbackUrl: string;
    secret: string;
  }): Promise<{ registrationId: string }>;

  /** Translate a raw provider webhook into our normalized event shape. */
  normalizeWebhookEvent(rawBody: unknown, headers: Record<string, string>): Promise<CrmWebhookEvent | null>;
}

/**
 * Registry of available connectors. Implementations register at module load.
 * Tools look up the connector for a given workspace via its configured provider.
 */
const connectors = new Map<CrmProvider, CrmConnector>();

export function registerCrmConnector(connector: CrmConnector): void {
  connectors.set(connector.provider, connector);
}

export function getCrmConnector(provider: CrmProvider): CrmConnector | null {
  return connectors.get(provider) ?? null;
}

export function listRegisteredCrmProviders(): CrmProvider[] {
  return Array.from(connectors.keys());
}
