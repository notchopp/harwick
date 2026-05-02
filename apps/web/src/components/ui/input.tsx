import * as React from "react"

import { cn } from "../../lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-[12px] border border-border bg-[linear-gradient(180deg,#fffefa_0%,#f3f0ea_100%)] px-3 py-1 text-base text-foreground shadow-[inset_0_1px_2px_rgba(31,42,34,0.055),0_1px_0_rgba(255,255,255,0.72)] outline-none transition-[border-color,box-shadow,background-color] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-subtle disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-harwick-brass focus-visible:ring-[3px] focus-visible:ring-harwick-brass/18",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
