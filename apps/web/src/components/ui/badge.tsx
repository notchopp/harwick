import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-muted text-muted",
        hot: "border-red-200 bg-red-50 text-hot",
        warm: "border-amber-200 bg-amber-50 text-warm",
        qualified: "border-green-200 bg-green-50 text-qualified",
        syncing: "border-blue-200 bg-blue-50 text-syncing",
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
