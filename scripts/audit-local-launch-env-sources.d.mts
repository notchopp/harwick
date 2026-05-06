export const DEFAULT_SOURCE_ENV_FILES: string[];

export const LOCAL_ENV_ALIASES: Record<string, string[]>;

export type LocalEnvSourceMatch = {
  name: string;
  sources: string[];
};

export type LocalEnvSourceAuditItem = {
  name: string;
  status: "exact" | "alias" | "missing";
  exact: LocalEnvSourceMatch[];
  alias: LocalEnvSourceMatch[];
};

export type LocalEnvSourceAlternativeAuditItem = {
  label: string;
  status: "exact" | "alias" | "missing";
  exact: LocalEnvSourceMatch[];
  alias: LocalEnvSourceMatch[];
};

export type LocalEnvSourceAuditReport = {
  ok: boolean;
  required: LocalEnvSourceAuditItem[];
  alternatives: LocalEnvSourceAlternativeAuditItem[];
};

export function parseEnvFileNames(contents: string): Set<string>;

export function collectLocalEnvSourceNames(files: string[]): Map<string, string[]>;

export function auditLocalLaunchEnvSources(options?: {
  files?: string[];
  requiredNames?: string[];
  requiredAlternatives?: Array<{
    label: string;
    names: string[];
  }>;
  aliases?: Record<string, string[]>;
  sourcesByName?: Map<string, string[]>;
}): LocalEnvSourceAuditReport;

export function formatLocalLaunchEnvSourceAudit(report: LocalEnvSourceAuditReport): string;
