export type AssignmentRoutingCandidate = {
  memberId: string;
  role: "owner" | "admin" | "team_lead" | "lead_manager" | "agent";
  activeLeadCount: number;
  openTaskCount: number;
  urgentTaskCount: number;
  createdAt: string;
};

export type AssignmentRoutingDecision = {
  memberId: string | null;
  strategy: "source_owner" | "workload_balanced" | "none";
};

function rolePriority(role: AssignmentRoutingCandidate["role"]): number {
  switch (role) {
    case "agent":
      return 0;
    case "lead_manager":
    case "team_lead":
      return 1;
    case "admin":
      return 2;
    case "owner":
      return 3;
  }
}

export function chooseAssignmentCandidate(params: {
  sourceOwnerMemberId: string | null;
  candidates: AssignmentRoutingCandidate[];
}): AssignmentRoutingDecision {
  if (params.candidates.length === 0) {
    return {
      memberId: null,
      strategy: "none",
    };
  }

  if (params.sourceOwnerMemberId !== null) {
    const sourceOwner = params.candidates.find((candidate) => candidate.memberId === params.sourceOwnerMemberId);
    if (sourceOwner !== undefined) {
      return {
        memberId: sourceOwner.memberId,
        strategy: "source_owner",
      };
    }
  }

  const [selectedCandidate] = [...params.candidates].sort((left, right) => {
    return left.activeLeadCount - right.activeLeadCount
      || left.urgentTaskCount - right.urgentTaskCount
      || left.openTaskCount - right.openTaskCount
      || rolePriority(left.role) - rolePriority(right.role)
      || left.createdAt.localeCompare(right.createdAt)
      || left.memberId.localeCompare(right.memberId);
  });

  return {
    memberId: selectedCandidate?.memberId ?? null,
    strategy: selectedCandidate === undefined ? "none" : "workload_balanced",
  };
}
