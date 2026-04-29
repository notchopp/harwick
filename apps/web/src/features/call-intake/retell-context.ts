import {
  RetellCallContextRequestSchema,
  RetellCallContextResponseSchema,
  type RetellCallContextResponse,
} from "@realty-ops/core";
import {
  buildRetellCallContextResponse,
  type VoiceAgentRepository,
} from "../../lib/supabase/voice-agents";

export type RetellContextResponse =
  | {
      status: 200;
      body: RetellCallContextResponse;
    }
  | {
      status: 400 | 404;
      body: {
        error: "malformed_payload" | "voice_agent_not_found";
      };
    };

function readAgentId(parsed: ReturnType<typeof RetellCallContextRequestSchema.parse>): string {
  return parsed.agent_id ?? parsed.call?.agent_id ?? "";
}

export async function handleRetellCallContext(params: {
  body: unknown;
  repository: Pick<VoiceAgentRepository, "getWorkspaceVoiceAgentByRetellAgentId">;
}): Promise<RetellContextResponse> {
  const parsed = RetellCallContextRequestSchema.safeParse(params.body);
  if (!parsed.success) {
    return {
      status: 400,
      body: { error: "malformed_payload" },
    };
  }

  const agentId = readAgentId(parsed.data);
  const call = parsed.data.call;
  const fromNumber = parsed.data.from_number ?? call?.from_number ?? null;
  const contextRow = await params.repository.getWorkspaceVoiceAgentByRetellAgentId({
    retellAgentId: agentId,
    fromNumber,
  });
  if (contextRow === null) {
    return {
      status: 404,
      body: { error: "voice_agent_not_found" },
    };
  }

  const response = buildRetellCallContextResponse(contextRow, {
    fromNumber,
    toNumber: parsed.data.to_number ?? call?.to_number ?? "",
  });

  return {
    status: 200,
    body: RetellCallContextResponseSchema.parse(response),
  };
}
