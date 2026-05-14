import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * The Harwick panel system — four levels of nested rounded surfaces.
 *
 * L0 (page) is just the body background — no border, no radius.
 * L1 (Shell) = sidebar, main workspace panel. Rounded large, hairline border + inset-top highlight.
 * L2 (Section) = kanban column, queue group, sub-pane inside a Shell.
 * L3 (Card) = lead card, queue item, list row card.
 *
 * Each level uses `--panel-N` fill (one tick lighter than its parent),
 * `--panel-line` hairline border, the inset-top highlight from `--panel-inset-top`,
 * and a matching `--panel-radius-*`. Depth comes from the border + radius pairing,
 * not background shifts. Never bypass this with hand-picked hex.
 */

type PanelTone = "raised" | "flat";

type ShellProps = HTMLAttributes<HTMLDivElement> & {
  asChild?: never;
  inner?: boolean;
  tone?: PanelTone;
};

export function Shell({ children, className, tone = "raised", inner, ...rest }: ShellProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-[var(--panel-radius-lg)] border border-[color:var(--panel-line)] bg-[color:var(--panel-1)]",
        tone === "raised"
          ? "shadow-[var(--panel-inset-top),var(--panel-shadow-lift)]"
          : "shadow-[var(--panel-inset-top-soft)]",
        inner === true ? "overflow-hidden" : null,
        className,
      )}
    >
      {children}
    </div>
  );
}

type SectionProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  title?: ReactNode;
  trailing?: ReactNode;
  eyebrow?: ReactNode;
  bodyClassName?: string;
};

/** A sub-section inside a Shell. Used for kanban columns, queue groups. */
export function Section({ children, className, title, trailing, eyebrow, bodyClassName, ...rest }: SectionProps) {
  return (
    <div
      {...rest}
      className={cn(
        "flex flex-col rounded-[var(--panel-radius-md)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)]",
        "shadow-[var(--panel-inset-top-soft)]",
        className,
      )}
    >
      {title === undefined && trailing === undefined && eyebrow === undefined ? null : (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--panel-line-soft)] px-4 py-3">
          <div className="min-w-0">
            {eyebrow === undefined ? null : (
              <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--graphite-text-faint)]">
                {eyebrow}
              </div>
            )}
            {title === undefined ? null : (
              <div className="text-[13.5px] font-semibold text-[color:var(--graphite-text)]">{title}</div>
            )}
          </div>
          {trailing === undefined ? null : <div className="flex shrink-0 items-center gap-1.5">{trailing}</div>}
        </div>
      )}
      <div className={cn("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </div>
  );
}

type CardProps = HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

/** An L3 card — the smallest panel, used for individual lead/queue/listing items.
 * Carries the double-stroke: hairline border + inset-top highlight, plus a soft drop. */
export function Card({ children, className, interactive, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-[var(--panel-radius-sm)] border border-[color:var(--panel-line)] bg-[color:var(--panel-2)]",
        "shadow-[var(--panel-inset-top),var(--panel-shadow-card)]",
        interactive === true
          ? "cursor-pointer transition hover:border-[color:var(--panel-line-strong)] hover:bg-[color:var(--panel-3)]"
          : null,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A tiny pure-content panel for inset blocks inside Cards (drafts, quotes, fact panels).
 * Smaller radius, no shadow lift, single hairline. */
export function Inset({ children, className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={cn(
        "rounded-[var(--panel-radius-xs)] border border-[color:var(--panel-line-soft)] bg-[color:var(--panel-3)]/40",
        "shadow-[var(--panel-inset-top-soft)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
