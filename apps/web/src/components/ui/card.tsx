import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../../lib/utils";

function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "rounded-[14px] border border-border bg-[linear-gradient(180deg,#fffefa_0%,#faf9f6_100%)] text-card-foreground",
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
