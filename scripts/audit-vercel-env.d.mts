export const PRODUCTION_REQUIRED_ENVIRONMENT_NAMES: string[];

export const PRODUCTION_REQUIRED_ALTERNATIVES: Array<{
  label: string;
  names: string[];
}>;

export function parseVercelEnvListOutput(output: string): Set<string>;

export function auditConfiguredEnvironmentNames(
  configuredNames: Iterable<string>,
  options?: {
    requiredNames?: string[];
    requiredAlternatives?: Array<{
      label: string;
      names: string[];
    }>;
  },
): {
  ok: boolean;
  missing: string[];
  missingAlternatives: string[];
};

export function formatEnvironmentAuditFailure(report: {
  missing: string[];
  missingAlternatives: string[];
}): string;
