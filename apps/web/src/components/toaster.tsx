"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      richColors={false}
      closeButton={false}
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            "group rounded-[var(--panel-radius-md)] border border-[color:var(--panel-line-strong)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text)] shadow-[var(--panel-inset-top),0_18px_44px_-12px_rgba(0,0,0,0.6)] backdrop-blur",
          title: "text-[13px] font-semibold tracking-[-0.005em] text-[color:var(--graphite-text)]",
          description: "text-[12px] leading-5 text-[color:var(--graphite-text-muted)]",
          actionButton:
            "rounded-[8px] bg-white px-2 py-1 text-[11.5px] font-semibold text-[color:var(--panel-0)]",
          cancelButton:
            "rounded-[8px] border border-[color:var(--panel-line)] bg-[color:var(--panel-3)] px-2 py-1 text-[11.5px] font-semibold text-[color:var(--graphite-text-muted)]",
          success:
            "border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)]",
          error:
            "border-[var(--oxblood)]/45 bg-[var(--oxblood-soft)] text-[var(--oxblood)]",
          warning:
            "border-[var(--clay)]/40 bg-[var(--clay-soft)] text-[var(--clay)]",
          icon: "size-4",
        },
      }}
    />
  );
}
