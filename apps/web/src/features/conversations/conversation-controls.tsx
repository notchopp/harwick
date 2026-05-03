import { Button } from "@/components/ui/button";
import { Pause, Play, UserPlus, LogOut } from "lucide-react";
import type { ConversationAutomationMode } from "@realty-ops/core";

type ConversationControlsProps = {
  automationMode: ConversationAutomationMode | null;
  isAssigned: boolean;
  operatorId: string | null;
  currentOperatorId: string;
  onClaim: () => void;
  onPauseAI: () => void;
  onResumeAI: () => void;
  onRelease: () => void;
  isLoading?: boolean;
};

export function ConversationControls({
  automationMode,
  isAssigned,
  operatorId,
  currentOperatorId,
  onClaim,
  onPauseAI,
  onResumeAI,
  onRelease,
  isLoading = false,
}: ConversationControlsProps) {
  const isOwnedByCurrentOp = operatorId === currentOperatorId;
  const aiActive = automationMode === "ai_on";

  return (
    <div className="flex flex-wrap gap-2 border-t border-border px-3 py-2">
      {!isAssigned ? (
        <Button
          size="sm"
          variant="default"
          onClick={onClaim}
          disabled={isLoading}
          className="gap-2"
        >
          <UserPlus size={14} />
          Claim
        </Button>
      ) : isOwnedByCurrentOp ? (
        <>
          {aiActive ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={onPauseAI}
              disabled={isLoading}
              className="gap-2"
            >
              <Pause size={14} />
              Pause AI
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              onClick={onResumeAI}
              disabled={isLoading}
              className="gap-2"
            >
              <Play size={14} />
              Resume AI
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={onRelease}
            disabled={isLoading}
            className="gap-2"
          >
            <LogOut size={14} />
            Release
          </Button>
        </>
      ) : (
        <div className="text-xs text-muted">
          Claimed by another operator
        </div>
      )}
    </div>
  );
}
