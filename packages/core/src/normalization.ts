export function normalizeInstagramUsername(input: string | null | undefined): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const normalized = input.trim().replace(/^@+/, "").toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeFreeformText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const normalized = input.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeUsPhoneNumber(input: string | null | undefined): string | null {
  if (input === null || input === undefined) {
    return null;
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (input.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

export type BudgetRange = {
  min: number | null;
  max: number | null;
};

function parseBudgetAmount(input: string): number | null {
  const normalized = input.trim().toLowerCase();
  const digits = normalized.replace(/\D/g, "");
  const hasBudgetCue = /[$km,]/.test(normalized) || digits.length >= 5;

  if (!hasBudgetCue) {
    return null;
  }

  const multiplier = normalized.endsWith("m")
    ? 1_000_000
    : normalized.endsWith("k")
      ? 1_000
      : 1;
  const numericPortion = normalized.replace(/[^0-9.]/g, "");
  if (numericPortion.length === 0) {
    return null;
  }

  const parsed = Number.parseFloat(numericPortion);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * multiplier);
}

export function parseBudgetRangeText(input: string | null | undefined): BudgetRange {
  const normalized = normalizeFreeformText(input)?.toLowerCase() ?? null;
  if (normalized === null) {
    return {
      min: null,
      max: null,
    };
  }

  const rangeMatch = normalized.match(
    /(\$?\d[\d,]*(?:\.\d+)?\s*[km]?)\s*(?:-|to)\s*(\$?\d[\d,]*(?:\.\d+)?\s*[km]?)/,
  );
  if (rangeMatch !== null) {
    const [, firstToken, secondToken] = rangeMatch;
    const firstValue = firstToken === undefined ? null : parseBudgetAmount(firstToken);
    const secondValue = secondToken === undefined ? null : parseBudgetAmount(secondToken);

    if (firstValue !== null && secondValue !== null) {
      return {
        min: Math.min(firstValue, secondValue),
        max: Math.max(firstValue, secondValue),
      };
    }
  }

  const upperBoundMatch = normalized.match(
    /(?:up to|under|max(?:imum)?|no more than|less than)\s+(\$?\d[\d,]*(?:\.\d+)?\s*[km]?)/,
  );
  if (upperBoundMatch !== null) {
    const [, upperToken] = upperBoundMatch;
    const upperValue = upperToken === undefined ? null : parseBudgetAmount(upperToken);
    return {
      min: null,
      max: upperValue,
    };
  }

  const lowerBoundMatch = normalized.match(
    /(?:at least|minimum|min|from|starting at|over|more than)\s+(\$?\d[\d,]*(?:\.\d+)?\s*[km]?)/,
  );
  if (lowerBoundMatch !== null) {
    const [, lowerToken] = lowerBoundMatch;
    const lowerValue = lowerToken === undefined ? null : parseBudgetAmount(lowerToken);
    return {
      min: lowerValue,
      max: null,
    };
  }

  const values = (normalized.match(/\$?\d[\d,]*(?:\.\d+)?\s*[km]?/g) ?? [])
    .map((value) => parseBudgetAmount(value))
    .filter((value): value is number => value !== null);

  if (values.length >= 2) {
    const firstValue = values[0];
    const secondValue = values[1];
    if (firstValue === undefined || secondValue === undefined) {
      return {
        min: null,
        max: null,
      };
    }

    return {
      min: Math.min(firstValue, secondValue),
      max: Math.max(firstValue, secondValue),
    };
  }

  if (values.length === 1) {
    const exactValue = values[0];
    if (exactValue === undefined) {
      return {
        min: null,
        max: null,
      };
    }

    return {
      min: exactValue,
      max: exactValue,
    };
  }

  return {
    min: null,
    max: null,
  };
}
