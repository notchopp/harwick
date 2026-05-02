import type { ReactNode } from "react";

type WorkspaceTopbarProps = {
  children?: ReactNode;
  context: string;
  workspaceName: string;
};

export function WorkspaceTopbar(props: WorkspaceTopbarProps) {
  return (
    <div className="flex h-14 shrink-0 items-center border-b border-border bg-surface px-7">
      <div className="font-display text-[19px] font-medium">{props.workspaceName}</div>
      <div className="ml-2 text-[12px] text-muted-subtle">{props.context}</div>
      {props.children}
    </div>
  );
}
