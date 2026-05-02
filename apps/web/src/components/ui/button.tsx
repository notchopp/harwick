import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border text-[13px] font-medium outline-none transition-all duration-200 ease-out active:translate-y-px disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-harwick-ink/90 bg-[linear-gradient(180deg,#233729_0%,#132218_100%)] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_9px_22px_rgba(19,34,24,0.18)] hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_14px_28px_rgba(19,34,24,0.2)]",
        destructive:
          "border-oxblood/80 bg-[linear-gradient(180deg,#b34c4c_0%,#862e2e_100%)] text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_10px_24px_rgba(155,58,58,0.16)] hover:-translate-y-0.5 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border-border bg-[linear-gradient(180deg,#fffefa_0%,#f3f0ea_100%)] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_7px_18px_rgba(31,42,34,0.055)] hover:-translate-y-0.5 hover:border-border-strong hover:bg-[linear-gradient(180deg,#ffffff_0%,#eeeae2_100%)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_11px_24px_rgba(31,42,34,0.08)] dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "border-border bg-[linear-gradient(180deg,#f7f4ee_0%,#e9e5dc_100%)] text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_7px_18px_rgba(31,42,34,0.045)] hover:-translate-y-0.5 hover:border-border-strong hover:bg-[linear-gradient(180deg,#fbf8f2_0%,#e6e1d8_100%)]",
        ghost:
          "border-transparent bg-transparent text-muted shadow-none hover:bg-harwick-linen/75 hover:text-foreground",
        link: "border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 rounded-[11px] px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-[8px] px-2 text-[11px] has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[10px] px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-[12px] px-6 has-[>svg]:px-4",
        icon: "size-9 rounded-[11px]",
        "icon-xs": "size-6 rounded-[8px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 rounded-[10px]",
        "icon-lg": "size-10 rounded-[12px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
