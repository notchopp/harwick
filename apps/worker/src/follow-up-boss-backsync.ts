import { type LeadWorkflowContext } from "./jobs.js";
import { z } from "zod";

const FollowUpBossScalarIdSchema = z.union([z.string(), z.number()]).transform((value) => String(value));

const FollowUpBossEmailSchema = z.object({
  value: z.string().trim().email().optional(),
  email: z.string().trim().email().optional(),
}).passthrough();

const FollowUpBossPhoneSchema = z.object({
  value: z.string().trim().min(7).max(32).optional(),
  number: z.string().trim().min(7).max(32).optional(),
}).passthrough();

const FollowUpBossPersonSchema = z.object({
  id: FollowUpBossScalarIdSchema,
  name: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().trim().min(1).optional(),
  stage: z.string().trim().min(1).optional(),
  assignedUserId: FollowUpBossScalarIdSchema.optional(),
  emails: z.array(FollowUpBossEmailSchema).optional(),
  phones: z.array(FollowUpBossPhoneSchema).optional(),
}).passthrough();

const FollowUpBossPeopleEnvelopeSchema = z.object({
  people: z.array(FollowUpBossPersonSchema),
}).passthrough();

const FollowUpBossNoteSchema = z.object({
  id: FollowUpBossScalarIdSchema,
  personId: FollowUpBossScalarIdSchema,
  body: z.string().trim().optional(),
  subject: z.string().trim().optional(),
  created: z.string().trim().optional(),
  updated: z.string().trim().optional(),
  userId: FollowUpBossScalarIdSchema.optional(),
}).passthrough();

const FollowUpBossTaskSchema = z.object({
  id: FollowUpBossScalarIdSchema,
  personId: FollowUpBossScalarIdSchema,
  message: z.string().trim().optional(),
  title: z.string().trim().optional(),
  created: z.string().trim().optional(),
  createdAt: z.string().trim().optional(),
  updated: z.string().trim().optional(),
  updatedAt: z.string().trim().optional(),
  assignedUserId: FollowUpBossScalarIdSchema.optional(),
}).passthrough();

const FollowUpBossTextMessageSchema = z.object({
  id: FollowUpBossScalarIdSchema,
  personId: FollowUpBossScalarIdSchema,
  body: z.string().trim().optional(),
  created: z.string().trim().optional(),
  createdAt: z.string().trim().optional(),
  updated: z.string().trim().optional(),
  updatedAt: z.string().trim().optional(),
  userId: FollowUpBossScalarIdSchema.optional(),
  direction: z.string().trim().optional(),
}).passthrough();

const FollowUpBossCallSchema = z.object({
  id: FollowUpBossScalarIdSchema,
  personId: FollowUpBossScalarIdSchema,
  body: z.string().trim().optional(),
  created: z.string().trim().optional(),
  createdAt: z.string().trim().optional(),
  updated: z.string().trim().optional(),
  updatedAt: z.string().trim().optional(),
  userId: FollowUpBossScalarIdSchema.optional(),
  direction: z.string().trim().optional(),
}).passthrough();

type FollowUpBossActivityEventType = "notesCreated" | "tasksCreated" | "textMessagesCreated" | "callsCreated";
type FollowUpBossBacksyncEventType =
  | "peopleUpdated"
  | "peopleStageUpdated"
  | "notesCreated"
  | "tasksCreated"
  | "textMessagesCreated"
  | "callsCreated";

export type FollowUpBossPerson = {
  personId: string;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  stage: string | null;
  assignedUserId: string | null;
};

export type FollowUpBossActivity = {
  activityId: string;
  personId: string;
  providerUserId: string | null;
  text: string | null;
  occurredAt: string | null;
};

function pickFirstEmail(emails: z.infer<typeof FollowUpBossEmailSchema>[] | undefined): string | null {
  for (const email of emails ?? []) {
    const value = email.value ?? email.email;
    if (value !== undefined) {
      return value.toLowerCase();
    }
  }

  return null;
}

function pickFirstPhone(phones: z.infer<typeof FollowUpBossPhoneSchema>[] | undefined): string | null {
  for (const phone of phones ?? []) {
    const value = phone.value ?? phone.number;
    if (value !== undefined) {
      return value;
    }
  }

  return null;
}

function normalizeOccurredAt(value: string | undefined, fallback: string): string {
  const parsed = z.string().datetime({ offset: true }).safeParse(value);
  return parsed.success ? parsed.data : fallback;
}

function parseCollection(payload: unknown, collectionKey: string): unknown[] | null {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const collection = record[collectionKey];
    if (Array.isArray(collection)) {
      return collection as unknown[];
    }
  }

  return null;
}

export function mapFollowUpBossStageToLeadStatus(
  stage: string | null,
): LeadWorkflowContext["currentStatus"] | null {
  if (stage === null) {
    return null;
  }

  const normalized = stage.trim().toLowerCase();
  if (normalized.includes("closed won")) {
    return "closed_won";
  }
  if (normalized.includes("closed lost") || normalized.includes("dead")) {
    return "closed_lost";
  }
  if (normalized.includes("hot")) {
    return "hot";
  }
  if (normalized.includes("qual")) {
    return "qualified";
  }
  if (normalized.includes("active client") || normalized.includes("client")) {
    return "active_client";
  }
  if (normalized.includes("appointment")) {
    return "appointment_booked";
  }
  if (normalized.includes("nurture") || normalized.includes("warm")) {
    return "nurture";
  }

  return null;
}

export function shouldRequalifyFromFollowUpBossBacksyncEvent(
  eventType: FollowUpBossBacksyncEventType,
): boolean {
  return eventType === "textMessagesCreated" || eventType === "callsCreated";
}

export function normalizeFollowUpBossPeopleResource(payload: unknown): FollowUpBossPerson[] {
  const enveloped = FollowUpBossPeopleEnvelopeSchema.safeParse(payload);
  const people = enveloped.success
    ? enveloped.data.people
    : Array.isArray(payload)
      ? z.array(FollowUpBossPersonSchema).parse(payload)
      : [FollowUpBossPersonSchema.parse(payload)];

  return people.map((person) => ({
    personId: person.id,
    fullName: person.name ?? ([person.firstName, person.lastName].filter(Boolean).join(" ").trim() || null),
    email: pickFirstEmail(person.emails),
    phone: pickFirstPhone(person.phones),
    stage: person.stage ?? null,
    assignedUserId: person.assignedUserId ?? null,
  }));
}

export function normalizeFollowUpBossActivityResource(params: {
  eventType: FollowUpBossActivityEventType;
  payload: unknown;
  fallbackOccurredAt: string;
}): FollowUpBossActivity[] {
  const collectionKey = params.eventType === "notesCreated"
    ? "notes"
    : params.eventType === "tasksCreated"
      ? "tasks"
      : params.eventType === "textMessagesCreated"
        ? "textMessages"
        : "calls";
  const collection = parseCollection(params.payload, collectionKey);

  if (params.eventType === "notesCreated") {
    const notes = collection === null
      ? [FollowUpBossNoteSchema.parse(params.payload)]
      : z.array(FollowUpBossNoteSchema).parse(collection);
    return notes.map((note) => ({
      activityId: note.id,
      personId: note.personId,
      providerUserId: note.userId ?? null,
      text: note.body ?? note.subject ?? null,
      occurredAt: normalizeOccurredAt(note.created ?? note.updated, params.fallbackOccurredAt),
    }));
  }

  if (params.eventType === "tasksCreated") {
    const tasks = collection === null
      ? [FollowUpBossTaskSchema.parse(params.payload)]
      : z.array(FollowUpBossTaskSchema).parse(collection);
    return tasks.map((task) => ({
      activityId: task.id,
      personId: task.personId,
      providerUserId: task.assignedUserId ?? null,
      text: task.message ?? task.title ?? null,
      occurredAt: normalizeOccurredAt(task.createdAt ?? task.created ?? task.updatedAt ?? task.updated, params.fallbackOccurredAt),
    }));
  }

  if (params.eventType === "textMessagesCreated") {
    const messages = collection === null
      ? [FollowUpBossTextMessageSchema.parse(params.payload)]
      : z.array(FollowUpBossTextMessageSchema).parse(collection);
    return messages.map((message) => ({
      activityId: message.id,
      personId: message.personId,
      providerUserId: message.userId ?? null,
      text: message.body ?? null,
      occurredAt: normalizeOccurredAt(message.createdAt ?? message.created ?? message.updatedAt ?? message.updated, params.fallbackOccurredAt),
    }));
  }

  const calls = collection === null
    ? [FollowUpBossCallSchema.parse(params.payload)]
    : z.array(FollowUpBossCallSchema).parse(collection);
  return calls.map((call) => ({
    activityId: call.id,
    personId: call.personId,
    providerUserId: call.userId ?? null,
    text: call.body ?? null,
    occurredAt: normalizeOccurredAt(call.createdAt ?? call.created ?? call.updatedAt ?? call.updated, params.fallbackOccurredAt),
  }));
}
