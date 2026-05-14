import type { HTMLAttributes } from "react";

import { cn } from "../../lib/utils";

/**
 * Bloc-inspired type primitives — engraved display numerals,
 * uppercase tracked micro-labels, and mono codes.
 *
 * Use these to keep the typography hierarchy coherent across the app
 * instead of free-styling text-[X]px on every surface.
 */

/** Display number — gradient-clip + 1px text-shadow for that "engraved" feel.
 * Use for KPI numerals (queue count, score, urgent flag). Keep the surrounding
 * body in plain text so the engraved number reads as the lifted hero. */
export function EngravedNumeral({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "bg-gradient-to-br from-white/95 via-white/60 to-white/85 bg-clip-text font-display font-semibold tracking-[-0.035em] text-transparent",
        "[font-variant-numeric:tabular-nums_slashed-zero]",
        "[text-shadow:0_1px_0_rgba(0,0,0,0.42)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Tiny uppercase tracked label. 9-10px, semibold, very muted. */
export function MicroLabel({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--graphite-text-faint)]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Mono code/ID/timestamp. 9-11px, uppercase, tracked. */
export function MonoTag({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-block font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--graphite-text-faint)] [font-variant-numeric:tabular-nums_slashed-zero]",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Kbd-style chip — paired with a label like "to send" / "to confirm". */
export function Kbd({ children, className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center justify-center rounded-[5px] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)] px-1.5 py-0.5 font-mono text-[10px] text-[color:var(--graphite-text-muted)]",
        "shadow-[var(--panel-inset-top-soft)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
