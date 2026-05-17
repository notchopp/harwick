/**
 * Holographic plan-card material, adapted from the Bloc trading-card
 * recipe in afroplus-web. Each plan gets a unique bloom palette but they
 * all share the same 5-layer stack:
 *
 *   1. Base linear-gradient   — dark, hue-shifted stops
 *   2. Bloom layer            — 3 colored radial-gradients
 *   3. Conic holo shimmer     — rainbow at 14% opacity, screen-blended
 *   4. Metal texture          — barely-there 107° repeating lines
 *   5. Beveled edge           — inset shadows for top/bottom bevel
 *
 * Plus a `nameGradient` for polished-metal text on the price/title.
 */

export type PlanMaterial = {
  background: string;
  edgeShadow: string;
  textShimmer: string;
  ringColor: string;
  accentColor: string;
};

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) { r = c; g = x; }
  else if (hh < 120) { r = x; g = c; }
  else if (hh < 180) { g = c; b = x; }
  else if (hh < 240) { g = x; b = c; }
  else if (hh < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const conicHolo = `conic-gradient(from 0deg at 50% 50%,
  rgba(255,80,120,0.10) 0deg,
  rgba(120,80,255,0.10) 72deg,
  rgba(80,200,255,0.10) 144deg,
  rgba(80,255,180,0.10) 216deg,
  rgba(255,220,80,0.10) 288deg,
  rgba(255,80,120,0.10) 360deg)`;

const metalTexture = `repeating-linear-gradient(107deg,
  transparent 0px,
  transparent 3px,
  rgba(255,255,255,0.018) 3px,
  rgba(255,255,255,0.018) 4px)`;

type Bloom = { h: number; s: number; l: number; x: number; y: number; size: number; opacity: number };

function buildBackground(opts: {
  blooms: Bloom[];
  darkStops: string[];
  baseAngle: number;
}): string {
  const bloomLayers = opts.blooms.map((b) => {
    const [r, g, bl] = hslToRgb(b.h, b.s, b.l);
    return `radial-gradient(ellipse at ${b.x}% ${b.y}%, rgba(${r},${g},${bl},${b.opacity}) 0%, transparent ${b.size}%)`;
  });
  const base = `linear-gradient(${opts.baseAngle}deg, ${opts.darkStops[0]} 0%, ${opts.darkStops[1]} 50%, ${opts.darkStops[2]} 100%)`;
  return [conicHolo, metalTexture, ...bloomLayers, base].join(", ");
}

const edgeShadow = [
  "inset 0 1px 0 rgba(255,255,255,0.10)",
  "inset 0 -1px 0 rgba(0,0,0,0.32)",
  "inset 1px 0 0 rgba(255,255,255,0.05)",
  "inset -1px 0 0 rgba(0,0,0,0.20)",
].join(", ");

const textShimmer = `linear-gradient(170deg,
  rgba(255,255,255,0.96) 0%,
  rgba(255,255,255,0.56) 42%,
  rgba(255,255,255,0.88) 70%,
  rgba(255,255,255,0.38) 100%)`;

// Free is included in the onboarding plan picker but NOT in the marketing
// pricing section (which renders 3 cards only). Keeping it here is intentional.
export const PLAN_MATERIALS: Record<"free" | "solo" | "team" | "brokerage", PlanMaterial> = {
  // Free — cool quiet (cyan + cream), low intensity so the paid tiers visually upsell
  free: {
    background: buildBackground({
      baseAngle: 145,
      darkStops: ["#0d1213", "#0f1518", "#0c1112"],
      blooms: [
        { h: 195, s: 0.55, l: 0.55, x: 18, y: 22, size: 52, opacity: 0.42 },
        { h: 170, s: 0.45, l: 0.5, x: 78, y: 72, size: 48, opacity: 0.34 },
        { h: 215, s: 0.4, l: 0.52, x: 50, y: 92, size: 56, opacity: 0.28 },
      ],
    }),
    edgeShadow,
    textShimmer,
    ringColor: "rgba(123,166,255,0.32)",
    accentColor: "#a8c2ff",
  },

  // Solo — warm amber
  solo: {
    background: buildBackground({
      baseAngle: 132,
      darkStops: ["#15110a", "#1a1410", "#120e08"],
      blooms: [
        { h: 38, s: 0.85, l: 0.55, x: 22, y: 18, size: 50, opacity: 0.55 },
        { h: 22, s: 0.75, l: 0.52, x: 82, y: 82, size: 54, opacity: 0.42 },
        { h: 55, s: 0.7, l: 0.5, x: 50, y: 50, size: 46, opacity: 0.32 },
      ],
    }),
    edgeShadow,
    textShimmer,
    ringColor: "rgba(227,160,103,0.42)",
    accentColor: "#f0b87a",
  },

  // Team — sage (brand, most intense — this is the featured plan)
  team: {
    background: buildBackground({
      baseAngle: 118,
      darkStops: ["#0c1310", "#0e1815", "#0a120f"],
      blooms: [
        { h: 155, s: 0.6, l: 0.55, x: 18, y: 22, size: 56, opacity: 0.62 },
        { h: 175, s: 0.5, l: 0.52, x: 82, y: 75, size: 52, opacity: 0.48 },
        { h: 142, s: 0.55, l: 0.5, x: 52, y: 95, size: 58, opacity: 0.42 },
        { h: 50, s: 0.7, l: 0.6, x: 88, y: 18, size: 38, opacity: 0.34 },
      ],
    }),
    edgeShadow,
    textShimmer,
    ringColor: "rgba(154,181,170,0.55)",
    accentColor: "#b6d1c5",
  },

  // Brokerage — premium violet + gold
  brokerage: {
    background: buildBackground({
      baseAngle: 158,
      darkStops: ["#100b18", "#16101e", "#0c0815"],
      blooms: [
        { h: 268, s: 0.7, l: 0.55, x: 20, y: 20, size: 54, opacity: 0.55 },
        { h: 50, s: 0.8, l: 0.58, x: 82, y: 78, size: 48, opacity: 0.4 },
        { h: 240, s: 0.65, l: 0.5, x: 56, y: 50, size: 50, opacity: 0.38 },
      ],
    }),
    edgeShadow,
    textShimmer,
    ringColor: "rgba(183,147,230,0.48)",
    accentColor: "#c8aef0",
  },
};

export function getPlanMaterial(name: string): PlanMaterial {
  const key = name.toLowerCase() as keyof typeof PLAN_MATERIALS;
  return PLAN_MATERIALS[key] ?? PLAN_MATERIALS.team;
}
