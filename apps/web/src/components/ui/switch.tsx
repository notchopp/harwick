"use client"

import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"

import { cn } from "../../lib/utils"

function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-border bg-harwick-linen shadow-[inset_0_1px_2px_rgba(24,33,29,0.12)] transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/18 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-6 data-[size=default]:w-10 data-[size=sm]:h-5 data-[size=sm]:w-8 data-[state=checked]:border-sage/25 data-[state=checked]:bg-sage-soft data-[state=unchecked]:bg-harwick-linen",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full border border-black/5 bg-harwick-paper ring-0 shadow-[0_2px_6px_rgba(24,33,29,0.12)] transition-transform group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 data-[state=unchecked]:translate-x-[2px] data-[state=checked]:translate-x-[18px] group-data-[size=sm]/switch:data-[state=unchecked]:translate-x-[1px] group-data-[size=sm]/switch:data-[state=checked]:translate-x-[11px]"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
