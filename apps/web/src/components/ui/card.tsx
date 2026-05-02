import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-[18px] border border-border bg-[linear-gradient(180deg,#fffefa_0%,#f8f5ef_100%)] text-card-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_16px_45px_rgba(31,42,34,0.055)]",
        className,
      )}
      data-slot="card"
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("flex items-center gap-3 border-b border-border px-[18px] py-3", className)}
      data-slot="card-header"
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("px-[18px] py-3.5", className)}
      data-slot="card-content"
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn("text-base font-medium text-foreground", className)}
      data-slot="card-title"
      {...props}
    />
  );
}

export { Card, CardContent, CardHeader, CardTitle };
