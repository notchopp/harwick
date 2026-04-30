import {
  CrmSyncActionRequestSchema,
  OperationsFailureQueueResponseSchema,
  WorkflowJobActionRequestSchema,
  type CrmSyncActionRequest,
  type OperationsFailureItem,
  type OperationsFailureQueueResponse,
  type WorkflowJobActionRequest,
} from "@realty-ops/core";

export type FailureOperationsRepository = {
  listFailedWorkflowJobs(params: {
    workspaceId: string;
    limit: number;
  }): Promise<OperationsFailureItem[]>;
  listStuckWorkflowJobs(params: {
    workspaceId: string;
    staleBefore: string;
    limit: number;
  }): Promise<OperationsFailureItem[]>;
  listFailedCrmSyncs(params: {
    workspaceId: string;
    limit: number;
  }): Promise<OperationsFailureItem[]>;
  listProviderErrors(params: {
    workspaceId: string;
    limit: number;
  }): Promise<OperationsFailureItem[]>;
  retryWorkflowJob(params: {
    workspaceId: string;
    jobId: string;
  }): Promise<OperationsFailureItem | null>;
  dismissWorkflowJob(params: {
    workspaceId: string;
    jobId: string;
  }): Promise<OperationsFailureItem | null>;
  retryCrmSync(params: {
    workspaceId: string;
    syncLogId: string;
  }): Promise<OperationsFailureItem | null>;
};

export async function loadOperationsFailureQueue(params: {
  workspaceId: string;
  repository: FailureOperationsRepository;
  limit?: number;
}): Promise<OperationsFailureQueueResponse> {
  const limit = Math.min(params.limit ?? 50, 100);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [jobs, stuckJobs, crmSyncs, providerErrors] = await Promise.all([
    params.repository.listFailedWorkflowJobs({ workspaceId: params.workspaceId, limit }),
    params.repository.listStuckWorkflowJobs({ workspaceId: params.workspaceId, staleBefore, limit }),
    params.repository.listFailedCrmSyncs({ workspaceId: params.workspaceId, limit }),
    params.repository.listProviderErrors({ workspaceId: params.workspaceId, limit }),
  ]);

  return OperationsFailureQueueResponseSchema.parse({
    workspaceId: params.workspaceId,
    items: [...jobs, ...stuckJobs, ...crmSyncs, ...providerErrors]
      .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
      .slice(0, limit),
  });
}

export async function actOnWorkflowJobFailure(params: {
  workspaceId: string;
  jobId: string;
  request: unknown;
  repository: FailureOperationsRepository;
}): Promise<OperationsFailureItem | null> {
  const action: WorkflowJobActionRequest = WorkflowJobActionRequestSchema.parse(params.request);

  return action.action === "retry_now"
    ? params.repository.retryWorkflowJob({ workspaceId: params.workspaceId, jobId: params.jobId })
    : params.repository.dismissWorkflowJob({ workspaceId: params.workspaceId, jobId: params.jobId });
}

export async function actOnCrmSyncFailure(params: {
  workspaceId: string;
  syncLogId: string;
  request: unknown;
  repository: FailureOperationsRepository;
}): Promise<OperationsFailureItem | null> {
  const action: CrmSyncActionRequest = CrmSyncActionRequestSchema.parse(params.request);
  if (action.action === "retry_now") {
    return params.repository.retryCrmSync({
      workspaceId: params.workspaceId,
      syncLogId: params.syncLogId,
    });
  }

  return null;
}
