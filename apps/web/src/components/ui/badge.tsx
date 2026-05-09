import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap transition-[color,box-shadow,border-color,background-color] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/14 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground [a&]:hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
      tone: {
        neutral: "bg-card text-harwick-ink-soft",
        green: "bg-sage-soft text-sage",
        qualified: "bg-sage-soft text-sage",
        amber: "bg-clay-soft text-warm",
        warm: "bg-clay-soft text-warm",
        red: "bg-oxblood-soft text-oxblood",
        hot: "bg-oxblood-soft text-oxblood",
        stone: "bg-muted text-muted-foreground",
        syncing: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
      tone: "neutral",
    },
  }
)

function Badge({
  className,
  variant = "default",
  tone = "neutral",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-tone={tone}
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
