"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  Bookmark,
  ChevronLeft,
  Check,
  Hash,
  Heart,
  MessageCircle,
  MessageSquare,
  Phone,
  Send,
  Voicemail,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FacebookGlyph, InstagramGlyph } from "../../components/harwick-icons";
import { cn } from "../../lib/utils";

/**
 * Hero showcase.
 *
 *   LEFT — Instagram-style post (the source).
 *   RIGHT — phone that IS the Harwick app: stats banner on top,
 *           channel-stamped inbox below, tap a row to drill into that
 *           thread, back to return. Auto-cycles through ~5 sample
 *           conversations so the demo plays itself.
 *
 * Hovering anywhere pauses every timer. Tapping an inbox row jumps the
 * cycle to that thread; tapping back returns to the inbox.
 */

// =====================================================================
// Threads (the sample conversations cycled in the phone)
// =====================================================================

type ThreadChannel = "ig_dm" | "fb_dm" | "sms" | "phone";

type Msg = {
  id: string;
  who: "lead" | "harwick" | "system";
  body: string;
  meta: string;
  atMs: number;
};

type Thread = {
  id: string;
  contactName: string;
  initials: string;
  avatarColor: string;
  channel: ThreadChannel;
  channelLabel: string;
  tags: ReadonlyArray<string>;
  inboxPreview: string;
  inboxClock: string;
  status: "active" | "drafted" | "routed" | "review";
  script: ReadonlyArray<Msg>;
  draft?: { atMs: number; sentAtMs: number; body: string };
  durationMs: number;
};

const THREADS: ReadonlyArray<Thread> = [
  {
    id: "mia",
    contactName: "Mia Carter",
    initials: "MC",
    avatarColor: "#7ba6ff",
    channel: "ig_dm",
    channelLabel: "Instagram DM",
    tags: ["Bellaire", "$750–825k", "pre-approved", "score 88"],
    inboxPreview: "Pre-approved with Wells, wants Sat tour",
    inboxClock: "11:47 PM",
    status: "drafted",
    script: [
      { id: "mia-1", who: "lead", body: "Hi! Saw your post about 4126 Maple", meta: "11:46 PM", atMs: 1800 },
      { id: "mia-2", who: "lead", body: "Is this still on the market? Relocating from Austin in June", meta: "11:46 PM", atMs: 2800 },
      { id: "mia-3", who: "lead", body: "Pre-approved with Wells for up to $825k", meta: "11:47 PM", atMs: 3800 },
      { id: "mia-4", who: "harwick", body: "Hi Mia — 4126 Maple is still active. Sarah covers Bellaire and has Saturday open at 11am or 2pm. Which works?", meta: "Sent · 7:03 AM", atMs: 8200 },
      { id: "mia-5", who: "lead", body: "Saturday 11 works perfectly — what should I bring?", meta: "8:14 AM", atMs: 10000 },
      { id: "mia-6", who: "harwick", body: "Just yourself + a driver's license. Sending Sarah's contact info now.", meta: "Sent · 8:15 AM", atMs: 11500 },
    ],
    draft: {
      atMs: 4800,
      sentAtMs: 8200,
      body: "Hi Mia — 4126 Maple is still active. Sarah covers Bellaire and has Saturday open at 11am or 2pm. Which works?",
    },
    durationMs: 13500,
  },
  {
    id: "omar",
    contactName: "Omar Banks",
    initials: "OB",
    avatarColor: "#e3a067",
    channel: "phone",
    channelLabel: "Voicemail · Retell",
    tags: ["Houston", "$220–285k", "voicemail"],
    inboxPreview: "Voicemail — wants showing this week",
    inboxClock: "10:54 AM",
    status: "routed",
    script: [
      { id: "omar-0", who: "system", body: "Voicemail captured · transcribed by Retell", meta: "10:54 AM", atMs: 800 },
      { id: "omar-1", who: "lead", body: "Hey, calling about 4126 Maple. I'd love to set up a showing this week. My number is 832-555-0101.", meta: "10:54 AM", atMs: 2200 },
      { id: "omar-2", who: "harwick", body: "Voicemail → SMS callback drafted. Routed to Malik (Houston coverage). Pre-approval ask included.", meta: "Sent · 10:55 AM", atMs: 6000 },
      { id: "omar-3", who: "lead", body: "[SMS] Friday 5pm works — and yes pre-approved for $260k. Thanks!", meta: "11:08 AM", atMs: 9000 },
    ],
    durationMs: 11500,
  },
  {
    id: "kira",
    contactName: "Kira Henley",
    initials: "KH",
    avatarColor: "#7bcf85",
    channel: "sms",
    channelLabel: "SMS · Twilio",
    tags: ["Bellaire", "first-time buyer"],
    inboxPreview: "Saw IG post — can I tour Saturday?",
    inboxClock: "9:32 AM",
    status: "routed",
    script: [
      { id: "kira-1", who: "lead", body: "Hi! Saw your IG post about 4126 Maple. Can I tour Saturday?", meta: "9:32 AM", atMs: 1600 },
      { id: "kira-2", who: "harwick", body: "Hi Kira — 4126 Maple is active. Sarah has Sat 11am or 2pm open. Which works?", meta: "Sent · 9:33 AM", atMs: 4200 },
      { id: "kira-3", who: "lead", body: "11am pls", meta: "9:34 AM", atMs: 6200 },
      { id: "kira-4", who: "harwick", body: "Booked. Sarah will text 30 min before with the address & gate code.", meta: "Sent · 9:34 AM", atMs: 7500 },
    ],
    durationMs: 9500,
  },
  {
    id: "adam",
    contactName: "Adam Reyes",
    initials: "AR",
    avatarColor: "#b793e6",
    channel: "fb_dm",
    channelLabel: "Facebook Messenger",
    tags: ["investor", "12% cap target", "flagged"],
    inboxPreview: "Investor inquiry — flagged for owner",
    inboxClock: "8:18 AM",
    status: "review",
    script: [
      { id: "adam-1", who: "lead", body: "Investor here — looking at multi-family in Bellaire. Is 4126 Maple a single? What's the cap rate?", meta: "8:18 AM", atMs: 1800 },
      { id: "adam-2", who: "harwick", body: "Flagged for owner review · investor inquiry requires manual handling. Ademola will reach out within 1 hour.", meta: "8:19 AM", atMs: 5000 },
      { id: "adam-3", who: "lead", body: "Sounds good, thanks", meta: "8:21 AM", atMs: 7000 },
    ],
    durationMs: 9000,
  },
  {
    id: "jess",
    contactName: "Jess Park",
    initials: "JP",
    avatarColor: "#f0a3c1",
    channel: "ig_dm",
    channelLabel: "Instagram DM",
    tags: ["out of state", "virtual tour"],
    inboxPreview: "Wants virtual tour — out of state",
    inboxClock: "7:46 AM",
    status: "active",
    script: [
      { id: "jess-1", who: "lead", body: "Hi! Can I do a virtual walkthrough? I'm out of state until June.", meta: "7:46 AM", atMs: 1600 },
      { id: "jess-2", who: "harwick", body: "Hi Jess — virtual tours available. Sarah has Tuesday 6pm or Thursday 5pm CT. Which works?", meta: "Sent · 7:47 AM", atMs: 4200 },
      { id: "jess-3", who: "lead", body: "Tuesday 6pm works", meta: "7:48 AM", atMs: 6200 },
      { id: "jess-4", who: "harwick", body: "Booked. Sarah will send the Zoom link Monday evening. We'll be ready.", meta: "Sent · 7:48 AM", atMs: 7800 },
    ],
    durationMs: 9500,
  },
];

const INBOX_DWELL_MS = 3500;
const SCHEDULE_MS = THREADS.reduce((acc, t) => acc + INBOX_DWELL_MS + t.durationMs, 0);

function whatToShow(elapsedMs: number): {
  mode: "inbox" | "thread";
  threadId: string;
  threadElapsedMs: number;
  inboxOpeningId: string;
} {
  let t = elapsedMs % SCHEDULE_MS;
  for (const thread of THREADS) {
    if (t < INBOX_DWELL_MS) {
      return { mode: "inbox", threadId: thread.id, threadElapsedMs: 0, inboxOpeningId: thread.id };
    }
    t -= INBOX_DWELL_MS;
    if (t < thread.durationMs) {
      return { mode: "thread", threadId: thread.id, threadElapsedMs: t, inboxOpeningId: thread.id };
    }
    t -= thread.durationMs;
  }
  return { mode: "inbox", threadId: THREADS[0]!.id, threadElapsedMs: 0, inboxOpeningId: THREADS[0]!.id };
}

function elapsedForOpeningThread(threadId: string): number {
  // Returns the elapsed time that puts us right at the start of that
  // thread's playback (just after the inbox dwell).
  let t = 0;
  for (const thread of THREADS) {
    t += INBOX_DWELL_MS;
    if (thread.id === threadId) return t;
    t += thread.durationMs;
  }
  return 0;
}

// =====================================================================
// Root
// =====================================================================

export function HeroAnimatedShowcase() {
  const [isPaused, setIsPaused] = useState(false);
  return (
    <div
      className="relative grid w-full max-w-[1180px] items-start gap-8 lg:grid-cols-[1fr_minmax(0,340px)] lg:gap-12"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      <LeftColumn />
      {/* Phone column is pushed down on desktop so it sits below the IG card,
          creating an offset/staggered feel instead of two columns starting
          at the same baseline. */}
      <div className="relative justify-self-center lg:mt-24 lg:justify-self-end">
        <PhoneFrame isPaused={isPaused} />
        <PauseHint isPaused={isPaused} />
      </div>
    </div>
  );
}

function PauseHint({ isPaused }: { isPaused: boolean }) {
  return (
    <AnimatePresence>
      {isPaused ? (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute -bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] backdrop-blur-md"
          style={{
            background: "rgba(20,14,8,0.55)",
            border: "1px solid rgba(255,255,255,0.18)",
            color: "rgba(255,232,200,0.92)",
          }}
        >
          paused · move away to resume
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

// =====================================================================
// Left column — IG post only
// =====================================================================

function LeftColumn() {
  return (
    <div className="flex w-full max-w-[520px] flex-col gap-3 justify-self-center lg:justify-self-start">
      <PostContextStrip />
      <InstagramPostMockup />
    </div>
  );
}

function PostContextStrip() {
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-full px-3.5 py-1.5 text-[11px] backdrop-blur-md"
      style={{
        background: "rgba(20,14,8,0.42)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "rgba(255,232,200,0.78)",
      }}
    >
      <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-[0.1em]">
        <motion.span
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          className="inline-block size-1.5 rounded-full"
          style={{ background: "#9be0a3", boxShadow: "0 0 8px #9be0a3" }}
        />
        Live
      </span>
      <span className="truncate">Posted to Instagram + Facebook · 22 min ago</span>
    </div>
  );
}

type IgComment = {
  username: string;
  initials: string;
  avatarColor: string;
  body: string;
  time: string;
  likes?: number;
  harwick:
    | { kind: "reply"; body: string; meta: string; likes?: number }
    | { kind: "liked"; meta: string }
    | { kind: "flagged"; meta: string };
};

const IG_COMMENTS: ReadonlyArray<IgComment> = [
  {
    username: "miacarter",
    initials: "MC",
    avatarColor: "#7ba6ff",
    body: "is this still avail? relocating from austin 🙏",
    time: "2m",
    likes: 1,
    harwick: {
      kind: "reply",
      body: "Hi Mia! 4126 Maple is active. Sarah covers Bellaire and has Sat 11am or 2pm open — DM me to lock one in.",
      meta: "Replied · 1m",
      likes: 3,
    },
  },
  {
    username: "adam_buys_homes",
    initials: "AB",
    avatarColor: "#c98b5a",
    body: "HOA?",
    time: "4m",
    harwick: {
      kind: "reply",
      body: "$48/month — covers landscaping + community pool access.",
      meta: "Replied · 4m",
    },
  },
  {
    username: "bellaire_mom",
    initials: "BM",
    avatarColor: "#9be0a3",
    body: "what schools?",
    time: "6m",
    likes: 4,
    harwick: {
      kind: "reply",
      body: "Bellaire ISD — Condit Elementary (9/10), Pershing Middle, Bellaire High. Walking distance to Condit.",
      meta: "Replied · 6m",
      likes: 2,
    },
  },
  {
    username: "realestate_lover",
    initials: "RL",
    avatarColor: "#f0a3c1",
    body: "love that kitchen 😍",
    time: "9m",
    likes: 12,
    harwick: { kind: "liked", meta: "❤ liked" },
  },
  {
    username: "trev_realtor",
    initials: "TR",
    avatarColor: "#b793e6",
    body: "any room on price? open to offers?",
    time: "12m",
    harwick: { kind: "flagged", meta: "Flagged for owner review" },
  },
];

function InstagramPostMockup() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-[18px]"
      style={{
        background: "#0d0d0e",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 30px 80px -30px rgba(0,0,0,0.7)",
        color: "#fafafa",
      }}
    >
      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <div
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full p-[2px]"
          style={{
            background:
              "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
          }}
        >
          <div className="flex size-full items-center justify-center rounded-full p-[2px]" style={{ background: "#0d0d0e" }}>
            <div
              className="flex size-full items-center justify-center rounded-full text-[10px] font-bold"
              style={{ background: "linear-gradient(135deg,#9ab5aa 0%,#60786d 100%)", color: "#0c1410" }}
            >
              BL
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 truncate text-[13px] font-semibold">
            bellaireliving
            <svg className="size-3" viewBox="0 0 16 16" aria-hidden="true">
              <path
                fill="#3897f0"
                d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.86 5.59l-4.6 4.59a.5.5 0 01-.71 0L4.14 8.78a.5.5 0 010-.71l.71-.71a.5.5 0 01.71 0L7 8.85l3.93-3.93a.5.5 0 01.71 0l.71.71a.5.5 0 010 .71z"
              />
            </svg>
          </div>
          <div className="text-[10.5px]" style={{ color: "rgba(250,250,250,0.55)" }}>Houston, TX · Real estate</div>
        </div>
        <button type="button" aria-label="more" className="text-[18px] leading-none" style={{ color: "rgba(250,250,250,0.7)" }}>
          ⋯
        </button>
      </div>

      <div
        aria-hidden="true"
        className="relative w-full bg-cover bg-center"
        style={{ backgroundImage: "url(/marketing/hero-house.jpg)", aspectRatio: "5 / 4" }}
      >
        <div
          className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
          style={{ background: "rgba(0,0,0,0.5)", color: "#fff", backdropFilter: "blur(6px)" }}
        >
          1/8
        </div>
      </div>

      <div className="flex items-center gap-3 px-3 pt-3">
        <Heart className="size-5" style={{ color: "#fff" }} aria-hidden="true" strokeWidth={1.7} />
        <MessageCircle className="size-5" style={{ color: "#fff" }} aria-hidden="true" strokeWidth={1.7} />
        <Send className="size-5" style={{ color: "#fff" }} aria-hidden="true" strokeWidth={1.7} />
        <Bookmark className="ml-auto size-5" style={{ color: "#fff" }} aria-hidden="true" strokeWidth={1.7} />
      </div>

      <div className="px-3 pt-2 text-[12px]">
        <span className="font-semibold">Liked by </span>
        <span className="font-semibold">sarah_realtor</span>
        <span style={{ color: "rgba(250,250,250,0.75)" }}> and </span>
        <span className="font-semibold">2,846 others</span>
      </div>

      <div className="px-3 pt-1.5 text-[12.5px] leading-[1.45]" style={{ color: "rgba(250,250,250,0.86)" }}>
        <span className="font-semibold" style={{ color: "#fff" }}>bellaireliving</span>{" "}
        Just listed in Bellaire — 4126 Maple. $795,000 · 3 bed / 2 bath / 1,840 sf. Updated kitchen, detached garage, quiet street. DM us for showings.
        {" "}
        <span style={{ color: "#5A8DEF" }}>#houston #realestate #bellaire #justlisted</span>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block w-full px-3 pt-2 text-left text-[12px] transition hover:text-white"
        style={{ color: "rgba(250,250,250,0.55)" }}
      >
        {expanded ? "Hide" : "View all"}{" "}
        <span className="font-semibold" style={{ color: "rgba(250,250,250,0.85)" }}>247</span>{" "}
        comments
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="comments"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <ul
              className="mt-2 flex flex-col"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              {IG_COMMENTS.map((comment, i) => (
                <li
                  key={i}
                  className="px-3 py-2.5"
                  style={{
                    borderBottom:
                      i === IG_COMMENTS.length - 1 ? "none" : "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  <IgCommentRow comment={comment} />
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <motion.div
            key="preview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="px-3 pt-1 text-[12px]"
            style={{ color: "rgba(250,250,250,0.86)" }}
          >
            <span className="font-semibold" style={{ color: "#fff" }}>miacarter</span>{" "}
            <span style={{ color: "rgba(250,250,250,0.78)" }}>is this still avail? relocating from austin 🙏</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-3 pb-3 pt-2 text-[10px] uppercase tracking-[0.08em]" style={{ color: "rgba(250,250,250,0.45)" }}>
        22 minutes ago
      </div>
    </div>
  );
}

function IgCommentRow({ comment }: { comment: IgComment }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
        style={{ background: comment.avatarColor, color: "#0c1410" }}
      >
        {comment.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] leading-[1.45]" style={{ color: "rgba(250,250,250,0.86)" }}>
          <span className="font-semibold" style={{ color: "#fff" }}>{comment.username}</span>{" "}
          {comment.body}
        </div>
        <div
          className="mt-1 flex items-center gap-3 text-[10.5px]"
          style={{ color: "rgba(250,250,250,0.5)" }}
        >
          <span>{comment.time}</span>
          {comment.likes !== undefined ? (
            <span className="inline-flex items-center gap-0.5">
              <Heart className="size-2.5" aria-hidden="true" /> {comment.likes}
            </span>
          ) : (
            <span className="inline-flex items-center gap-0.5">
              <Heart className="size-2.5" aria-hidden="true" />
            </span>
          )}
          <button type="button" className="font-semibold hover:text-white">Reply</button>
        </div>

        {/* Harwick threaded action */}
        <div className="mt-2.5 flex items-start gap-2.5 rounded-[10px] px-2.5 py-2" style={{ background: "rgba(154,181,170,0.06)", border: "1px solid rgba(154,181,170,0.22)" }}>
          <HarwickGlyph size={20} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold" style={{ color: "#b6d1c5" }}>harwick</span>
              <span className="text-[10px] uppercase tracking-[0.08em]" style={{ color: "rgba(250,250,250,0.42)" }}>
                replied via Harwick
              </span>
            </div>
            {comment.harwick.kind === "reply" ? (
              <>
                <div className="mt-1 text-[12px] leading-[1.5]" style={{ color: "rgba(250,250,250,0.92)" }}>
                  {comment.harwick.body}
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[10.5px]" style={{ color: "rgba(250,250,250,0.5)" }}>
                  <span>{comment.harwick.meta}</span>
                  {comment.harwick.likes !== undefined ? (
                    <span className="inline-flex items-center gap-0.5">
                      <Heart className="size-2.5" aria-hidden="true" /> {comment.harwick.likes}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1" style={{ color: "#9be0a3" }}>
                    <Check className="size-2.5" aria-hidden="true" /> Sent
                  </span>
                </div>
              </>
            ) : comment.harwick.kind === "liked" ? (
              <div className="mt-1 inline-flex items-center gap-1.5 text-[11.5px]" style={{ color: "rgba(250,250,250,0.78)" }}>
                <Heart className="size-3" aria-hidden="true" style={{ color: "#f76e8b", fill: "#f76e8b" }} />
                Liked the comment
              </div>
            ) : (
              <div className="mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ background: "rgba(255,180,90,0.14)", borderColor: "rgba(255,180,90,0.35)", color: "#ffc488" }}>
                {comment.harwick.meta}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Phone — the mini Harwick app
// =====================================================================

function PhoneFrame({ isPaused }: { isPaused: boolean }) {
  // Single elapsed tick. The schedule decides what's on screen at any
  // given elapsed value (inbox dwell → thread playback → next inbox dwell
  // → next thread → …).
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (isPaused) return;
    const interval = window.setInterval(() => {
      elapsedRef.current = (elapsedRef.current + 100) % SCHEDULE_MS;
      setElapsedMs(elapsedRef.current);
    }, 100);
    return () => window.clearInterval(interval);
  }, [isPaused]);

  const current = whatToShow(elapsedMs);
  const currentThread = THREADS.find((t) => t.id === current.threadId) ?? THREADS[0]!;

  const openThread = (threadId: string) => {
    const t = elapsedForOpeningThread(threadId);
    elapsedRef.current = t;
    setElapsedMs(t);
  };
  const goBackToInbox = () => {
    // Jump to the start of the dwell window for the current thread so the
    // inbox highlights "opening next" cleanly.
    const t = elapsedForOpeningThread(current.threadId) - INBOX_DWELL_MS;
    const safeT = Math.max(0, t);
    elapsedRef.current = safeT;
    setElapsedMs(safeT);
  };

  const handleApprove = () => {
    // Mia's draft → jump straight to her reply-sent moment.
    if (current.threadId !== "mia") return;
    const mia = THREADS.find((t) => t.id === "mia")!;
    const t = elapsedForOpeningThread("mia") + (mia.draft?.sentAtMs ?? 0);
    elapsedRef.current = t;
    setElapsedMs(t);
  };

  return (
    <motion.div
      initial={{ rotate: -3, y: 8, opacity: 0 }}
      animate={{ rotate: -3, y: [0, -4, 0], opacity: 1 }}
      transition={{
        opacity: { duration: 0.8 },
        rotate: { duration: 0.8 },
        y: { duration: 6, repeat: Infinity, ease: "easeInOut" },
      }}
      className="relative"
    >
      <div
        aria-hidden="true"
        className="absolute -inset-x-6 -inset-y-8 -z-10 rounded-[60px]"
        style={{ background: "radial-gradient(70% 60% at 50% 60%, rgba(154,181,170,0.16), transparent 75%)" }}
      />

      <div
        className="relative overflow-hidden"
        style={{
          width: 320,
          height: 660,
          borderRadius: 40,
          background: "linear-gradient(180deg, #14171a 0%, #0c0e0f 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(0,0,0,0.55), 0 40px 70px -20px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.45)",
        }}
      >
        <div
          className="absolute inset-[5px] flex flex-col overflow-hidden"
          style={{
            borderRadius: 34,
            background: "linear-gradient(180deg, #0b0c0d 0%, #0e0f11 100%)",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          <PhoneStatusBar />
          <AnimatePresence mode="wait">
            {current.mode === "inbox" ? (
              <motion.div
                key="inbox"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <PhoneStatsBanner />
                <InboxList openingId={current.inboxOpeningId} onTap={openThread} />
              </motion.div>
            ) : (
              <motion.div
                key={`thread-${current.threadId}`}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <ThreadHeader thread={currentThread} onBack={goBackToInbox} />
                <ThreadBody thread={currentThread} elapsedMs={current.threadElapsedMs} />
                <ThreadComposer
                  thread={currentThread}
                  elapsedMs={current.threadElapsedMs}
                  onApprove={handleApprove}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

function PhoneStatusBar() {
  return (
    <div className="flex h-7 shrink-0 items-center justify-between px-5 pt-2 text-[10.5px] font-semibold text-white/68">
      <span style={{ fontVariantNumeric: "tabular-nums" }}>10:24</span>
      <div className="flex items-center gap-1">
        <span className="flex items-end gap-[1.5px]">
          {[3, 5, 7, 9].map((h) => (
            <span key={h} className="rounded-[1px] bg-white/68" style={{ width: 2, height: h }} />
          ))}
        </span>
        <span className="ml-1 inline-flex h-2.5 w-5 items-center rounded-[2px] border border-white/52 px-[1px]">
          <span className="block h-full w-[80%] rounded-[1px] bg-white/68" />
        </span>
      </div>
    </div>
  );
}

function HarwickGlyph({ size = 18 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[5px]"
      style={{
        width: size,
        height: size,
        background: "linear-gradient(135deg,#9ab5aa 0%,#60786d 100%)",
        boxShadow: "0 0 0 1px rgba(154,181,170,0.4) inset",
      }}
    >
      <span style={{ color: "#0c1410", fontWeight: 800, fontSize: size * 0.5, lineHeight: 1 }}>H</span>
    </span>
  );
}

// =====================================================================
// Phone — stats banner (top of inbox view)
// =====================================================================

function PhoneStatsBanner() {
  // Counter ticks within the banner itself — independent of thread cycle
  // so it always feels live regardless of which view is showing.
  const [counts, setCounts] = useState({ replies: 234, routed: 11, tours: 7 });
  useEffect(() => {
    const tick = window.setInterval(() => {
      setCounts((prev) => {
        const replies = prev.replies + 1;
        const routed = prev.routed + (Math.random() < 0.12 ? 1 : 0);
        const tours = prev.tours + (Math.random() < 0.06 ? 1 : 0);
        if (replies > 312 || routed > 22 || tours > 14) return { replies: 234, routed: 11, tours: 7 };
        return { replies, routed, tours };
      });
    }, 900);
    return () => window.clearInterval(tick);
  }, []);

  return (
    <div
      className="shrink-0 px-3 py-2.5"
      style={{
        background: "linear-gradient(180deg, rgba(154,181,170,0.10) 0%, rgba(20,14,8,0.0) 100%)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between text-[9.5px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(255,232,200,0.55)" }}>
        <span>Since you posted · 22 min</span>
        <span className="inline-flex items-center gap-1.5" style={{ color: "#b6d1c5" }}>
          <motion.span
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            className="inline-block size-1.5 rounded-full"
            style={{ background: "#9be0a3", boxShadow: "0 0 6px #9be0a3" }}
          />
          16s avg
        </span>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-2 text-white">
        <StatTick label="Replies" value={counts.replies} tone="#b6d1c5" />
        <StatTick label="Routed" value={counts.routed} tone="#e3b78c" />
        <StatTick label="Tours" value={counts.tours} tone="#9be0a3" />
      </div>
    </div>
  );
}

function StatTick({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="text-[20px] font-semibold leading-none tracking-[-0.02em]" style={{ color: tone, fontVariantNumeric: "tabular-nums" }}>
        <motion.span key={value} initial={{ opacity: 0.5, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }} className="inline-block">
          {value}
        </motion.span>
      </div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(247,238,221,0.55)" }}>
        {label}
      </div>
    </div>
  );
}

// =====================================================================
// Inbox list
// =====================================================================

function InboxList({ openingId, onTap }: { openingId: string; onTap: (id: string) => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em]" style={{ color: "rgba(247,238,221,0.55)" }}>
        <span>Inbox · 53 from this post</span>
        <span className="text-[9px] opacity-70">tap any thread</span>
      </div>
      <ul className="flex-1 overflow-hidden">
        {THREADS.map((thread) => (
          <InboxRow key={thread.id} thread={thread} isOpening={thread.id === openingId} onTap={() => onTap(thread.id)} />
        ))}
      </ul>
    </div>
  );
}

function InboxRow({ thread, isOpening, onTap }: { thread: Thread; isOpening: boolean; onTap: () => void }) {
  const channel = CHANNEL_META[thread.channel];
  const ChannelIcon = channel.Icon;
  const status = STATUS_META[thread.status];
  return (
    <li>
      <button
        type="button"
        onClick={onTap}
        className="group block w-full px-3 py-2.5 text-left transition"
        style={{
          background: isOpening ? "rgba(154,181,170,0.10)" : "transparent",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <div className="relative shrink-0">
            <div
              className="flex size-9 items-center justify-center rounded-full text-[11px] font-bold"
              style={{ background: thread.avatarColor, color: "#0c1410" }}
            >
              {thread.initials}
            </div>
            <span
              aria-hidden="true"
              className="absolute -bottom-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full"
              style={{ background: channel.bg, boxShadow: "0 0 0 1.5px #0b0c0d" }}
            >
              <ChannelIcon className="size-2" aria-hidden="true" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[12.5px] font-semibold text-white">{thread.contactName}</span>
              <span className="shrink-0 font-mono text-[9.5px]" style={{ color: "rgba(247,238,221,0.42)" }}>
                {thread.inboxClock}
              </span>
            </div>
            <div className="truncate text-[11px]" style={{ color: "rgba(247,238,221,0.62)" }}>
              {thread.inboxPreview}
            </div>
            <div className="mt-1 flex items-center gap-1">
              <span
                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0 text-[9px] font-semibold uppercase tracking-[0.08em]"
                style={{ borderColor: status.border, background: status.bg, color: status.fg }}
              >
                <status.Icon className="size-2" aria-hidden="true" />
                {status.label}
              </span>
              {isOpening ? (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-[9px] uppercase tracking-[0.12em]"
                  style={{ color: "rgba(182,209,197,0.75)" }}
                >
                  opening…
                </motion.span>
              ) : null}
            </div>
          </div>
        </div>
      </button>
    </li>
  );
}

// =====================================================================
// Thread view
// =====================================================================

function ThreadHeader({ thread, onBack }: { thread: Thread; onBack: () => void }) {
  const channel = CHANNEL_META[thread.channel];
  const ChannelIcon = channel.Icon;
  return (
    <div className="shrink-0 border-b px-3 py-2.5" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full transition hover:bg-white/[0.06]"
          style={{ color: "rgba(247,238,221,0.78)" }}
          aria-label="Back to inbox"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <div className="relative shrink-0">
          <div
            className="flex size-9 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: thread.avatarColor, color: "#0c1410" }}
          >
            {thread.initials}
          </div>
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 inline-flex size-3.5 items-center justify-center rounded-full"
            style={{ background: channel.bg, boxShadow: "0 0 0 1.5px #0b0c0d" }}
          >
            <ChannelIcon className="size-2" aria-hidden="true" />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-white">{thread.contactName}</div>
          <div className="flex items-center gap-1 text-[10.5px]" style={{ color: "rgba(255,255,255,0.52)" }}>
            <span>via {thread.channelLabel}</span>
            <span className="opacity-50">·</span>
            <span className="inline-flex items-center gap-0.5">
              <Hash className="size-2.5" aria-hidden="true" />
              4126 Maple
            </span>
          </div>
        </div>
        <HarwickGlyph size={20} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {thread.tags.map((t) => (
          <span
            key={t}
            className="rounded-full px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[0.06em]"
            style={{
              background: "rgba(255,255,255,0.05)",
              color: "rgba(255,255,255,0.66)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function ThreadBody({ thread, elapsedMs }: { thread: Thread; elapsedMs: number }) {
  const visible = thread.script.filter((m) => elapsedMs >= m.atMs);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col px-3 py-3">
      <div className="mb-2 flex items-center justify-center">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/36">Today</span>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-2 overflow-hidden">
        <AnimatePresence initial={false}>
          {visible.map((m) => (
            <motion.div
              key={m.id}
              layout="position"
              initial={{ opacity: 0, y: 14, scale: 0.96, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 0.5,
                ease: [0.22, 1, 0.36, 1],
                layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
              }}
              className={cn(
                "flex flex-col gap-0.5",
                m.who === "system"
                  ? "items-center"
                  : m.who === "harwick"
                    ? "ml-auto max-w-[80%] items-end"
                    : "max-w-[78%] items-start",
              )}
            >
              {m.who === "system" ? (
                <div
                  className="rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em]"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.08)",
                    color: "rgba(247,238,221,0.55)",
                  }}
                >
                  {m.body}
                </div>
              ) : m.who === "harwick" ? (
                <>
                  <div
                    className="rounded-[14px] rounded-br-[4px] px-3 py-2 text-[12px] leading-[1.4]"
                    style={{
                      background: "linear-gradient(180deg,#9ab5aa 0%,#7a988b 100%)",
                      color: "#0c1410",
                      boxShadow: "0 0 18px -6px rgba(154,181,170,0.6)",
                    }}
                  >
                    {m.body}
                  </div>
                  <span className="inline-flex items-center gap-1 pr-1 text-[9.5px] text-white/56">
                    <Check className="size-2.5" aria-hidden="true" />
                    {m.meta}
                  </span>
                </>
              ) : (
                <>
                  <div
                    className="rounded-[14px] rounded-bl-[4px] px-3 py-2 text-[12px] leading-[1.4] text-white"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {m.body}
                  </div>
                  <span className="pl-1 text-[9.5px] text-white/40">{m.meta}</span>
                </>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ThreadComposer({ thread, elapsedMs, onApprove }: { thread: Thread; elapsedMs: number; onApprove: () => void }) {
  const draftVisible =
    thread.draft !== undefined
    && elapsedMs >= thread.draft.atMs
    && elapsedMs < thread.draft.sentAtMs;

  return (
    <div
      className="shrink-0 border-t px-3 pb-4 pt-3"
      style={{
        borderColor: "rgba(255,255,255,0.06)",
        background: "linear-gradient(180deg, rgba(11,12,13,0) 0%, #0b0c0d 30%)",
      }}
    >
      <AnimatePresence mode="wait">
        {draftVisible && thread.draft ? (
          <motion.div
            key="draft"
            initial={{ opacity: 0, y: 18, scale: 0.97, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -8, filter: "blur(2px)" }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="relative overflow-hidden rounded-[14px]"
            style={{
              background: "rgba(154,181,170,0.10)",
              border: "1px solid rgba(154,181,170,0.38)",
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.08), 0 14px 30px -16px rgba(0,0,0,0.6), 0 0 28px -6px rgba(154,181,170,0.42)",
            }}
          >
            <div className="flex items-center gap-2 px-3 pt-2.5">
              <HarwickGlyph size={16} />
              <span className="text-[9.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: "#b6d1c5" }}>
                Harwick draft · awaiting your approval
              </span>
            </div>
            <p className="px-3 pt-1.5 pb-2.5 text-[11.5px] leading-[1.45]" style={{ color: "rgba(238,243,240,0.92)" }}>
              {thread.draft.body}
            </p>
            <ApproveButton onClick={onApprove} />
          </motion.div>
        ) : (
          <motion.div
            key="listening"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2 rounded-[14px] px-3 py-2.5"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span className="text-[11px] text-white/44">Harwick is handling 53 threads…</span>
            <span className="ml-auto flex items-center gap-0.5">
              {[0, 0.15, 0.3].map((delay) => (
                <motion.span
                  key={delay}
                  className="inline-block size-1 rounded-full bg-white/40"
                  animate={{ opacity: [0.2, 1, 0.2] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay, ease: "easeInOut" }}
                />
              ))}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ApproveButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative px-3 pb-3">
      <button
        type="button"
        onClick={onClick}
        className="group relative inline-flex h-9 w-full items-center justify-center gap-1.5 overflow-hidden rounded-[10px] text-[12px] font-semibold transition active:scale-[0.98]"
        style={{
          background: "linear-gradient(180deg,#b6d1c5 0%,#8aa89a 100%)",
          color: "#0c1410",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.4), 0 10px 24px -10px rgba(154,181,170,0.55)",
        }}
      >
        <Send className="size-3" aria-hidden="true" />
        Approve &amp; send
      </button>
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 rounded-full"
        animate={{ scale: [0.6, 1.4, 0.6], opacity: [0, 0.55, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
        style={{ width: 22, height: 22, background: "rgba(255,255,255,0.4)" }}
      />
    </div>
  );
}

// =====================================================================
// Meta tables
// =====================================================================

type IconCmp = React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

const CHANNEL_META: Record<ThreadChannel, {
  label: string;
  bg: string;
  Icon: IconCmp;
}> = {
  ig_dm: {
    label: "Instagram DM",
    bg: "linear-gradient(135deg,#f09433,#dc2743,#bc1888)",
    Icon: InstagramGlyph as IconCmp,
  },
  fb_dm: {
    label: "Facebook Messenger",
    bg: "linear-gradient(135deg,#1877f2,#0866ff)",
    Icon: FacebookGlyph as IconCmp,
  },
  sms: {
    label: "SMS",
    bg: "linear-gradient(135deg,#7bcf85,#3aa44a)",
    Icon: MessageSquare,
  },
  phone: {
    label: "Phone",
    bg: "linear-gradient(135deg,#e3a067,#c98b5a)",
    Icon: Voicemail,
  },
};

const STATUS_META: Record<Thread["status"], {
  label: string;
  bg: string;
  border: string;
  fg: string;
  Icon: IconCmp;
}> = {
  active: {
    label: "active",
    bg: "rgba(123,166,255,0.16)",
    border: "rgba(123,166,255,0.4)",
    fg: "#a8c2ff",
    Icon: MessageCircle,
  },
  drafted: {
    label: "draft ready",
    bg: "rgba(154,181,170,0.16)",
    border: "rgba(154,181,170,0.4)",
    fg: "#b6d1c5",
    Icon: Send,
  },
  routed: {
    label: "routed",
    bg: "rgba(201,139,90,0.18)",
    border: "rgba(201,139,90,0.42)",
    fg: "#e3b78c",
    Icon: Phone,
  },
  review: {
    label: "owner review",
    bg: "rgba(255,180,90,0.14)",
    border: "rgba(255,180,90,0.35)",
    fg: "#ffc488",
    Icon: Check,
  },
};
