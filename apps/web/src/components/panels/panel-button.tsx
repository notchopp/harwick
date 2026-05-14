"use client";

import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * The unified Harwick button.
 *
 * Three weights:
 *  - `primary`  — filled white-on-dark for the main affirmative CTA in any context.
 *  - `accent`   — tonal fill (sage / clay / oxblood) for kind-aware primaries on cards.
 *  - `ghost`    — surface-2 fill + hairline border for secondary actions.
 *  - `quiet`    — borderless text button for tertiary inline actions.
 *
 * Always semibold, always at least 30-32px tall. Inset-top highlight on primary/accent
 * gives the button its hand-built weight. Do NOT reach for raw <button> in surface code;
 * use this so the system stays coherent.
 */

export type PanelButtonVariant = "primary" | "accent" | "ghost" | "quiet";
export type PanelButtonAccent = "sage" | "clay" | "oxblood";
export type PanelButtonSize = "sm" | "md" | "lg";

type PanelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: PanelButtonVariant;
  accent?: PanelButtonAccent;
  size?: PanelButtonSize;
  asChild?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const sizeClass: Record<PanelButtonSize, string> = {
  sm: "h-7 gap-1 rounded-[8px] px-2.5 text-[11.5px]",
  md: "h-8 gap-1.5 rounded-[9px] px-3 text-[12.5px]",
  lg: "h-10 gap-2 rounded-[10px] px-4 text-[13.5px]",
};

const accentClass: Record<PanelButtonAccent, string> = {
  sage: "border border-[var(--sage)]/40 bg-[var(--sage-soft)] text-[var(--sage)] hover:border-[var(--sage)]/60 hover:bg-[var(--sage-soft)]/85",
  clay: "border border-[var(--clay)]/40 bg-[var(--clay-soft)] text-[var(--clay)] hover:border-[var(--clay)]/60 hover:bg-[var(--clay-soft)]/85",
  oxblood: "border border-[var(--oxblood)]/45 bg-[var(--oxblood-soft)] text-[var(--oxblood)] hover:border-[var(--oxblood)]/65 hover:bg-[var(--oxblood-soft)]/85",
};

export function PanelButton({
  asChild,
  className,
  variant = "ghost",
  accent = "sage",
  size = "md",
  leadingIcon,
  trailingIcon,
  children,
  ...rest
}: PanelButtonProps) {
  const Component = asChild === true ? Slot : "button";
  const base = "inline-flex shrink-0 items-center justify-center font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
  const inset = "shadow-[var(--panel-inset-top)]";
  let variantClass: string;
  if (variant === "primary") {
    variantClass = cn(
      "bg-white text-[color:var(--panel-0)] hover:bg-white/92",
      inset,
    );
  } else if (variant === "accent") {
    variantClass = cn(accentClass[accent], inset);
  } else if (variant === "ghost") {
    variantClass = cn(
      "border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] text-[color:var(--graphite-text)] hover:border-[color:var(--panel-line-strong)] hover:bg-[color:var(--panel-3)]",
      inset,
    );
  } else {
    // quiet
    variantClass = "text-[color:var(--graphite-text-muted)] hover:text-[color:var(--graphite-text)]";
  }

  const composedClass = cn(base, sizeClass[size], variantClass, className);

  // When asChild={true}, Radix's Slot requires a single child. The consumer is
  // responsible for the child's internal markup; we just forward className + props.
  if (asChild === true) {
    return (
      <Component {...rest} className={composedClass}>
        {children}
      </Component>
    );
  }

  return (
    <Component {...rest} className={composedClass}>
      {leadingIcon === undefined ? null : <span className="-ml-0.5 flex shrink-0">{leadingIcon}</span>}
      <span className="min-w-0 truncate">{children}</span>
      {trailingIcon === undefined ? null : <span className="-mr-0.5 flex shrink-0">{trailingIcon}</span>}
    </Component>
  );
}
