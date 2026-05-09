"use client";

import {
  ConversationsInboxResponseSchema,
  OwnerHomeQueueResponseSchema,
  type ConversationInboxThread,
  type OwnerHomeQueueItem,
  type WorkspaceRole,
} from "@realty-ops/core";
import { ArrowLeft, CalendarClock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "../../components/app-shell";
import { Button } from "../../components/ui/button";
import {
  ContextRibbon,
  DetailPanel,
  type Reply,
  type Task,
  type WorkItem,
  getWorkItemKey,
  mapHomePayloadToWorkItems,
  readObject,
} from "../home/home-page";
import { OwnerHomeDashboard } from "../home/owner-home-dashboard";

type QueuePageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  operatorRole: WorkspaceRole;
};

export function QueuePage(props: QueuePageProps) {
  const [dashboardWorkItems, setDashboardWorkItems] = useState<WorkItem[]>([]);
  const [ownerQueueItems, setOwnerQueueItems] = useState<OwnerHomeQueueItem[]>([]);
  const [activeWorkItemKey, setActiveWorkItemKey] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  const isOwnerHome = props.operatorRole === "owner" || props.operatorRole === "admin";
  const firstName = useMemo(
    () => props.operatorName.trim().split(/\s+/)[0] ?? props.operatorName,
    [props.operatorName],
  );

  const activeWorkItem = useMemo(() => {
    if (dashboardWorkItems.length === 0) return null;
    const active = activeWorkItemKey === null
      ? null
      : dashboardWorkItems.find((entry) => getWorkItemKey(entry) === activeWorkItemKey) ?? null;
    return active ?? dashboardWorkItems[0] ?? null;
  }, [activeWorkItemKey, dashboardWorkItems]);

  const queueCount = isOwnerHome ? ownerQueueItems.length : dashboardWorkItems.length;
  const approvalCount = useMemo(
    () => dashboardWorkItems.filter((entry) => entry.kind === "reply" || entry.item.workItemType === "approval").length,
    [dashboardWorkItems],
  );

  async function refreshQueueData() {
    const [response, ownerQueueResponse] = await Promise.all([
      fetch(`/api/home?workspaceId=${props.workspaceId}`, { cache: "no-store" }),
      isOwnerHome ? fetch(`/api/home/owner-queue?workspaceId=${props.workspaceId}`, { cache: "no-store" }) : Promise.resolve(null),
    ]);
    if (!response.ok) return;
    const payload = readObject(await response.json());
    if (payload === null) return;

    const conversationsParsed = ConversationsInboxResponseSchema.safeParse(payload["conversations"]);
    const nextThreads = conversationsParsed.success ? conversationsParsed.data.threads : [];
    const threadMap = new Map(nextThreads.map((thread: ConversationInboxThread) => [thread.leadId, thread]));

    setDashboardWorkItems(mapHomePayloadToWorkItems(payload, threadMap));

    if (!isOwnerHome) {
      setOwnerQueueItems([]);
      return;
    }

    const ownerQueuePayload = ownerQueueResponse !== null && ownerQueueResponse.ok
      ? readObject(await ownerQueueResponse.json())
      : null;
    const ownerQueueParsed = OwnerHomeQueueResponseSchema.safeParse(ownerQueuePayload);
    setOwnerQueueItems(ownerQueueParsed.success ? ownerQueueParsed.data.items : []);
  }

  async function handleTaskAction(action: "callback" | "reviewed" | "dismiss", task: Task) {
    if (task.type === "insight") {
      if (task.workspaceId === undefined || task.workItemId === undefined) {
        setActionStatus("This Harwick item is missing its backend row.");
        return;
      }
      const response = await fetch(`/api/workspaces/${task.workspaceId}/harwick-work-items/${task.workItemId}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "dismiss"
          ? { action: "dismiss", feedbackLabel: "not_relevant" }
          : task.workItemType === "approval"
            ? { action: "approve", feedbackLabel: "useful" }
            : { action: "mark_seen", feedbackLabel: "useful" }),
      });
      setActionStatus(response.ok ? "Harwick work item updated." : "The backend rejected this Harwick action.");
      if (response.ok) await refreshQueueData();
      return;
    }

    if (task.type === "crm") {
      if (task.operationsFailureItemType !== undefined && task.workspaceId !== undefined && task.operationsFailureResourceId !== undefined) {
        const endpoint = task.operationsFailureItemType === "workflow_job"
          ? `/api/workspaces/${task.workspaceId}/operations/workflow-jobs/${task.operationsFailureResourceId}/action`
          : `/api/workspaces/${task.workspaceId}/operations/crm-syncs/${task.operationsFailureResourceId}/action`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action === "dismiss" ? { action: "dismiss" } : { action: "retry_now" }),
        });
        setActionStatus(response.ok ? "Operations action queued." : "The backend rejected this operations action.");
        if (response.ok) await refreshQueueData();
        return;
      }

      if (task.workspaceId !== undefined && task.backsyncEventId !== undefined) {
        const response = await fetch(`/api/workspaces/${task.workspaceId}/operations/fub-conflicts/${task.backsyncEventId}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(action === "dismiss" ? { action: "ignore", reason: "operator ignored from queue" } : { action: "replay" }),
        });
        setActionStatus(response.ok ? "Follow Up Boss action queued." : "The backend rejected this FUB action.");
        if (response.ok) await refreshQueueData();
        return;
      }
    }

    if (task.workspaceId === undefined || task.handoffId === undefined || task.type !== "callback") {
      setActionStatus("This task is not connected to a backend handoff row yet.");
      return;
    }

    const response = await fetch(`/api/workspaces/${task.workspaceId}/voice-queue/${task.handoffId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action === "callback"
        ? { action: "create_callback_task", title: task.title, description: task.detail, priority: "urgent" }
        : action === "dismiss"
          ? { action: "dismiss", reason: "operator dismissed from queue" }
          : { action: "mark_reviewed" }),
    });
    setActionStatus(response.ok ? "Voice handoff updated." : "The backend rejected this voice action.");
    if (response.ok) await refreshQueueData();
  }

  async function handleReplyAction(action: "approve" | "send", reply: Reply) {
    if (reply.workspaceId === undefined || reply.reviewId === undefined) {
      setActionStatus("This reply is not connected to a backend review row yet.");
      return;
    }

    const response = await fetch(`/api/workspaces/${reply.workspaceId}/social-queue/${reply.reviewId}/action`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, reply: reply.draft }),
    });
    setActionStatus(response.ok
      ? action === "send" ? "Reply sent." : "Reply approved."
      : "The backend rejected this reply action.");
    if (response.ok) {
      setDetailOpen(false);
      await refreshQueueData();
    }
  }

  useEffect(() => {
    void refreshQueueData();
  }, []);

  useEffect(() => {
    if (dashboardWorkItems.length === 0) {
      setActiveWorkItemKey(null);
      return;
    }
    if (activeWorkItemKey === null || !dashboardWorkItems.some((entry) => getWorkItemKey(entry) === activeWorkItemKey)) {
      setActiveWorkItemKey(getWorkItemKey(dashboardWorkItems[0]!));
    }
  }, [activeWorkItemKey, dashboardWorkItems]);

  return (
    <AppShell
      activeItem="Queue"
      memberName={props.operatorName}
      memberRole={props.operatorRole}
      title="Queue"
      tone="dashboardDark"
      workspaceName={props.workspaceName}
    >
      <main className="flex min-h-full w-full flex-col px-5 py-8 md:px-8 md:py-10 xl:pr-[26rem]">
        <div className="mb-6 flex w-full flex-wrap items-end justify-between gap-4 border-b border-white/7 pb-4">
          <div className="space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/34">{props.workspaceName}</p>
            <h1 className="harwick-wordmark text-[28px] leading-none text-white">Queue</h1>
            <p className="text-sm text-white/54">
              {isOwnerHome
                ? `${firstName}, these are the owner-level interventions Harwick could not clear alone.`
                : `${firstName}, these are the live approvals, reviews, and exceptions Harwick surfaced for you.`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/46">
              {queueCount} live items
            </span>
            {isOwnerHome ? null : (
              <span className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-white/46">
                {approvalCount} approvals
              </span>
            )}
            <Button asChild className="border-white/8 bg-white/[0.02] text-white/72 shadow-none hover:bg-white/[0.06] hover:text-white" size="sm" variant="outline">
              <a href="/home">
                <ArrowLeft className="size-3.5" />
                open assistant
              </a>
            </Button>
          </div>
        </div>

        {actionStatus === null ? null : (
          <div className="mb-6 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-white/72">
            {actionStatus}
          </div>
        )}

        {isOwnerHome ? (
          <OwnerHomeDashboard limit={12} queueItems={ownerQueueItems} title="Owner Queue" />
        ) : (
          <section className="mx-auto w-full max-w-5xl">
            <div className="mb-5 flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-white/36">
              <CalendarClock className="size-3.5" />
              Live queue
            </div>
            <ContextRibbon
              activeKey={activeWorkItem === null ? null : getWorkItemKey(activeWorkItem)}
              items={dashboardWorkItems}
              limit={12}
              onReplyAction={(action, reply) => {
                void handleReplyAction(action, reply);
              }}
              onSelect={(entry) => {
                setActiveWorkItemKey(getWorkItemKey(entry));
                setDetailOpen(true);
                setActionStatus(null);
              }}
              onTaskAction={(action, task) => {
                void handleTaskAction(action, task);
              }}
              showViewAllLink={false}
            />
          </section>
        )}
      </main>
      <DetailPanel
        activeEntry={activeWorkItem}
        isOpen={!isOwnerHome && detailOpen}
        onClose={() => setDetailOpen(false)}
        onReplyAction={(action, reply) => {
          void handleReplyAction(action, reply);
        }}
        onTaskAction={(action, task) => {
          void handleTaskAction(action, task);
        }}
      />
    </AppShell>
  );
}
