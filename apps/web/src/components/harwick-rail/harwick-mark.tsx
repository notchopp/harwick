import { cn } from "../../lib/utils";

type HarwickMarkProps = {
  size?: number;
  className?: string;
  tone?: "default" | "soft" | "ghost";
};

export function HarwickMark({ size = 18, className, tone = "default" }: HarwickMarkProps) {
  const toneClass =
    tone === "soft"
      ? "bg-[var(--brass-accent-soft,rgba(154,181,170,0.18))] ring-1 ring-inset ring-[var(--brass-accent,#9ab5aa)]/35"
      : tone === "ghost"
        ? "bg-transparent ring-1 ring-inset ring-[var(--harwick-border)]"
        : "bg-gradient-to-br from-[var(--brass-accent,#9ab5aa)]/30 to-[var(--harwick-brass,#60786d)]/15 ring-1 ring-inset ring-[var(--brass-accent,#9ab5aa)]/40";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[6px]",
        toneClass,
        className,
      )}
      style={{ width: size, height: size }}
    >
      <img
        alt=""
        src="/harwick-gemini-logo.png"
        className="size-[78%] object-contain opacity-95"
        style={{ filter: "drop-shadow(0 1px 0 rgba(0,0,0,0.18))" }}
      />
    </span>
  );
}
