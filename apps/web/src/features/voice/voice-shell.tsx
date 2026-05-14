"use client";

import { ArrowLeft, Loader2, Mic, MicOff, Pause, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/utils";

type VoiceShellProps = {
  workspaceId: string;
  workspaceName: string;
  operatorName: string;
  initialQuery: string | null;
  autoStart: boolean;
};

type Turn = {
  id: string;
  question: string;
  answer: string;
  state: "asking" | "thinking" | "speaking" | "done" | "error";
  error?: string;
};

type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.02;
  utter.pitch = 1;
  utter.volume = 1;
  // Pick a Siri-ish voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find((v) => /siri|samantha|alex|daniel|google us english/i.test(v.name) && v.lang.startsWith("en"))
    ?? voices.find((v) => v.lang.startsWith("en-"));
  if (preferred !== undefined) utter.voice = preferred;
  utter.onend = () => onEnd?.();
  window.speechSynthesis.speak(utter);
}

export function VoiceShell(props: VoiceShellProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [muted, setMuted] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const handledInitialRef = useRef(false);

  const updateLastTurn = useCallback((updater: (turn: Turn) => Turn) => {
    setTurns((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      const lastIndex = next.length - 1;
      const last = next[lastIndex];
      if (last !== undefined) next[lastIndex] = updater(last);
      return next;
    });
  }, []);

  const askHarwick = useCallback(async (question: string) => {
    const text = question.trim();
    if (text.length === 0) return;
    const id = `t-${Date.now()}`;
    setTurns((current) => [...current, { id, question: text, answer: "", state: "thinking" }]);

    try {
      const response = await fetch(`/api/workspaces/${props.workspaceId}/harwick-assistant`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ message: text, stream: false, mentions: [], activeLeadId: null }),
      });
      if (!response.ok) throw new Error(`Harwick returned ${response.status}`);
      const payload = (await response.json()) as { answer?: string };
      const answer = typeof payload.answer === "string" && payload.answer.length > 0
        ? payload.answer
        : "I'm here. Could you say that again?";

      updateLastTurn((turn) => ({ ...turn, answer, state: muted ? "done" : "speaking" }));

      if (!muted) {
        speak(answer, () => {
          updateLastTurn((turn) => (turn.state === "speaking" ? { ...turn, state: "done" } : turn));
        });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Harwick is offline right now.";
      updateLastTurn((turn) => ({ ...turn, state: "error", error: message }));
    }
  }, [muted, props.workspaceId, updateLastTurn]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (Ctor === null) {
      setSupported(false);
      return;
    }
    if (listening) return;

    const recognition = new Ctor();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    setListening(true);
    setInterim("");

    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result === undefined) continue;
        const alt = result[0];
        if (alt === undefined) continue;
        if (result.isFinal) finalText += alt.transcript;
        else interimText += alt.transcript;
      }
      if (interimText.length > 0) setInterim(interimText);
      if (finalText.length > 0) {
        setInterim("");
        recognition.stop();
        void askHarwick(finalText);
      }
    };
    recognition.onerror = (event) => {
      console.warn("Voice: recognition error", event.error);
      setListening(false);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };

    try {
      recognition.start();
    } catch (err) {
      console.warn("Voice: failed to start recognition", err);
      setListening(false);
    }
  }, [askHarwick, listening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current !== null) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  // Initial query from URL → auto-ask
  useEffect(() => {
    if (handledInitialRef.current) return;
    handledInitialRef.current = true;
    const initial = props.initialQuery?.trim() ?? "";
    if (initial.length > 0) {
      void askHarwick(initial);
    } else if (props.autoStart) {
      // Give the user a beat before opening the mic.
      const t = window.setTimeout(() => startListening(), 350);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [askHarwick, props.autoStart, props.initialQuery, startListening]);

  // Screen Wake Lock — keep the screen on while in voice mode.
  useEffect(() => {
    let cancelled = false;

    async function lock() {
      if (typeof navigator === "undefined") return;
      const wakeApi = (navigator as unknown as { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
      if (wakeApi === undefined) return;
      try {
        const sentinel = await wakeApi.request("screen");
        if (cancelled) {
          await sentinel.release();
        } else {
          wakeLockRef.current = sentinel;
        }
      } catch {
        // permission denied — ignore
      }
    }

    void lock();

    return () => {
      cancelled = true;
      void wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopListening();
    };
  }, [stopListening]);

  const lastTurn = turns[turns.length - 1] ?? null;
  const status: "idle" | "listening" | "thinking" | "speaking" | "error" = listening
    ? "listening"
    : lastTurn?.state === "thinking"
      ? "thinking"
      : lastTurn?.state === "speaking"
        ? "speaking"
        : lastTurn?.state === "error"
          ? "error"
          : "idle";

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 5) return "Up late";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();
  const firstName = props.operatorName.trim().split(/\s+/)[0] ?? props.operatorName;

  return (
    <div
      className="harwick-shell-dark flex min-h-screen flex-col bg-[color:var(--panel-0)] text-[color:var(--graphite-text)]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <a
          href="/home"
          className="flex size-9 items-center justify-center rounded-[10px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] transition active:bg-[color:var(--panel-3)]"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </a>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--graphite-text-faint)]">
            {props.workspaceName} · voice
          </div>
          <div className="truncate text-[14px] font-semibold tracking-[-0.005em] text-[color:var(--graphite-text)]">
            Hey, harwick
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setMuted((current) => {
              const next = !current;
              if (next && typeof window !== "undefined" && "speechSynthesis" in window) {
                window.speechSynthesis.cancel();
              }
              return next;
            });
          }}
          className={cn(
            "flex size-9 items-center justify-center rounded-[10px] border transition",
            muted
              ? "border-[var(--oxblood)]/40 bg-[var(--oxblood-soft)] text-[var(--oxblood)]"
              : "border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text-muted)] active:bg-[color:var(--panel-3)]",
          )}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <Pause className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
        </button>
      </header>

      <main className="flex flex-1 flex-col items-center justify-end px-5 pb-8">
        <div className="flex w-full flex-1 flex-col items-center justify-center text-center">
          {turns.length === 0 ? (
            <>
              <div className="font-display text-[36px] font-semibold leading-[1.02] tracking-[-0.025em] text-[color:var(--graphite-text)]">
                {greeting}, {firstName.toLowerCase()}.
              </div>
              <p className="mt-3 max-w-[280px] text-[13.5px] leading-5 text-[color:var(--graphite-text-muted)]">
                Tap and talk. I&apos;ll listen, run the tools, and speak the answer back.
              </p>
            </>
          ) : (
            <div className="w-full max-w-md space-y-4">
              {turns.slice(-3).map((turn) => (
                <div key={turn.id} className="space-y-2">
                  <div className="rounded-[var(--panel-radius-md)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-4 py-3 text-left text-[14px] leading-5">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--graphite-text-faint)]">you</div>
                    {turn.question}
                  </div>
                  <div className="rounded-[var(--panel-radius-md)] border border-[var(--sage)]/25 bg-[var(--sage-soft)]/40 px-4 py-3 text-left text-[14px] leading-5">
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--sage)]">
                      harwick
                      {turn.state === "thinking" ? <Loader2 className="size-3 animate-spin" aria-hidden="true" /> : null}
                      {turn.state === "speaking" ? <Volume2 className="size-3" aria-hidden="true" /> : null}
                    </div>
                    {turn.state === "error" ? (
                      <span className="text-[var(--oxblood)]">{turn.error}</span>
                    ) : turn.answer.length === 0 ? (
                      <span className="italic text-[color:var(--graphite-text-muted)]">thinking…</span>
                    ) : (
                      turn.answer
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {interim.length > 0 ? (
            <div className="mt-4 text-[13px] italic text-[color:var(--graphite-text-muted)]">{interim}…</div>
          ) : null}
        </div>

        {/* Mic button */}
        <div className="mt-6 flex w-full flex-col items-center gap-3">
          <motion.button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={!supported}
            className={cn(
              "relative flex size-24 items-center justify-center rounded-full border-2 disabled:cursor-not-allowed disabled:opacity-50",
              listening
                ? "border-[var(--oxblood)]/60 bg-[var(--oxblood-soft)] text-[var(--oxblood)]"
                : status === "thinking"
                  ? "border-[var(--clay)]/40 bg-[var(--clay-soft)] text-[var(--clay)]"
                  : status === "speaking"
                    ? "border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)]"
                    : "border-[color:var(--panel-line-strong)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text)] shadow-[var(--panel-inset-top),0_8px_24px_-8px_rgba(0,0,0,0.6)]",
            )}
            aria-label={listening ? "Stop listening" : "Start listening"}
            whileTap={{ scale: 0.94 }}
            animate={{
              scale: listening || status === "speaking" ? [1, 1.04, 1] : 1,
            }}
            transition={{
              scale: listening || status === "speaking"
                ? { repeat: Infinity, duration: 1.6, ease: "easeInOut" }
                : { type: "spring", stiffness: 320, damping: 26 },
            }}
          >
            {/* Pulse rings — only when listening or speaking */}
            <AnimatePresence>
              {(listening || status === "speaking") ? (
                <>
                  <motion.span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-0 rounded-full border-2",
                      listening ? "border-[var(--oxblood)]/40" : "border-[var(--sage)]/40",
                    )}
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 1.55, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  />
                  <motion.span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-0 rounded-full border-2",
                      listening ? "border-[var(--oxblood)]/30" : "border-[var(--sage)]/30",
                    )}
                    initial={{ scale: 1, opacity: 0.5 }}
                    animate={{ scale: 1.85, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                  />
                </>
              ) : null}
            </AnimatePresence>
            {/* Thinking spinner ring */}
            {status === "thinking" ? (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--clay)]"
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              />
            ) : null}
            <motion.span
              key={listening ? "off" : "on"}
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 340, damping: 22 }}
            >
              {listening ? <MicOff className="size-9" aria-hidden="true" strokeWidth={1.8} /> : <Mic className="size-9" aria-hidden="true" strokeWidth={1.8} />}
            </motion.span>
          </motion.button>
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--graphite-text-faint)]">
              {status === "listening"
                ? "listening"
                : status === "thinking"
                  ? "harwick is thinking"
                  : status === "speaking"
                    ? "harwick is talking"
                    : status === "error"
                      ? "something went wrong"
                      : "tap to talk"}
            </div>
            {!supported ? (
              <div className="mt-1 max-w-[260px] text-[11.5px] text-[color:var(--graphite-text-muted)]">
                Your browser doesn&apos;t support voice. Open Harwick in Safari on iPhone or Chrome on desktop.
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
