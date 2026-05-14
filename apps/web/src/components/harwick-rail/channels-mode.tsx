"use client";

import type { TeamPresenceMember } from "@realty-ops/core";
import { ArrowLeft, AtSign, Hash, Plus, Send, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../../lib/utils";
import { HarwickMark } from "./harwick-mark";

/**
 * Channels mode in the right rail — a tight Slack-like workspace.
 *
 * Three room kinds:
 *  - channel — multi-member group thread (team_lead+ can create)
 *  - dm — one-on-one (anyone can start with anyone)
 *  - group — operator-picked group chat
 *
 * Harwick is implicitly in every room. @harwick mentions are parsed inline.
 * Persistence: localStorage today, a workspace_rooms table later.
 */

const STORAGE_KEY = "harwick-rail-channels-v1";

type RoomKind = "channel" | "dm" | "group";

type RoomMessage = {
  id: string;
  authorId: string; // memberId, "harwick", "system", or "me"
  authorLabel: string;
  body: string;
  createdAt: string;
};

type Room = {
  id: string;
  kind: RoomKind;
  name: string;
  description: string;
  memberIds: string[];
  messages: RoomMessage[];
  unread: number;
};

type ChannelsState = {
  rooms: Room[];
  activeRoomId: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readState(): ChannelsState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return seedState();
    const parsed = JSON.parse(raw) as Partial<ChannelsState>;
    return {
      rooms: Array.isArray(parsed.rooms) && parsed.rooms.length > 0 ? parsed.rooms : seedState().rooms,
      activeRoomId: typeof parsed.activeRoomId === "string" ? parsed.activeRoomId : null,
    };
  } catch {
    return seedState();
  }
}

function seedState(): ChannelsState {
  const created = nowIso();
  return {
    activeRoomId: null,
    rooms: [
      {
        id: "channel:general",
        kind: "channel",
        name: "general",
        description: "Everyone in the workspace",
        memberIds: [],
        messages: [
          {
            id: "general:welcome",
            authorId: "harwick",
            authorLabel: "Harwick",
            body: "I'm in every room. Just type @harwick anywhere and I'll respond. I'll also drop proactive cards when something on the board changes.",
            createdAt: created,
          },
        ],
        unread: 0,
      },
      {
        id: "channel:routing",
        kind: "channel",
        name: "routing",
        description: "Lead routing decisions and approvals",
        memberIds: [],
        messages: [
          {
            id: "routing:welcome",
            authorId: "system",
            authorLabel: "System",
            body: "Pin routing approvals here so teammates see the rationale.",
            createdAt: created,
          },
        ],
        unread: 0,
      },
    ],
  };
}

function harwickAmbientReply(text: string): string {
  const trimmed = text.trim().toLowerCase();
  if (trimmed.includes("hot") || trimmed.includes("urgent")) {
    return "I'll pull up the hot board now. The fastest move is usually the lead with no first reply yet — want me to surface it as a card?";
  }
  if (trimmed.includes("calendar") || trimmed.includes("showing")) {
    return "I can check the team calendar and propose a showing slot. Drop the lead name or listing and I'll line one up.";
  }
  if (trimmed.includes("brief") || trimmed.includes("summary")) {
    return "On it. I'll synthesize the recent activity into a brief and post it here when it's ready.";
  }
  if (trimmed.includes("@harwick") || trimmed.includes("help") || trimmed.length === 0) {
    return "Here when you need me. Ask me to find a lead, propose a routing call, draft a reply, or summarize a thread.";
  }
  return "Tracked. I'll watch for follow-ups and chime in if anything on the board shifts because of this.";
}

function MemberInitial({ id, members }: { id: string; members: TeamPresenceMember[] }) {
  const member = members.find((m) => m.id === id);
  if (member === undefined) {
    return (
      <div className="flex size-5 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[8.5px] font-semibold text-[color:var(--graphite-text-muted)]">
        ?
      </div>
    );
  }
  return (
    <div className="flex size-5 items-center justify-center rounded-full border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] text-[8.5px] font-semibold text-[color:var(--graphite-text)]">
      {member.initials}
    </div>
  );
}

function formatBody(body: string): React.ReactNode {
  const parts = body.split(/(@harwick|@\w+)/g);
  return parts.map((part, index) => {
    if (part === "@harwick") {
      return (
        <span key={index} className="rounded-[4px] bg-[var(--sage-soft)] px-1 text-[var(--sage)]">@harwick</span>
      );
    }
    if (part.startsWith("@")) {
      return (
        <span key={index} className="rounded-[4px] bg-[color:var(--panel-3)] px-1 text-[color:var(--graphite-text)]">{part}</span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function ChannelsMode({ team, currentMemberId }: { team: TeamPresenceMember[]; currentMemberId: string | null }) {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<ChannelsState>(() => seedState());
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<null | "channel" | "dm">(null);
  const [newName, setNewName] = useState("");
  const [pickedMembers, setPickedMembers] = useState<Set<string>>(new Set());
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setState(readState());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [mounted, state]);

  const activeRoom = useMemo(() => state.rooms.find((r) => r.id === state.activeRoomId) ?? null, [state]);

  useEffect(() => {
    if (messagesRef.current === null) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [activeRoom?.messages]);

  const send = useCallback(() => {
    const text = draft.trim();
    if (text.length === 0 || activeRoom === null) return;
    setDraft("");
    const userMessage: RoomMessage = {
      id: `m-${Date.now()}`,
      authorId: currentMemberId ?? "me",
      authorLabel: "You",
      body: text,
      createdAt: nowIso(),
    };
    setState((current) => ({
      ...current,
      rooms: current.rooms.map((room) =>
        room.id === activeRoom.id ? { ...room, messages: [...room.messages, userMessage] } : room,
      ),
    }));

    // Harwick reacts inline when @harwick is tagged or in DM with Harwick.
    const mentionsHarwick = text.toLowerCase().includes("@harwick") || activeRoom.id === "dm:harwick";
    if (mentionsHarwick) {
      window.setTimeout(() => {
        const reply: RoomMessage = {
          id: `m-${Date.now() + 1}-h`,
          authorId: "harwick",
          authorLabel: "Harwick",
          body: harwickAmbientReply(text),
          createdAt: nowIso(),
        };
        setState((current) => ({
          ...current,
          rooms: current.rooms.map((room) =>
            room.id === activeRoom.id ? { ...room, messages: [...room.messages, reply] } : room,
          ),
        }));
      }, 480);
    }
  }, [activeRoom, currentMemberId, draft]);

  const createChannel = useCallback(() => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, "-");
    if (name.length === 0) return;
    const id = `channel:${name}-${Date.now()}`;
    const memberIds = [...pickedMembers];
    setState((current) => ({
      ...current,
      activeRoomId: id,
      rooms: [
        {
          id,
          kind: "channel",
          name,
          description: memberIds.length === 0 ? "Newly created channel" : `${memberIds.length} member${memberIds.length === 1 ? "" : "s"}`,
          memberIds,
          messages: [
            {
              id: `${id}:created`,
              authorId: "system",
              authorLabel: "System",
              body: `#${name} created. Harwick is listening here.`,
              createdAt: nowIso(),
            },
          ],
          unread: 0,
        },
        ...current.rooms,
      ],
    }));
    setNewName("");
    setPickedMembers(new Set());
    setPicker(null);
  }, [newName, pickedMembers]);

  const createDm = useCallback((member: TeamPresenceMember) => {
    const id = `dm:${member.id}`;
    setState((current) => {
      if (current.rooms.some((room) => room.id === id)) {
        return { ...current, activeRoomId: id };
      }
      return {
        ...current,
        activeRoomId: id,
        rooms: [
          {
            id,
            kind: "dm",
            name: member.name,
            description: member.roleLabel,
            memberIds: [member.id],
            messages: [
              {
                id: `${id}:start`,
                authorId: "system",
                authorLabel: "System",
                body: `Direct message with ${member.name}. Harwick is also here — type @harwick to ask.`,
                createdAt: nowIso(),
              },
            ],
            unread: 0,
          },
          ...current.rooms,
        ],
      };
    });
    setPicker(null);
  }, []);

  // Reset picker when changing rooms
  useEffect(() => {
    setPicker(null);
  }, [state.activeRoomId]);

  if (activeRoom === null) {
    const channelRooms = state.rooms.filter((r) => r.kind === "channel" || r.kind === "group");
    const dmRooms = state.rooms.filter((r) => r.kind === "dm");

    return (
      <div className="flex flex-1 flex-col overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--graphite-text-faint)]">Channels</span>
          <button
            type="button"
            onClick={() => setPicker("channel")}
            className="flex size-5 items-center justify-center rounded-[5px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] transition hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)]"
            title="New channel"
          >
            <Plus className="size-3" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-1">
          {channelRooms.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setState((current) => ({ ...current, activeRoomId: room.id }))}
              className="flex w-full items-center gap-2 rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-2)] px-2.5 py-2 text-left transition hover:border-[color:var(--panel-line)] hover:bg-[color:var(--panel-3)]"
            >
              <Hash className="size-3.5 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-[color:var(--graphite-text)]">{room.name}</div>
                <div className="truncate text-[10.5px] text-[color:var(--graphite-text-muted)]">{room.description}</div>
              </div>
              {room.unread > 0 ? (
                <span className="rounded-full bg-[var(--sage)] px-1.5 py-0.5 text-[9.5px] font-semibold text-[color:var(--panel-0)]">{room.unread}</span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="mb-2 mt-4 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--graphite-text-faint)]">Direct messages</span>
          <button
            type="button"
            onClick={() => setPicker("dm")}
            className="flex size-5 items-center justify-center rounded-[5px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] transition hover:border-[color:var(--panel-line-strong)] hover:text-[color:var(--graphite-text)]"
            title="New DM"
          >
            <Plus className="size-3" aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              const id = "dm:harwick";
              setState((current) => {
                if (current.rooms.some((room) => room.id === id)) {
                  return { ...current, activeRoomId: id };
                }
                return {
                  ...current,
                  activeRoomId: id,
                  rooms: [
                    {
                      id,
                      kind: "dm",
                      name: "Harwick",
                      description: "Your chief of staff",
                      memberIds: ["harwick"],
                      messages: [],
                      unread: 0,
                    },
                    ...current.rooms,
                  ],
                };
              });
            }}
            className="flex w-full items-center gap-2 rounded-[var(--panel-radius-xs)] border border-[var(--sage)]/25 bg-[var(--sage-soft)]/30 px-2.5 py-2 text-left transition hover:border-[var(--sage)]/40 hover:bg-[var(--sage-soft)]/50"
          >
            <HarwickMark size={18} tone="soft" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-semibold text-[color:var(--graphite-text)]">Harwick</div>
              <div className="truncate text-[10.5px] text-[color:var(--graphite-text-muted)]">Your chief of staff</div>
            </div>
          </button>
          {dmRooms.filter((r) => r.id !== "dm:harwick").map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => setState((current) => ({ ...current, activeRoomId: room.id }))}
              className="flex w-full items-center gap-2 rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-2)] px-2.5 py-2 text-left transition hover:border-[color:var(--panel-line)] hover:bg-[color:var(--panel-3)]"
            >
              <MemberInitial id={room.memberIds[0] ?? ""} members={team} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-semibold text-[color:var(--graphite-text)]">{room.name}</div>
                <div className="truncate text-[10.5px] text-[color:var(--graphite-text-muted)]">{room.description}</div>
              </div>
            </button>
          ))}
        </div>

        {picker === "channel" ? (
          <div className="mt-4 rounded-[var(--panel-radius-md)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--graphite-text-muted)]">New channel</span>
              <button type="button" onClick={() => setPicker(null)} className="text-[color:var(--graphite-text-faint)] hover:text-[color:var(--graphite-text)]">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="channel-name"
              className="block w-full rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] px-2.5 py-1.5 text-[12px] text-[color:var(--graphite-text)] placeholder:text-[color:var(--graphite-text-faint)] outline-none focus:border-[color:var(--panel-line-strong)]"
            />
            <div className="mt-2.5 space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[color:var(--graphite-text-faint)]">Invite ({pickedMembers.size})</div>
              <div className="max-h-[160px] overflow-y-auto rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)]">
                {team.length === 0 ? (
                  <div className="px-2.5 py-2 text-[11px] text-[color:var(--graphite-text-muted)]">No team members loaded.</div>
                ) : team.map((m) => {
                  const active = pickedMembers.has(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPickedMembers((current) => {
                          const next = new Set(current);
                          if (next.has(m.id)) next.delete(m.id);
                          else next.add(m.id);
                          return next;
                        });
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition",
                        active ? "bg-[var(--sage-soft)]/40 text-[color:var(--graphite-text)]" : "hover:bg-[color:var(--panel-3)]",
                      )}
                    >
                      <MemberInitial id={m.id} members={team} />
                      <span className="min-w-0 flex-1 truncate">{m.name}</span>
                      {active ? <AtSign className="size-3 text-[var(--sage)]" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-2.5 py-1 text-[11px] text-[color:var(--graphite-text-muted)] transition hover:text-[color:var(--graphite-text)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createChannel}
                disabled={newName.trim().length === 0}
                className="rounded-[var(--panel-radius-xs)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[color:var(--panel-0)] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Create
              </button>
            </div>
          </div>
        ) : null}

        {picker === "dm" ? (
          <div className="mt-4 rounded-[var(--panel-radius-md)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[color:var(--graphite-text-muted)]">New DM</span>
              <button type="button" onClick={() => setPicker(null)} className="text-[color:var(--graphite-text-faint)] hover:text-[color:var(--graphite-text)]">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="max-h-[220px] overflow-y-auto rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)]">
              {team.length === 0 ? (
                <div className="px-2.5 py-2 text-[11px] text-[color:var(--graphite-text-muted)]">No team members loaded.</div>
              ) : team.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => createDm(m)}
                  className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] text-[color:var(--graphite-text)] transition hover:bg-[color:var(--panel-3)]"
                >
                  <MemberInitial id={m.id} members={team} />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  <span className="shrink-0 text-[10px] text-[color:var(--graphite-text-faint)]">{m.roleLabel}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-[color:var(--panel-line-soft)] bg-[color:var(--panel-2)] px-3 py-2">
        <button
          type="button"
          onClick={() => setState((current) => ({ ...current, activeRoomId: null }))}
          className="flex size-6 items-center justify-center rounded-[5px] text-[color:var(--graphite-text-muted)] transition hover:bg-[color:var(--panel-3)] hover:text-[color:var(--graphite-text)]"
          title="Back"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
        </button>
        <div className="flex min-w-0 items-center gap-1.5">
          {activeRoom.kind === "channel" ? (
            <Hash className="size-3.5 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
          ) : activeRoom.id === "dm:harwick" ? (
            <HarwickMark size={16} tone="soft" />
          ) : (
            <Users className="size-3.5 shrink-0 text-[color:var(--graphite-text-faint)]" aria-hidden="true" />
          )}
          <span className="truncate text-[12.5px] font-semibold text-[color:var(--graphite-text)]">{activeRoom.name}</span>
        </div>
      </div>

      <div ref={messagesRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {activeRoom.messages.map((message) => {
          if (message.authorId === "system") {
            return (
              <div key={message.id} className="my-2 flex items-center justify-center gap-2 text-[10.5px] text-[color:var(--graphite-text-faint)]">
                <span className="h-px flex-1 bg-[color:var(--panel-line-soft)]" aria-hidden="true" />
                <span className="rounded-full border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-2)] px-2 py-0.5">{message.body}</span>
                <span className="h-px flex-1 bg-[color:var(--panel-line-soft)]" aria-hidden="true" />
              </div>
            );
          }
          const isMe = message.authorId === currentMemberId || message.authorId === "me";
          const isHarwick = message.authorId === "harwick";
          return (
            <div key={message.id} className={cn("flex gap-2", isMe ? "justify-end" : "justify-start")}>
              {isMe ? null : (
                <div className="mt-0.5 shrink-0">
                  {isHarwick ? <HarwickMark size={20} tone="soft" /> : <MemberInitial id={message.authorId} members={team} />}
                </div>
              )}
              <div className="flex max-w-[80%] flex-col gap-1">
                {isMe ? null : (
                  <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[color:var(--graphite-text-muted)]">
                    {message.authorLabel}
                    {isHarwick ? (
                      <span className="rounded-[3px] bg-[var(--sage-soft)] px-1 py-0.5 text-[9px] uppercase tracking-[0.1em] text-[var(--sage)]">AI</span>
                    ) : null}
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-[12px] px-3 py-2 text-[12.5px] leading-[1.45] whitespace-pre-wrap",
                    isMe
                      ? "self-end rounded-tr-[4px] bg-white text-[color:var(--panel-0)]"
                      : isHarwick
                        ? "rounded-tl-[4px] border border-[var(--sage)]/30 bg-[var(--sage-soft)]/40 text-[color:var(--graphite-text)]"
                        : "rounded-tl-[4px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text)]",
                  )}
                >
                  {formatBody(message.body)}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-[color:var(--panel-line-soft)] bg-[color:var(--panel-2)] px-3 py-2.5">
        <div className="rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] px-2.5 py-2 transition focus-within:border-[color:var(--panel-line-strong)]">
          <textarea
            rows={1}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={activeRoom.kind === "channel" ? `Message #${activeRoom.name} — type @harwick to ask` : `Message ${activeRoom.name}`}
            className="block w-full resize-none bg-transparent text-[12.5px] leading-5 text-[color:var(--graphite-text)] outline-none placeholder:text-[color:var(--graphite-text-faint)]"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="rounded-[4px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--graphite-text-muted)]">
              ⌘↵
            </span>
            <span className="text-[10.5px] text-[color:var(--graphite-text-faint)]">to send</span>
            <button
              type="button"
              onClick={send}
              disabled={draft.trim().length === 0}
              className={cn(
                "ml-auto flex size-7 items-center justify-center rounded-[6px] transition",
                draft.trim().length === 0
                  ? "border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-faint)]"
                  : "bg-white text-[color:var(--panel-0)] hover:bg-white/90",
              )}
            >
              <Send className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
