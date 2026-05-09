"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import * as TogglePrimitive from "@radix-ui/react-toggle"

import { cn } from "../../lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[10px] border border-transparent text-sm font-medium whitespace-nowrap text-harwick-ink-soft transition-[color,background-color,border-color,box-shadow] outline-none hover:bg-harwick-paper hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/18 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=on]:border-border-strong data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-[0_1px_0_rgba(255,255,255,0.5),0_8px_18px_rgba(44,45,38,0.05)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border-0 bg-transparent shadow-none hover:bg-harwick-paper hover:text-accent-foreground",
      },
      size: {
        default: "h-9 min-w-9 px-3",
        sm: "h-8 min-w-8 px-2.5",
        lg: "h-10 min-w-10 px-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
