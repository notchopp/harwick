import {
  FollowUpBossConflictQueueResponseSchema,
  type FollowUpBossConflictItem,
  type FollowUpBossConflictQueueResponse,
} from "@realty-ops/core";

export type FollowUpBossConflictRepository = {
  listPotentialConflicts(params: {
    workspaceId: string;
    limit: number;
  }): Promise<FollowUpBossConflictItem[]>;
};

export async function loadFollowUpBossConflictQueue(params: {
  workspaceId: string;
  repository: FollowUpBossConflictRepository;
  limit?: number;
}): Promise<FollowUpBossConflictQueueResponse> {
  return FollowUpBossConflictQueueResponseSchema.parse({
    workspaceId: params.workspaceId,
    items: await params.repository.listPotentialConflicts({
      workspaceId: params.workspaceId,
      limit: Math.min(params.limit ?? 50, 100),
    }),
  });
}
