"use client";

import { Hash, Lock, MessageSquarePlus, Users } from "lucide-react";

import { useChannels } from "../../features/channels/use-channels";
import { cn } from "../../lib/utils";

/**
 * Rooms view inside the rail — a compact channel index. Click goes to /channels;
 * the rail doesn't try to be a chat client. New-channel button opens the page
 * in create mode (?new=1) so the same modal handles it. Lives entirely against
 * harwick_channels — no localStorage.
 */
export function RoomsMode({ workspaceId }: { workspaceId: string }) {
  const channels = useChannels(workspaceId);

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      <div className="mb-3 flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/48">
        <Hash className="size-3" aria-hidden="true" />
        rooms
        <a
          href="/channels?new=1"
          className="ml-auto inline-flex items-center gap-1 rounded-[6px] border border-white/[0.08] bg-white/[0.025] px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal text-white/82 transition hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-white"
        >
          <MessageSquarePlus className="size-3" aria-hidden="true" />
          new
        </a>
      </div>

      {channels.loaded === false ? (
        <div className="space-y-1.5">
          <div className="h-8 animate-pulse rounded-[8px] bg-white/[0.02]" />
          <div className="h-8 animate-pulse rounded-[8px] bg-white/[0.02]" />
        </div>
      ) : channels.channels.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-white/[0.1] bg-white/[0.01] px-3 py-4 text-center">
          <p className="text-[12px] leading-5 text-white/68">No rooms yet.</p>
          <p className="mt-1 text-[10.5px] text-white/48">Ask Harwick to spin one up, or hit <span className="rounded bg-white/[0.04] px-1 text-white/72">new</span> above.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {channels.channels.map((channel) => {
            const Icon = channel.kind === "dm" ? Lock : channel.kind === "group" ? Users : Hash;
            const isHarwickSpawned = channel.createdByKind === "harwick";
            return (
              <a
                key={channel.id}
                href={`/channels?channelId=${channel.id}`}
                className={cn(
                  "flex items-center gap-2 rounded-[8px] border border-white/[0.05] bg-white/[0.015] px-2.5 py-2 transition hover:border-white/[0.12] hover:bg-white/[0.04]",
                )}
              >
                <Icon className="size-3.5 shrink-0 text-white/52" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12.5px] font-semibold text-white">{channel.name}</span>
                    {isHarwickSpawned ? (
                      <span className="rounded-full bg-[var(--sage-soft)] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-[var(--sage)]">
                        spawned by harwick
                      </span>
                    ) : null}
                  </div>
                  {channel.description === null || channel.description.length === 0 ? null : (
                    <div className="truncate text-[10.5px] text-white/52">{channel.description}</div>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}

      <div className="mt-3 rounded-[10px] border border-white/[0.06] bg-white/[0.015] px-3 py-2.5">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-white/48">tip</div>
        <p className="mt-1 text-[11.5px] leading-5 text-white/72">
          Type <code className="rounded bg-white/[0.04] px-1 text-white/82">@harwick</code> in any room to pull Harwick in. It will reply directly in the channel.
        </p>
      </div>
    </div>
  );
}
