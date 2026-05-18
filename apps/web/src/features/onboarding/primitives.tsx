"use client";

import {
  type ComponentProps,
  forwardRef,
} from "react";

import { cn } from "../../lib/utils";

/**
 * Local primitives for the dark onboarding surface. The shadcn Input/Textarea
 * primitives ship a focus-visible:bg-card style — in light theme that's near-
 * white, which collides with the onboarding's white text and makes the input
 * appear blank when focused. These wrap the underlying elements with explicit
 * dark-context background, border, and text colors so focus state stays
 * legible.
 */

export const DarkInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function DarkInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        data-slot="input"
        className={cn(
          "h-11 w-full rounded-[12px] border border-white/12 bg-white/[0.05] px-3.5 text-[14px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          "placeholder:text-white/35",
          "outline-none transition-[border-color,background-color,box-shadow] duration-150",
          "focus-visible:border-[#b8d3c5]/55 focus-visible:bg-white/[0.07] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_3px_rgba(184,211,197,0.18)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-red-400/40 aria-invalid:shadow-[0_0_0_3px_rgba(248,113,113,0.18)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const DarkTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  function DarkTextarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "field-sizing-content w-full rounded-[14px] border border-white/12 bg-white/[0.05] px-3.5 py-3 text-[14px] leading-5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
          "resize-none placeholder:text-white/35",
          "outline-none transition-[border-color,background-color,box-shadow] duration-150",
          "focus-visible:border-[#b8d3c5]/55 focus-visible:bg-white/[0.07] focus-visible:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_3px_rgba(184,211,197,0.18)]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "aria-invalid:border-red-400/40 aria-invalid:shadow-[0_0_0_3px_rgba(248,113,113,0.18)]",
          className,
        )}
        {...props}
      />
    );
  },
);

/**
 * Naked, borderless variants — used inside the area-chip container and any
 * other place where the input shouldn't draw its own border because the
 * parent already provides one.
 */

export const DarkInlineInput = forwardRef<HTMLInputElement, ComponentProps<"input">>(
  function DarkInlineInput({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        data-slot="input"
        className={cn(
          "h-7 min-w-[120px] flex-1 border-0 bg-transparent px-1 text-[13.5px] text-white shadow-none",
          "outline-none placeholder:text-white/35",
          "focus:bg-transparent focus-visible:bg-transparent focus-visible:ring-0",
          className,
        )}
        {...props}
      />
    );
  },
);

export const DarkInlineTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<"textarea">>(
  function DarkInlineTextarea({ className, ...props }, ref) {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "field-sizing-content w-full resize-none border-0 bg-transparent px-4 py-3 text-[14px] leading-5 text-white shadow-none",
          "outline-none placeholder:text-white/35",
          "focus:bg-transparent focus-visible:bg-transparent focus-visible:ring-0",
          className,
        )}
        {...props}
      />
    );
  },
);
