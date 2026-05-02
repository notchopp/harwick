import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] font-medium leading-none shadow-[inset_0_1px_0_rgba(255,255,255,0.62),0_5px_14px_rgba(31,42,34,0.035)]",
  {
    variants: {
      tone: {
        neutral: "border-border bg-[linear-gradient(180deg,#fffefa_0%,#eeeae2_100%)] text-muted",
        hot: "border-oxblood/20 bg-[linear-gradient(180deg,#fff6f4_0%,#f4dedc_100%)] text-hot",
        warm: "border-clay/20 bg-[linear-gradient(180deg,#fff9ec_0%,#f3e4c5_100%)] text-warm",
        qualified: "border-sage/20 bg-[linear-gradient(180deg,#f4fbf7_0%,#dcece4_100%)] text-qualified",
        syncing: "border-stone/20 bg-[linear-gradient(180deg,#f8f6f1_0%,#e8e3db_100%)] text-syncing",
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
