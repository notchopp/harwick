"use client";

import type { OwnerHomeQueueItem } from "@realty-ops/core";
import { AlertCircle, ArrowRight, Bot, GitBranch, MessageSquare, type LucideIcon } from "lucide-react";

import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/utils";

function queueTone(priority: OwnerHomeQueueItem["priority"]): "qualified" | "warm" | "hot" {
  if (priority === "urgent") return "hot";
  if (priority === "high") return "warm";
  return "qualified";
}

function queueMeta(item: OwnerHomeQueueItem): { icon: LucideIcon; label: string } {
  if (item.kind === "routing") return { icon: GitBranch, label: "Routing" };
  if (item.kind === "inbox") return { icon: MessageSquare, label: "Conversation" };
  if (item.kind === "operations") return { icon: AlertCircle, label: "System" };
  if (item.kind === "crm") return { icon: AlertCircle, label: "CRM" };
  return { icon: Bot, label: "Harwick" };
}

export function OwnerHomeDashboard(props: {
  queueItems: OwnerHomeQueueItem[];
  limit?: number;
  title?: string;
}) {
  const visibleQueue = props.queueItems.slice(0, props.limit ?? 6);

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold text-white">{props.title ?? "Work Queue"}</h2>
        <Badge className="rounded-full bg-white/[0.05] text-white/70" variant="ghost">
          {props.queueItems.length}
        </Badge>
      </div>

      {visibleQueue.length === 0 ? (
        <div className="rounded-[24px] border border-white/7 bg-transparent px-5 py-6 text-sm text-white/54">
          Harwick has no owner-level item waiting right now.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleQueue.map((item) => {
            const meta = queueMeta(item);
            const Icon = meta.icon;
            return (
              <div
                className="flex items-start justify-between gap-4 rounded-[24px] border border-white/7 bg-transparent px-5 py-5 transition hover:bg-white/[0.02]"
                key={item.id}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.04] text-white/56">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full bg-white/[0.05] text-white/56" variant="ghost">
                        {meta.label}
                      </Badge>
                      <Badge className="rounded-full" tone={queueTone(item.priority)} variant="ghost">
                        {item.priority}
                      </Badge>
                    </div>
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="text-sm leading-6 text-white/68">{item.reason}</p>
                    <p className="text-xs leading-5 text-white/46">{item.summary}</p>
                  </div>
                </div>
                <Button
                  asChild
                  className={cn(
                    "shrink-0 border-white/8 bg-white/[0.02] text-white/72 shadow-none hover:bg-white/[0.06] hover:text-white",
                  )}
                  size="xs"
                  variant="outline"
                >
                  <a href={item.href}>
                    {item.actionLabel}
                    <ArrowRight className="size-3.5" />
                  </a>
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
