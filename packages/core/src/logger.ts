import { AppEnvironmentSchema, type AppEnvironment } from "./domains/environment.js";

export type LogLevel = "info" | "warn" | "error";

export type Logger = {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
};

type LoggerOptions = {
  service: string;
  environment?: unknown;
  write?: (level: LogLevel, line: string) => void;
};

const redactedKeys = [
  /token/i,
  /secret/i,
  /signature/i,
  /credential/i,
  /authorization/i,
  /password/i,
  /cookie/i,
  /transcript/i,
  /recording/i,
  /^payload$/i,
  /^body$/i,
  /phone/i,
  /email/i,
];

const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const phonePattern = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._-]+\b/gi;
const accessTokenPattern = /(access[_-]?token=)[^&\s]+/gi;
const encryptedCredentialPattern = /\benc:v1:[A-Za-z0-9_-]+\b/g;

function resolveEnvironment(input: unknown): AppEnvironment {
  const parsed = AppEnvironmentSchema.safeParse(input);
  return parsed.success ? parsed.data : "development";
}

function sanitizeString(value: string): string {
  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phonePattern, "[REDACTED_PHONE]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(accessTokenPattern, "$1[REDACTED]")
    .replace(encryptedCredentialPattern, "[REDACTED_CREDENTIAL]");
}

function shouldRedactKey(key: string): boolean {
  return redactedKeys.some((pattern) => pattern.test(key));
}

function serializeError(error: Error): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: sanitizeString(error.message),
  };

  const errorWithCode = error as Error & { code?: unknown; cause?: unknown };
  const errorCode = errorWithCode["code"];
  if (typeof errorCode === "string" && errorCode.length > 0) {
    serialized["code"] = sanitizeString(errorCode);
  }
  const errorCause = errorWithCode["cause"];
  if (errorCause instanceof Error) {
    serialized["cause"] = serializeError(errorCause);
  }

  return serialized;
}

function sanitizeValue(value: unknown, key?: string, depth = 0): unknown {
  if (key !== undefined && shouldRedactKey(key)) {
    return "[REDACTED]";
  }

  if (depth > 4) {
    return "[TRUNCATED]";
  }

  if (value instanceof Error) {
    return serializeError(value);
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (
    typeof value === "number"
    || typeof value === "boolean"
    || value === null
    || value === undefined
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeValue(entry, undefined, depth + 1));
  }

  if (typeof value === "object") {
    const sanitizedEntries = Object.entries(value).map(([entryKey, entryValue]) => {
      return [entryKey, sanitizeValue(entryValue, entryKey, depth + 1)] as const;
    });
    return Object.fromEntries(sanitizedEntries);
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "symbol") {
    return value.description === undefined ? "Symbol()" : `Symbol(${value.description})`;
  }

  if (typeof value === "function") {
    return value.name.length === 0 ? "[Function anonymous]" : `[Function ${value.name}]`;
  }

  return "[UNSERIALIZABLE]";
}

export function sanitizeLogContext(context: Record<string, unknown>): Record<string, unknown> {
  return sanitizeValue(context) as Record<string, unknown>;
}

export function createLogger(options: LoggerOptions): Logger {
  const environment = resolveEnvironment(options.environment);
  const write = options.write ?? ((level: LogLevel, line: string) => {
    switch (level) {
      case "error":
        console.error(line);
        return;
      case "warn":
        console.warn(line);
        return;
      case "info":
        console.info(line);
        return;
    }
  });

  function log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: options.service,
      environment,
      message: sanitizeString(message),
      ...(context === undefined ? {} : { context: sanitizeLogContext(context) }),
    };

    write(level, JSON.stringify(entry));
  }

  return {
    info(message, context) {
      log("info", message, context);
    },
    warn(message, context) {
      log("warn", message, context);
    },
    error(message, context) {
      log("error", message, context);
    },
  };
}
