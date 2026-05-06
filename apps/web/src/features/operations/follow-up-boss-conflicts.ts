import {
  FollowUpBossConflictActionRequestSchema,
  FollowUpBossConflictQueueResponseSchema,
  type FollowUpBossConflictActionRequest,
  type FollowUpBossConflictItem,
  type FollowUpBossConflictQueueResponse,
} from "@realty-ops/core";

export type FollowUpBossConflictRepository = {
  listPotentialConflicts(params: {
    workspaceId: string;
    limit: number;
  }): Promise<FollowUpBossConflictItem[]>;
  ignoreConflict(params: {
    workspaceId: string;
    backsyncEventId: string;
    reason: string | null;
  }): Promise<FollowUpBossConflictItem | null>;
  replayConflict(params: {
    workspaceId: string;
    backsyncEventId: string;
  }): Promise<FollowUpBossConflictItem | null>;
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

export async function actOnFollowUpBossConflict(params: {
  workspaceId: string;
  backsyncEventId: string;
  request: unknown;
  repository: FollowUpBossConflictRepository;
}): Promise<FollowUpBossConflictItem | null> {
  const action: FollowUpBossConflictActionRequest = FollowUpBossConflictActionRequestSchema.parse(params.request);

  return action.action === "ignore"
    ? params.repository.ignoreConflict({
      workspaceId: params.workspaceId,
      backsyncEventId: params.backsyncEventId,
      reason: action.reason ?? null,
    })
    : params.repository.replayConflict({
      workspaceId: params.workspaceId,
      backsyncEventId: params.backsyncEventId,
    });
}
