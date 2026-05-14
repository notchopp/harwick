"use client";

import { Mic } from "lucide-react";

/**
 * Small voice trigger that lives on every screen and routes to /v?voice=1.
 * On mobile it sits above the bottom-nav with safe-area insets, on desktop
 * it floats bottom-left so it doesn't fight the rail (which is bottom-right).
 */
export function VoiceTrigger() {
  return (
    <a
      href="/v?voice=1"
      aria-label="Talk to Harwick"
      className="harwick-voice-trigger fixed z-40 flex size-12 items-center justify-center rounded-full border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text)] shadow-[var(--panel-inset-top),0_12px_28px_-6px_rgba(0,0,0,0.55),0_2px_4px_rgba(0,0,0,0.3)] backdrop-blur transition active:scale-95"
      style={{
        // Mobile: above bottom nav + safe-area. Desktop: bottom-left.
        // We use CSS custom props so the mobile/desktop split is one rule each.
        left: "max(1rem, env(safe-area-inset-left))",
        bottom: "calc(env(safe-area-inset-bottom, 0) + 5rem)",
      }}
    >
      <Mic className="size-5" aria-hidden="true" strokeWidth={1.9} />
      <span className="sr-only">Voice</span>
    </a>
  );
}
