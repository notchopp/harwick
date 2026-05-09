import type { CSSProperties, ReactNode } from "react";

import { cn } from "../lib/utils";

export type HarwickSurfaceTone =
  | "command"
  | "routing"
  | "attention"
  | "memory"
  | "focus";

type HarwickSurfaceCardProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  interactive?: boolean;
  seed: string;
  style?: CSSProperties;
  tone: HarwickSurfaceTone;
};

type HarwickGlassPanelProps = {
  children: ReactNode;
  className?: string;
  seed: string;
  style?: CSSProperties;
  tone: HarwickSurfaceTone;
};

type ToneAccent = {
  borderTint: string;
  iconBackground: string;
  iconColor: string;
  textTint: string;
};

const TONE_ACCENTS: Record<HarwickSurfaceTone, ToneAccent> = {
  command: {
    borderTint: "rgba(196, 178, 128, 0.20)",
    iconBackground: "rgba(196, 178, 128, 0.13)",
    iconColor: "rgba(228, 210, 158, 0.96)",
    textTint: "rgba(228, 210, 158, 0.84)",
  },
  focus: {
    borderTint: "rgba(196, 178, 128, 0.18)",
    iconBackground: "rgba(196, 178, 128, 0.11)",
    iconColor: "rgba(228, 210, 158, 0.94)",
    textTint: "rgba(228, 210, 158, 0.78)",
  },
  routing: {
    borderTint: "rgba(126, 158, 132, 0.22)",
    iconBackground: "rgba(126, 158, 132, 0.15)",
    iconColor: "rgba(174, 198, 178, 0.96)",
    textTint: "rgba(174, 198, 178, 0.84)",
  },
  memory: {
    borderTint: "rgba(255, 255, 255, 0.10)",
    iconBackground: "rgba(255, 255, 255, 0.06)",
    iconColor: "rgba(228, 226, 218, 0.92)",
    textTint: "rgba(228, 226, 218, 0.76)",
  },
  attention: {
    borderTint: "rgba(173, 110, 112, 0.22)",
    iconBackground: "rgba(173, 110, 112, 0.16)",
    iconColor: "rgba(214, 160, 162, 0.96)",
    textTint: "rgba(214, 160, 162, 0.84)",
  },
};

const SURFACE_BACKGROUND = [
  "linear-gradient(180deg, rgba(255,255,255,0.038) 0%, rgba(255,255,255,0.014) 36%, rgba(255,255,255,0) 100%)",
  "linear-gradient(180deg, #1a1a1a 0%, #131313 100%)",
].join(", ");

const SURFACE_BORDER = "rgba(255, 255, 255, 0.075)";
const SURFACE_INNER_BORDER = "rgba(255, 255, 255, 0.045)";
const SURFACE_SHADOW = [
  "inset 0 1px 0 rgba(255,255,255,0.045)",
  "inset 0 -1px 0 rgba(0,0,0,0.32)",
  "0 14px 32px rgba(0,0,0,0.36)",
  "0 2px 6px rgba(0,0,0,0.22)",
].join(", ");

const PANEL_BACKGROUND =
  "linear-gradient(180deg, rgba(255,255,255,0.028) 0%, rgba(255,255,255,0.008) 100%)";
const PANEL_BORDER = "rgba(255, 255, 255, 0.065)";
const PANEL_SHADOW = "inset 0 1px 0 rgba(255,255,255,0.035)";

export function HarwickSurfaceCard(props: HarwickSurfaceCardProps) {
  const accent = TONE_ACCENTS[props.tone];

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-[22px] border",
        props.interactive === false ? "" : "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5",
        props.className,
      )}
      style={{
        background: SURFACE_BACKGROUND,
        borderColor: SURFACE_BORDER,
        boxShadow: SURFACE_SHADOW,
        ...props.style,
      }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-6 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent 0%, ${accent.borderTint} 50%, transparent 100%)` }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-px rounded-[21px] border"
        style={{ borderColor: SURFACE_INNER_BORDER }}
      />
      <div className={cn("relative", props.contentClassName)}>{props.children}</div>
    </div>
  );
}

export function HarwickGlassPanel(props: HarwickGlassPanelProps) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-[16px] border px-4 py-3", props.className)}
      style={{
        background: PANEL_BACKGROUND,
        borderColor: PANEL_BORDER,
        boxShadow: PANEL_SHADOW,
        ...props.style,
      }}
    >
      <div className="relative">{props.children}</div>
    </div>
  );
}

export function harwickSurfaceAccent(_seed: string, tone: HarwickSurfaceTone) {
  return TONE_ACCENTS[tone];
}
