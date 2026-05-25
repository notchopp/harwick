"use client";

import type { HarwickChannel, HarwickChannelMessage, WorkspaceRole } from "@realty-ops/core";
import { ArrowLeft, ChevronDown, Hash, Lock, MessageSquarePlus, Send, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { HarwickMark } from "../../components/harwick-rail/harwick-mark";
import { ToolResultCard } from "../../components/harwick-rail/harwick-chat";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { useChannels } from "./use-channels";
import { useChannelMessages } from "./use-channel-messages";

const HARWICK_THINKING_TIMEOUT_MS = 90_000;

type HarwickCard = { toolName: string; output: unknown };

function HarwickThinkingBubble() {
  return (
    <div className="flex w-full gap-2 justify-start">
      <HarwickMark size={28} tone="default" className="shrink-0" />
      <div className="flex max-w-[78%] min-w-0 flex-col gap-1.5 items-start">
        <div className="rounded-[12px] rounded-tl-[4px] border border-[var(--sage)]/30 bg-[var(--sage-soft)] px-3 py-2.5 text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)]">
          <div className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--sage)]">
            Harwick <span className="ml-1 font-normal normal-case opacity-60">thinking…</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-white/72 animate-[harwick-think_1.2s_ease-in-out_infinite]" />
            <span className="size-1.5 rounded-full bg-white/72 animate-[harwick-think_1.2s_ease-in-out_0.15s_infinite]" />
            <span className="size-1.5 rounded-full bg-white/72 animate-[harwick-think_1.2s_ease-in-out_0.3s_infinite]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function shouldShowHarwickThinking(messages: HarwickChannelMessage[], nowMs: number): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg === undefined) continue;
    if (msg.authorKind === "harwick") return false;
    if (msg.authorKind === "member" && msg.mentionsHarwick) {
      // Negative age happens when the server timestamp is microseconds ahead of
      // the client clock; treat it as "just posted" not "ignore".
      const age = Math.max(0, nowMs - new Date(msg.createdAt).getTime());
      return age < HARWICK_THINKING_TIMEOUT_MS;
    }
  }
  return false;
}

function extractHarwickCards(metadata: HarwickChannelMessage["metadata"]): HarwickCard[] {
  const raw = (metadata as { cards?: unknown }).cards;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (entry === null || typeof entry !== "object") return [];
    const obj = entry as { toolName?: unknown; output?: unknown };
    if (typeof obj.toolName !== "string") return [];
    return [{ toolName: obj.toolName, output: obj.output }];
  });
}

type Props = {
  workspaceId: string;
  workspaceName: string;
  currentMemberId: string;
  operatorRole: WorkspaceRole;
};

type ComposerProps = {
  onSend: (body: string) => Promise<HarwickChannelMessage | null>;
  disabled: boolean;
};

function Composer({ onSend, disabled }: ComposerProps) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (textareaRef.current === null) return;
    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.min(160, Math.max(36, textareaRef.current.scrollHeight))}px`;
  }, [draft]);

  async function submit() {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || sending) return;
    setSending(true);
    const result = await onSend(trimmed);
    setSending(false);
    if (result !== null) setDraft("");
  }

  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-white/[0.015] px-4 py-3">
      <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 transition focus-within:border-white/[0.18] focus-within:bg-white/[0.04]">
        <textarea
          ref={textareaRef}
          rows={1}
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey || !event.shiftKey)) {
              if (event.key === "Enter" && event.shiftKey) return;
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Message the channel — type @harwick to pull Harwick in…"
          className="block w-full resize-none bg-transparent text-[13.5px] leading-5 text-white outline-none placeholder:text-white/40"
        />
        <div className="mt-2 flex items-center gap-2">
          <span className="rounded-[5px] border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[10px] text-white/52">⏎</span>
          <span className="text-[10.5px] text-white/40">to send · Shift+Enter for a new line</span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || sending || draft.trim().length === 0}
            className={cn(
              "ml-auto flex h-7 items-center gap-1 rounded-[7px] px-2 text-[11px] font-semibold transition",
              disabled || sending || draft.trim().length === 0
                ? "border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-faint)]"
                : "bg-white text-[color:var(--panel-0)] hover:bg-white/92",
            )}
          >
            <Send className="size-3.5" aria-hidden="true" />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function NewChannelDialog(props: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name: string; description: string; kind: "channel" | "dm" | "group" }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"channel" | "dm" | "group">("channel");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!props.open) {
      setName("");
      setDescription("");
      setKind("channel");
      setBusy(false);
    }
  }, [props.open]);

  if (!props.open) return null;

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const valid = slug.length > 0 && slug.length <= 80;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    await props.onCreate({ name: slug, description: description.trim(), kind });
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="harwick-shell-dark w-full max-w-md rounded-[16px] border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-1)] p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)]">
        <div className="mb-4 flex items-center gap-2">
          <MessageSquarePlus className="size-4 text-[var(--sage)]" aria-hidden="true" />
          <h2 className="text-[14px] font-semibold text-white">New channel</h2>
          <button
            type="button"
            className="ml-auto flex size-7 items-center justify-center rounded-[6px] text-white/64 transition hover:bg-white/[0.04] hover:text-white"
            onClick={props.onClose}
            aria-label="Close"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/52">Name</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="oak-ave-deal"
              className="block w-full rounded-[8px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[13px] text-white outline-none transition focus:border-white/[0.18] focus:bg-white/[0.04]"
              autoFocus
            />
            {slug.length > 0 && slug !== name ? (
              <span className="mt-1 block text-[10.5px] text-white/48">Will be saved as <code className="text-white/72">{slug}</code></span>
            ) : null}
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/52">Description (optional)</span>
            <input
              type="text"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What's this room for?"
              className="block w-full rounded-[8px] border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-[13px] text-white outline-none transition focus:border-white/[0.18] focus:bg-white/[0.04]"
            />
          </label>

          <fieldset className="block">
            <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.1em] text-white/52">Kind</span>
            <div className="inline-flex rounded-[8px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] p-0.5">
              {(["channel", "group", "dm"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={cn(
                    "flex h-7 items-center gap-1 rounded-[6px] px-2.5 text-[11.5px] font-semibold transition",
                    kind === value ? "bg-white text-[color:var(--panel-0)]" : "text-[color:var(--graphite-text-muted)] hover:text-[color:var(--graphite-text)]",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-[7px] px-3 py-1.5 text-[11.5px] font-medium text-white/72 transition hover:bg-white/[0.04] hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!valid || busy}
              className={cn(
                "rounded-[7px] px-3 py-1.5 text-[11.5px] font-semibold transition",
                valid && !busy
                  ? "bg-white text-[color:var(--panel-0)] hover:bg-white/92"
                  : "border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-faint)]",
              )}
            >
              {busy ? "Creating…" : "Create channel"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, currentMemberId, memberNames }: {
  message: HarwickChannelMessage;
  currentMemberId: string;
  memberNames: Map<string, string>;
}) {
  const isHarwick = message.authorKind === "harwick";
  const isSystem = message.authorKind === "system";
  const isMe = message.authorMemberId === currentMemberId;

  if (isSystem) {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-[10.5px] uppercase tracking-[0.08em] text-white/52">
          {message.body}
        </span>
      </div>
    );
  }

  const authorLabel = isHarwick ? "Harwick" : memberNames.get(message.authorMemberId ?? "") ?? "Member";
  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const cards = isHarwick ? extractHarwickCards(message.metadata) : [];

  return (
    <div className={cn("flex w-full gap-2", isMe ? "justify-end" : "justify-start")}>
      {!isMe ? (
        isHarwick ? (
          <HarwickMark size={28} tone="default" className="shrink-0" />
        ) : (
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[10.5px] font-semibold text-white/82">
            {authorLabel.slice(0, 2).toUpperCase()}
          </div>
        )
      ) : null}
      <div className={cn("flex min-w-0 flex-col gap-1.5", isHarwick ? "max-w-[78%]" : "max-w-[72%]", isMe ? "items-end" : "items-start")}>
        <div className={cn(
          "rounded-[12px] px-3 py-2 text-[13px] leading-5 whitespace-pre-wrap break-words shadow-[0_1px_2px_rgba(0,0,0,0.18)]",
          isMe
            ? "bg-white text-[#0f1011] rounded-tr-[4px]"
            : isHarwick
              ? "bg-[var(--sage-soft)] text-white border border-[var(--sage)]/30 rounded-tl-[4px]"
              : "bg-white/[0.05] text-white border border-white/[0.06] rounded-tl-[4px]",
        )}>
          {!isMe ? (
            <div className={cn("mb-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]", isHarwick ? "text-[var(--sage)]" : "text-white/64")}>
              {authorLabel} <span className="ml-1 font-normal normal-case opacity-60">{time}</span>
            </div>
          ) : null}
          <p>{message.body}</p>
          {isMe ? (
            <div className="mt-0.5 text-right text-[9.5px] font-normal opacity-60">{time}</div>
          ) : null}
        </div>
        {cards.length > 0 ? (
          <div className="w-full space-y-2">
            {cards.map((card, index) => (
              <ToolResultCard key={`${card.toolName}-${index}`} toolName={card.toolName} output={card.output} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ChannelRow({ channel, active, onSelect }: {
  channel: HarwickChannel;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = channel.kind === "dm" ? Lock : channel.kind === "group" ? Users : Hash;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-[8px] px-2 py-1.5 text-left text-[12.5px] transition",
        active ? "bg-white/[0.05] text-white" : "text-white/72 hover:bg-white/[0.025] hover:text-white",
      )}
    >
      <Icon className="size-3.5 shrink-0 text-white/52" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium">{channel.name}</span>
    </button>
  );
}

export function ChannelsPage(props: Props) {
  const channels = useChannels(props.workspaceId);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [memberNames] = useState<Map<string, string>>(new Map());

  // Auto-select first channel only on desktop. On mobile the channel list IS the
  // landing view — auto-selecting would defeat the back button (effect would re-fire
  // every time the user navigates back to the list).
  useEffect(() => {
    if (activeChannelId !== null) return;
    if (channels.channels.length === 0) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;
    setActiveChannelId(channels.channels[0]?.id ?? null);
  }, [activeChannelId, channels.channels]);

  const activeChannel = useMemo(
    () => channels.channels.find((channel) => channel.id === activeChannelId) ?? null,
    [activeChannelId, channels.channels],
  );

  const messages = useChannelMessages(props.workspaceId, activeChannel === null ? null : activeChannel.id);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const showThinking = shouldShowHarwickThinking(messages.messages, nowMs);

  // Refresh the clock whenever the message list changes so a freshly-posted
  // @harwick message is evaluated against current time, not the mount time.
  // Without this the indicator stays hidden on stale pages until a hard refresh.
  useEffect(() => {
    setNowMs(Date.now());
  }, [messages.messages.length]);

  // Tick while Harwick may be working so the indicator auto-clears at timeout.
  // No interval at all when there's nothing to wait on.
  useEffect(() => {
    if (!showThinking) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 5_000);
    return () => window.clearInterval(id);
  }, [showThinking]);

  useEffect(() => {
    if (messagesEndRef.current === null) return;
    messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.messages.length, showThinking]);

  return (
    <div className="flex h-[calc(100vh-72px)] min-h-0 overflow-hidden rounded-none border-0 bg-[color:var(--panel-1)] md:rounded-[var(--panel-radius-lg)] md:border md:border-[color:var(--panel-line)]">
      {/* Channel list — full width on mobile when no channel selected; sidebar on desktop */}
      <aside className={cn(
        "w-full shrink-0 flex-col border-r border-white/[0.06] bg-[color:var(--panel-0)]/40 md:flex md:w-60",
        activeChannelId === null ? "flex" : "hidden md:flex",
      )}>
        <div className="flex items-center justify-between border-b border-white/[0.06] px-3 py-2.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/56">Channels</div>
          <button
            type="button"
            onClick={() => setShowNewDialog(true)}
            className="flex size-7 items-center justify-center rounded-[6px] text-white/64 transition hover:bg-white/[0.04] hover:text-white"
            title="New channel"
            aria-label="New channel"
          >
            <MessageSquarePlus className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {channels.loaded === false ? (
            <div className="space-y-1.5">
              <div className="h-7 animate-pulse rounded-[7px] bg-white/[0.02]" />
              <div className="h-7 animate-pulse rounded-[7px] bg-white/[0.02]" />
            </div>
          ) : channels.channels.length === 0 ? (
            <div className="rounded-[8px] border border-dashed border-white/[0.08] bg-white/[0.01] px-3 py-3 text-center">
              <p className="text-[11.5px] leading-5 text-white/64">No channels yet.</p>
              <button
                type="button"
                onClick={() => setShowNewDialog(true)}
                className="mt-2 inline-flex items-center gap-1 rounded-[6px] border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-[10.5px] font-medium text-white/82 transition hover:border-white/[0.16] hover:bg-white/[0.04] hover:text-white"
              >
                <MessageSquarePlus className="size-3" aria-hidden="true" />
                Create one
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {channels.channels.map((channel) => (
                <ChannelRow
                  key={channel.id}
                  channel={channel}
                  active={channel.id === activeChannelId}
                  onSelect={() => setActiveChannelId(channel.id)}
                />
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-white/[0.06] bg-white/[0.015] px-3 py-2 text-[10.5px] leading-4 text-white/48">
          @harwick anywhere to pull Harwick into the room.
        </div>
      </aside>

      {/* Active channel pane — hidden on mobile when no channel selected; full-width when selected */}
      <section className={cn(
        "min-w-0 flex-1 flex-col md:flex",
        activeChannel === null ? "hidden md:flex" : "flex",
      )}>
        {activeChannel === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <MessageSquarePlus className="size-6 text-white/24" aria-hidden="true" />
            <p className="text-[12.5px] text-white/56">Pick a channel on the left or create one.</p>
          </div>
        ) : (
          <>
            {/* Mobile channel switcher — back-arrow + dropdown of all channels + create */}
            <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-3 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setActiveChannelId(null)}
                className="-ml-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/64 transition active:bg-white/[0.06] active:text-white"
                aria-label="Back to all channels"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label="Switch channel"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-2.5 py-2 text-left outline-none transition active:bg-white/[0.04] data-[state=open]:border-white/[0.14]"
                    type="button"
                  >
                    <Hash className="size-3.5 shrink-0 text-white/56" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold leading-tight text-white">{activeChannel.name}</div>
                      <div className="truncate text-[10.5px] text-white/56">
                        {activeChannel.kind}
                        {activeChannel.description === null || activeChannel.description.length === 0 ? "" : ` · ${activeChannel.description}`}
                      </div>
                    </div>
                    <ChevronDown className="size-3.5 shrink-0 text-white/52" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="harwick-shell-dark z-[80] max-h-[60vh] w-[calc(100vw-1.5rem)] overflow-y-auto rounded-[12px] border-white/[0.1] bg-[#101112] p-1.5 text-white shadow-[0_18px_42px_-18px_rgba(0,0,0,0.85)]"
                  sideOffset={6}
                >
                  <DropdownMenuItem
                    className="cursor-pointer rounded-[9px] px-2.5 py-2.5 text-white/82 focus:bg-white/[0.06] focus:text-white"
                    onSelect={() => setShowNewDialog(true)}
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[var(--sage)]/35 bg-[var(--sage-soft)] text-[var(--sage)]">
                      <MessageSquarePlus className="size-3.5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-semibold">new channel</div>
                      <div className="text-[10.5px] text-white/52">start a fresh room with @harwick</div>
                    </div>
                  </DropdownMenuItem>
                  {channels.channels.length === 0 ? null : <DropdownMenuSeparator className="my-1 bg-white/[0.06]" />}
                  {channels.channels.map((channel) => (
                    <DropdownMenuItem
                      className={cn(
                        "cursor-pointer rounded-[9px] px-2.5 py-2.5 text-white/72 focus:bg-white/[0.06] focus:text-white",
                        channel.id === activeChannel.id && "bg-white/[0.05] text-white",
                      )}
                      key={channel.id}
                      onSelect={() => setActiveChannelId(channel.id)}
                    >
                      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/64">
                        <Hash className="size-3.5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{channel.name}</div>
                        <div className="truncate text-[10.5px] text-white/44">{channel.kind}</div>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Desktop channel header */}
            <header className="hidden shrink-0 items-center gap-2 border-b border-white/[0.06] bg-white/[0.015] px-4 py-2.5 md:flex">
              <Hash className="size-3.5 text-white/48" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold text-white">{activeChannel.name}</div>
                {activeChannel.description === null || activeChannel.description.length === 0 ? null : (
                  <div className="truncate text-[10.5px] text-white/56">{activeChannel.description}</div>
                )}
              </div>
              <span className="rounded-full bg-white/[0.04] px-1.5 py-0.5 text-[9.5px] uppercase tracking-[0.08em] text-white/56">
                {activeChannel.kind}
              </span>
            </header>

            <div className="min-w-0 flex-1 overflow-y-auto px-4 py-3">
              {messages.loaded === false ? (
                <div className="text-[11.5px] text-white/52">Loading messages…</div>
              ) : messages.messages.length === 0 ? (
                <div className="rounded-[10px] border border-dashed border-white/[0.08] bg-white/[0.01] px-4 py-6 text-center">
                  <p className="text-[12.5px] text-white/64">Nothing here yet. Say hi — or <code className="rounded bg-white/[0.04] px-1 text-white/82">@harwick</code> to get Harwick involved.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {messages.messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      currentMemberId={props.currentMemberId}
                      memberNames={memberNames}
                    />
                  ))}
                  {showThinking ? <HarwickThinkingBubble /> : null}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            <Composer onSend={messages.postMessage} disabled={false} />
          </>
        )}
      </section>

      <NewChannelDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreate={async (input) => {
          const created = await channels.createChannel(
            input.description.length === 0
              ? { name: input.name, kind: input.kind }
              : { name: input.name, description: input.description, kind: input.kind },
          );
          setShowNewDialog(false);
          if (created !== null) setActiveChannelId(created.id);
        }}
      />
    </div>
  );
}
