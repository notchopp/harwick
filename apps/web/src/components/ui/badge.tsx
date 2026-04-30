import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border px-2 py-1 text-[11px] font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-muted text-muted",
        hot: "border-oxblood/25 bg-oxblood-soft text-hot",
        warm: "border-clay/25 bg-clay-soft text-warm",
        qualified: "border-sage/25 bg-sage-soft text-qualified",
        syncing: "border-stone/25 bg-stone-soft text-syncing",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

type BadgeProps = ComponentPropsWithoutRef<"span"> &
  VariantProps<typeof badgeVariants>;

export function Badge(props: BadgeProps) {
  const { className, tone, ...badgeProps } = props;

  return (
    <span className={cn(badgeVariants({ className, tone }))} {...badgeProps} />
  );
}
