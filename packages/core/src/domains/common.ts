import { z } from "zod";

export const UuidSchema = z.string().uuid();

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const NonEmptyStringSchema = z.string().trim().min(1);

export const ProviderIdSchema = z.string().trim().min(1).max(256);

export const PhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone numbers must be normalized to E.164.");

export const EmailSchema = z.string().trim().email().toLowerCase();

export type Uuid = z.infer<typeof UuidSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

