/**
 * Phone normalization for canonical lead identity. The funnel vision treats
 * phone as the primary key across channels: a buyer who chats on web with
 * phone X, then later texts via SMS or DMs and shares phone X, should
 * resolve to the SAME lead record — not three separate leads keyed by
 * channel-specific identifiers.
 *
 * Strategy: strip everything except digits, drop a leading "1" for US
 * 11-digit numbers, return null for anything that can't plausibly be a
 * phone (under 7 digits, or all the same digit, or known placeholder
 * patterns like 555 / 0000000).
 *
 * Symmetric: every callsite that writes a lead phone goes through
 * normalizePhone before insert/update; every callsite that looks one up
 * goes through normalizePhone too. The result is that the same human's
 * phone always collapses to the same canonical string regardless of how
 * it was typed in.
 */
export function normalizePhone(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const digits = String(input).replace(/\D/g, "");
  if (digits.length < 7) return null;
  // Reject obvious placeholder digits.
  if (/^(\d)\1+$/.test(digits)) return null;
  // 555 area code / exchange is reserved for fiction in NANP.
  if (/^1?555/.test(digits)) return null;
  if (/^1?\d{3}555/.test(digits)) return null;
  // US 11-digit with leading 1 → drop the 1 (matches the 10-digit form
  // operators usually type into FUB / Sierra / etc).
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

/**
 * Convenience: returns true when two phone strings normalize to the same
 * canonical form. Useful in upsert paths where we want to know "is this
 * already the lead's phone?" without re-querying.
 */
export function isSamePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (na === null || nb === null) return false;
  return na === nb;
}
