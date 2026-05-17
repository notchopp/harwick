"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { CheckCircle2, Circle, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import type { WorkspaceOnboardingState } from "@realty-ops/core";

import { getPlanMaterial } from "../marketing/plan-card-material";

type SetupPageProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  initialState: WorkspaceOnboardingState;
  planTier: "free" | "solo" | "team" | "brokerage";
};

type BeatRow = {
  key: "identity" | "reply_examples" | "channel_intent";
  label: string;
  hint: string;
};

const BEATS: ReadonlyArray<BeatRow> = [
  {
    key: "identity",
    label: "Workspace identity",
    hint: "Type of operation, primary areas, voice.",
  },
  {
    key: "reply_examples",
    label: "Reply examples",
    hint: "3–8 past replies you've sent leads. Harwick matches your voice from these.",
  },
  {
    key: "channel_intent",
    label: "Channel intent",
    hint: "Which channels + how aggressive Harwick should be per channel.",
  },
];

function getOpenerMessage(operatorName: string, workspaceName: string): UIMessage {
  const firstName = operatorName.split(/\s+/)[0] ?? operatorName;
  return {
    id: "opener",
    role: "assistant",
    parts: [
      {
        type: "text",
        text: [
          `hey ${firstName.toLowerCase()}, welcome. i'm Harwick — i'll be running the front desk for ${workspaceName}.`,
          "",
          "give me a couple minutes here and i'll be ready to handle leads the way you would. three quick things.",
          "",
          "first — what kind of operation is this? solo agent, team, brokerage, wholesaler, property manager, developer, or something else?",
        ].join("\n"),
      },
    ],
  };
}

function readTextFromMessage(message: UIMessage): string {
  return message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function extractStateFromMessages(
  initial: WorkspaceOnboardingState,
  messages: UIMessage[],
): WorkspaceOnboardingState {
  // Walk tool-call outputs in chronological order; each set_/capture_/register_
  // tool result returns the new state under .state. The last one wins.
  let latest = initial;
  for (const message of messages) {
    for (const part of message.parts) {
      if (!part.type.startsWith("tool-")) continue;
      const toolPart = part as { state?: string; output?: unknown };
      if (toolPart.state !== "output-available") continue;
      const output = toolPart.output;
      if (output === null || typeof output !== "object") continue;
      const candidate = (output as { state?: { identityDone?: unknown; replyExamplesDone?: unknown; channelIntentDone?: unknown; completed?: unknown } }).state;
      if (candidate === undefined) continue;
      latest = {
        ...latest,
        identityDone: Boolean(candidate.identityDone ?? latest.identityDone),
        replyExamplesDone: Boolean(candidate.replyExamplesDone ?? latest.replyExamplesDone),
        channelIntentDone: Boolean(candidate.channelIntentDone ?? latest.channelIntentDone),
        completedAt: Boolean(candidate.completed) ? new Date().toISOString() : latest.completedAt,
      };
    }
  }
  return latest;
}

export function OnboardingSetupPage(props: SetupPageProps) {
  const material = useMemo(() => getPlanMaterial(props.planTier), [props.planTier]);
  const initialOpener = useMemo(
    () => getOpenerMessage(props.operatorName, props.workspaceName),
    [props.operatorName, props.workspaceName],
  );

  const { messages, sendMessage, status } = useChat({
    id: `onboarding-${props.workspaceId}`,
    transport: new DefaultChatTransport({
      api: `/api/workspaces/${props.workspaceId}/onboarding-chat`,
    }),
    messages: [initialOpener],
  });

  const [input, setInput] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const liveState = useMemo(
    () => extractStateFromMessages(props.initialState, messages),
    [messages, props.initialState],
  );
  const completed =
    liveState.completedAt !== null
    || (liveState.identityDone && liveState.replyExamplesDone && liveState.channelIntentDone);

  // Auto-redirect once Harwick finishes the closing message after all beats.
  useEffect(() => {
    if (!completed) return;
    if (status === "streaming" || status === "submitted") return;
    const timer = window.setTimeout(() => {
      window.location.assign("/home");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [completed, status]);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    const node = transcriptRef.current;
    if (node === null) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, status]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = input.trim();
    if (trimmed.length === 0) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0d0f] px-5 py-8 text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: material.background, opacity: 0.35 }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,0,0,0)_0%,rgba(0,0,0,0.55)_85%)]"
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-64px)] w-full max-w-[920px] flex-col">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="font-display text-[11px] uppercase tracking-[0.18em] text-white/45">
              step 2 of 2 · {props.workspaceName}
            </div>
            <h1 className="mt-2 font-display text-[26px] font-medium leading-tight tracking-[-0.01em] sm:text-[30px]">
              Let's get Harwick set up.
            </h1>
            <p className="mt-1 text-[13.5px] leading-5 text-white/65">
              A real conversation, not a form. Three quick things and you're live.
            </p>
          </div>
          <a
            href="/home"
            className="self-start rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/65 transition hover:border-white/30 hover:text-white"
          >
            Skip for now
          </a>
        </header>

        <BeatProgress state={liveState} />

        <section className="relative mt-6 flex flex-1 flex-col rounded-[18px] border border-white/10 bg-white/[0.03]">
          <div
            ref={transcriptRef}
            className="flex-1 space-y-5 overflow-y-auto px-5 py-5"
            style={{ scrollbarWidth: "thin" }}
          >
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            {status === "submitted" || status === "streaming" ? (
              <div className="flex items-center gap-2 text-[11.5px] text-white/40">
                <span className="size-1.5 animate-pulse rounded-full bg-white/45" />
                Harwick is thinking…
              </div>
            ) : null}
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 border-t border-white/10 px-3 py-3"
          >
            <textarea
              autoFocus
              className="min-h-[44px] max-h-[160px] flex-1 resize-none rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[14px] leading-5 text-white placeholder-white/35 outline-none transition focus:border-white/30 focus:bg-white/[0.06]"
              disabled={completed && status !== "streaming"}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  (event.currentTarget.form as HTMLFormElement | null)?.requestSubmit();
                }
              }}
              placeholder={
                completed
                  ? "Setup complete — heading to your workspace…"
                  : "Type a reply… (Enter to send, Shift+Enter for new line)"
              }
              rows={1}
              value={input}
            />
            <button
              type="submit"
              disabled={input.trim().length === 0 || status === "submitted" || status === "streaming"}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-white px-4 text-[13px] font-semibold text-[#0a0d0f] transition hover:brightness-105 disabled:opacity-50"
            >
              <Send className="size-3.5" aria-hidden="true" />
              Send
            </button>
          </form>
        </section>

        {completed ? (
          <div
            className="mt-4 rounded-[12px] border px-4 py-3 text-[12.5px]"
            style={{
              borderColor: material.ringColor,
              background: `${material.accentColor}10`,
              color: material.accentColor,
            }}
          >
            All set — taking you to {props.workspaceName} now.
          </div>
        ) : null}
      </div>
    </main>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const text = readTextFromMessage(message);
  if (text.length === 0) {
    // Skip empty assistant frames that only carry tool calls — the next
    // assistant text message will follow.
    return null;
  }
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[78%] whitespace-pre-wrap rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-5",
          isUser
            ? "bg-white text-[#0a0d0f]"
            : "border border-white/10 bg-white/[0.04] text-white/92",
        ].join(" ")}
      >
        {text}
      </div>
    </div>
  );
}

function BeatProgress({ state }: { state: WorkspaceOnboardingState }) {
  const beatsDone: Record<BeatRow["key"], boolean> = {
    identity: state.identityDone,
    reply_examples: state.replyExamplesDone,
    channel_intent: state.channelIntentDone,
  };

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {BEATS.map((beat) => {
        const done = beatsDone[beat.key];
        return (
          <div
            key={beat.key}
            className={[
              "flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5 transition",
              done
                ? "border-emerald-400/30 bg-emerald-400/5"
                : "border-white/10 bg-white/[0.025]",
            ].join(" ")}
          >
            {done ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-white/30" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <div
                className={[
                  "text-[12px] font-semibold",
                  done ? "text-emerald-200" : "text-white/85",
                ].join(" ")}
              >
                {beat.label}
              </div>
              <div className="mt-0.5 text-[11px] leading-4 text-white/45">{beat.hint}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
